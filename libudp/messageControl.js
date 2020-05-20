var SeqNo = require('./seqno');
var udp = require('dgram');
var util = require('./common');

var PACKET_HEADER_SIZE = 4;
var RESEND_TIME_WINDOW = 50;
var ACK_PORT = 16407;
var ACKED = 0;

var recs = {};

var socket = null;
var msgCb = function () { };

function MessageControl(sock, cb) {
	socket = sock;
	msgCb = cb || msgCb;
	socket.on("message", function (msg, rinfo) {
		if (!isMsgACK(msg)) {
			var seqNo = msg.readUInt32BE(1);
			var message = msg.slice(5);
			handleIncomingMessage(rinfo.address + ':' + rinfo.port, seqNo, message);
			sendACK(rinfo.address, rinfo.port, seqNo);
		}
		else {
			receiveACK(rinfo.address + ':' + rinfo.port, msg);
		}
	});
}

function roamMessage(addr, ack, msg) {
	recs[addr].roaming[ack] = msg;
	var flag = Object.keys(recs[addr].roaming).findIndex((_ack, ind) => { return ind && recs[addr].roaming[_ack - 1] == undefined });
	if (flag == -1) {
		//all sorted
		var msgs = [];
		var acks = Object.keys(recs[addr].roaming);
		acks = acks.sort();
		acks.forEach((_ack) => {
			msgs.push(recs[addr].roaming[_ack]);
		})
		recs[addr].roaming = {};
		recs[addr].lastACK = acks[acks.length - 1];
		recs[addr].willRoam = false;
		dispatchMessages(addr, msgs);
		console.log("roam release",acks);
		console.log('-----------ROAM COMPLATED----------')
	}
}

function handleIncomingMessage(addr, ack, msg) {
	console.log('handling incoming msg..');
	if (recs[addr] != undefined) {
		if (recs[addr].willRoam) {
			console.log('roaming msg..');
			if (recs[addr].lastACK < ack) {
				recs[addr].lastACK = ack;
			}
			roamMessage(addr, ack, msg)
		}
		else {
			console.log('msg may not roam', recs[addr].lastACK, ack);
			if (recs[addr].lastACK + 1 == ack) {
				recs[addr].lastACK++;
				console.log('msg will not roam');
				dispatchMessages(addr, [msg]);
			}
			else if (recs[addr].lastACK + 1 < ack) {
				recs[addr].willRoam = true;
				console.log('--------------ROAM-------------');
				if (recs[addr].lastACK < ack) {
					recs[addr].lastACK = ack;
				}
				roamMessage(addr, ack, msg);
			}
		}
	}
	else {
		console.log("setting up new addr rec");
		recs[addr] = {
			roaming: {},
			willRoam: false,
			lastACK: ack,
			pendingACKs: {}
		}
		dispatchMessages(addr, [msg]);
	}
}

function dispatchMessages(addr, msgs) {
	console.log('dispatching msgs..');
	msgs.forEach((msg) => {
		msgCb(msg, { address: addr.split(':')[0], port: addr.split(':')[1] })
	})
}

function createRUDPPacket(addr, message) {
	console.log("building msg");
	if (recs[addr] == undefined) {
		console.log("new addr!");
		recs[addr] = {
			roaming: {},
			willRoam: false,
			lastACK: -1,
			pendingACKs: {}
		}
	}
	var msgSize = message.length;
	var firstByte = Buffer.alloc(1);
	firstByte.fill(0);
	var seqno = ++recs[addr].lastACK;
	recs[addr].pendingACKs[seqno] = 1;
	var header = Buffer.allocUnsafe(PACKET_HEADER_SIZE);
	header.writeUInt32BE(seqno, 0);
	var packet = Buffer.concat([firstByte, header, message]);
	return packet;
}

function ackReceived(addr, ack) {
	console.log("ack received!", ack, addr);
	delete recs[addr].pendingACKs[ack];
}

function isMessageWaitingAck(addr, ack) {
	return recs[addr].pendingACKs[ack];
}

function ensureDelivery(seqNo, bufferedMessage, address, port) {
	console.log("sending msg", seqNo);
	var addr = address + ':' + port;
	socket.send(bufferedMessage, 0, bufferedMessage.length, port, address, function (err) {
		if (err == null) {
			setTimeout(function () {
				if (isMessageWaitingAck(addr, seqNo) != undefined) {
					recs[addr].pendingACKs[seqNo]++;
					if (recs[addr].pendingACKs[seqNo] < 10) {
						console.log("resending msg", seqNo)
						ensureDelivery(seqNo, bufferedMessage, address, port);
					}
					else {
						console.log("Not resending anymore", seqNo);
					}
				}
			}, RESEND_TIME_WINDOW);
		}
	});
}

function sendACK(address, port, seqno) {
	console.log("sending ACK");
	var ack = seqno;
	var firstByte = Buffer.alloc(1);
	firstByte.fill(1);
	var ackBuff = Buffer.allocUnsafe(4);
	ackBuff.writeUInt32BE(ack, 0);
	var response = Buffer.concat([firstByte, ackBuff]);
	socket.send(response, 0, response.length, port, address);
}

MessageControl.prototype.send = function (message, address, port, callback) {
	var addr = address + ':' + port;
	var rudpMessage = createRUDPPacket(addr, message);
	var seqNo = recs[addr].lastACK;
	console.log('ack:', seqNo);
	ensureDelivery(seqNo, rudpMessage, address, port);
}

function isMsgACK(msg) {
	const firstByte = msg.readUInt8(0);
	return firstByte;
}

function receiveACK(addr, msg) {
	var seqNo = msg.readUInt32BE(1);
	ackReceived(addr, seqNo);
}

// Expose API
module.exports = MessageControl;

