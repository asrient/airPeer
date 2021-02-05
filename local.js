const net = require('net');
const EventEmitter = require('events');
const mdns = require('multicast-dns')();
const crypto = require('crypto');
const frame = require('./frame.js');
const os = require('os');
const message = require('./msg.js');
const { AirId } = require("./util.js")
const util = require("./util.js")

const frameSize = util.c.FRAME_SIZE;
const VERSION = util.c.VERSION;

class Socket {
    constructor(ip, port) {
        this.isConnected = false;
        this.ip = ip;
        this.port = port;
        this.socket = net.createConnection({ port: this.port, host: this.ip }, () => {
            //console.log('socket connected to server!');
            this.isConnected = true;
        })
        this.socket.setNoDelay(true);
        this.socket.on('end', () => {
            this.isConnected = false;
        })
        this.socket.on('error', (err) => {
            console.error(err);
            this.isConnected = false;
        })
        this.socket.on('close', () => {
            this.isConnected = false;
        })
    }
    send(msg) {
        this.socket.write(msg);
    }
    end() {
        this.socket.end();
    }
}

class Local extends EventEmitter {
    isInit = false
    _server = null
    airId = null
    _processMdnsRecord(record) {
        var data = {};
        record.data.forEach((rec) => {
            var r = Buffer.from(rec).toString().split('=');
            data[r[0].trim()] = r[1].trim();
        })
        if (data.uid && data.host && data.sessionId && data.ver == VERSION) {
            var resAirId = new AirId(data.uid, data.host, data.sessionId);
            //console.log('Local peer', resAirId)
            this.emit('localPeerFound', { airId: resAirId, appName: this.appName, deviceName: data.deviceName });
        }
    }
    start(ipAddr) {
        this._server = net.createServer(this._handleConnection);
        this._server.on('error', (err) => {
            console.error(err);
        });
        this._server.listen(() => {
            //console.log('server listening', this._server.listening);
            this.airId.sessionId = ipAddr + '#' + this._server.address().port;
            mdns.on('response', (response) => {
                response.answers.forEach(ans => {
                    //console.log('mdns ans',ans)
                    if (ans.name === this.appName + '.air.local' && ans.type == 'TXT') {
                        this._processMdnsRecord(ans)
                    }
                });
            })
            mdns.on('query', (query) => {
                if (query.questions[0] && query.questions[0].name === this.appName + '.air.local' && query.questions[0].type == 'TXT') {
                    if (query.questions[0].data)
                        this._processMdnsRecord(query.questions[0])
                    this.broadcast();
                }
            })
            this.query();
        });
    }
    stop() {
        if (this._server) {
            this._server.close();
            this.airId.sessionId = null;
        }
    }
    set ipAddr(ip) {
        if (this._server)
            this.stop();
        this.start(ip)
    }
    get ipAddr() {
        return this.airId.ipAddr
    }
    constructor(appName, deviceName, uid, host, ipAddr) {
        super();
        this.appName = appName;
        this.deviceName = deviceName;
        this.airId = new AirId(uid, host)
        this.start(ipAddr);
        this.isInit = true;
    }
    get _mdnsRec() {
        return [
            'ver=' + VERSION,
            'uid=' + this.airId.uid,
            'host=' + this.airId.host,
            'sessionId=' + this.airId.sessionId,
            'deviceName=' + this.deviceName
        ]
    }
    query() {
        console.log('sending query')
        mdns.query({
            questions: [{
                name: this.appName + '.air.local',
                type: 'TXT',
                data: this._mdnsRec
            }]
        })
    }
    broadcast() {
        console.log('broadcasting..')
        if (this._server)
            mdns.respond({
                answers: [{
                    name: this.appName + '.air.local',
                    type: 'TXT',
                    data: this._mdnsRec
                }]
            })
    }
    _connDone (socket, key, m) {
        console.log('msg from local client', m);
        socket.end();
        if (m.from == undefined && m.uid && m.host && m.sessionid) {
            var airId = new AirId(m.uid, m.host, m.sessionid);
            //console.log('AIRID',airId,m)
        }
        else {
            var airId = new AirId(m.from);
        }
        if (airId.isLocal) {
            if (m.type == 'request') {
                this.emit('request', { key, message: m });
            }
            else if (m.type == 'response') {
                this.emit('response', { key, message: m });
            }
        }
        else {
            console.log("got a msg from global address in local server", address + ':' + port, m.type, m.from, m.body.length);
        }
    }
    _handleConnection(socket) {
        /////////////////////////////
        var address = socket.remoteAddress;
        var port = socket.remotePort;
        if (net.isIPv6(address)) {
            address = address.split('::ffff:')[1];
        }
        console.log('client connected', address + ':' + port);

        var roaming = null;
        var ongoing = null;

        //console.log('client connected', address + ':' + port);
        socket.on('end', () => {
            //console.log('client disconnected');
        });
        socket.on('data', (msg) => {
            var feed = msg;
            if (roaming != null) {
                feed = Buffer.concat([roaming, msg]);
            }
            const parsedFrame = frame.parse(feed);
            roaming = parsedFrame.roaming;
            parsedFrame.chunks.forEach((chunk) => {
                var key = chunk.key;
                var fin = chunk.fin;
                var data = chunk.data;
                if (ongoing != null) {
                    var stream = ongoing.data;
                    ongoing.count++;
                    console.log("storing chunk", ongoing.count, ' size: ' + data.length);
                    ongoing.data = Buffer.concat([stream, data]);
                    if (fin) {
                        var m = message.parse(ongoing.data);
                        this._connDone(socket, key, m);
                        ongoing = null;
                    }
                    else {
                        //now is a good time to emit events for partial data receiving
                    }
                }
                else {
                    if (fin) {
                        var m = message.parse(data);
                        this._connDone(socket, key, m);
                    }
                    else {
                        //more chunks r supposed to arrive, for reference store this chunk in ongoing
                        ongoing = { data, count: 1 };
                    }
                }
            })

        });
    }
    _sendFrame(key, msg, ip, port) {
        console.log('sending frame', msg.toString(), ip, port)
        var offset = 0;
        var last = msg.length - 1;
        var end = 0;
        var chunk;
        var fin = false;
        var count = 0;
        var socket = new Socket(ip, port);
        const send = () => {
            if (offset < last) {
                end = offset + frameSize - 50;//
                if (end > last) {
                    end = last;
                }
                chunk = msg.slice(offset, end);
                fin = false;
                if (end == last) {
                    fin = true;
                }
                var frm = frame.build(fin, key, chunk);
                count++;
                console.log("sending chunk", count, frm.length);
                socket.send(frm, port, ip);
                offset = end;
            }
            else
                console.error('local: offset > last', offset, last);
        }
        const schedule = () => {
            if (!fin) {
                //console.log('SCHEDULING..');
                send();
                schedule();
            }
        }
        if (msg.length > frameSize) {
            //size too large to be sent together, break them up!
            send();
            if (!fin) {
                schedule();
            }
            socket.end();
            console.log('Message sent!');
        }
        else {
            //msg can be sent at once
            socket.send(frame.build(true, key, msg));
            socket.end();
        }
    }
    request(to, key, body = null) {
        this._sendFrame(key, message.build({ type: 'request', to, from: this.airId, body }), to.ipAddr, to.port);
    }
    reply(to, key, status = 200, body = null) {
        this._sendFrame(key, message.build({ type: 'response', to, from: this.airId, status, body }), to.ipAddr, to.port);
    }
}


module.exports = Local;