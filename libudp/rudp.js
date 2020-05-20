var net = require('dgram');
const EventEmitter = require('events');

var MessageControl = require('./messageControl');
var common = require('./common');

// Expose API
module.exports = {
	createSocket: function () {
		const rudp = new EventEmitter();
		rudp.connection = null;
		rudp.messagesPendingAck = [];
		rudp.connection = net.createSocket("udp4");
		rudp.messageControl = new MessageControl(rudp.connection, (msg, rinfo) => {
			console.log('Received message!')
			rudp.emit('message', msg, rinfo);
		});
		rudp.bind = function () {
			rudp.connection.bind();
		}
		rudp.address = function () {
			return rudp.connection.address();
		}
		rudp.send = function (message, port, address, callback) {
			rudp.messageControl.send(message, address, port, callback);
		}

		rudp.connection.on("listening", (x) => {
			rudp.emit("listening", x);
		});
		rudp.connection.on("error", (x) => {
			rudp.emit("error", x);
		});
		rudp.connection.on("close", (x) => {
			rudp.emit("close", x);
		});
		return rudp;
	}
};

