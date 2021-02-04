const net = require('net');
const Emitter = require("component-emitter");
const message = require('./msg.js');
const crypto = require('crypto');
const frame = require('./frame.js');
const { AirId } = require("./util.js")

const frameSize = 64535;//65535;

class Ws extends Emitter {
    _ongoing = {}
    _roaming = null
    _isInit = false
    _willDisconnect = false
    _isUpgraded = false
    _retries = 0
    _port = 80
    _socket = null
    airId = null
    reconnect() {
        if (this._isInit && !this._willDisconnect) {
            this._isUpgraded = false;
            this.airId.sessionId = null;
            this._socket = null;
            this._ongoing = {};
            this._retries++;
            if (this._retries < 4) {
                console.log("reconnecting...");
                this.connect();
            }
            else {
                console.error("No Internet Connection");
                api.emit('disconnection');
                this._retries = 0;
                setTimeout(() => {
                    this.reconnect();
                }, 40000)
            }
        }
    }
    _write(stuffs) {
        if (stuffs != null && this._socket != null) {
            this._socket.cork();
            this._socket.write(stuffs);
            this._socket.uncork();
        }
    }
    cork() {
        if (this._socket != null) {
            this._socket.cork();
        }
    }
    uncork() {
        if (this._socket != null) {
            this._socket.uncork();
        }
    }
    connect() {
        if(this._socket)
        this.stop();
        this._willDisconnect = false;
        this._socket = net.createConnection({ host: this.airId.host, port: this._port }, () => {
            // 'connect' listener.
            console.log('connected to server! Upgrading..');
            this._write("GET / HTTP/1.1\r\n" +
                "Host: " + this.airId.host + "\r\n" +
                "Upgrade-Insecure-Requests: 1\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "\r\n");
        });
        this._socket.setNoDelay(true);
        //this._socket.uncork();
        this._socket.on("data", (msg) => {
            if (!this._isUpgraded) {
                var str = Buffer.from(msg).toString();
                var title = str.split("\r\n")[0];
                if (title == "HTTP/1.1 101 Switching Protocols") {
                    console.log("upgraded! now connecting...");
                    this._write(frame.build(true, crypto.randomBytes(8), message.build({ type: 'connect', uid: this.airId.uid })));
                    this._isUpgraded = true;
                }
                else {
                    console.error("not upgraded yet!", title);
                }
            }
            else {
                //already upgraded
                var feed = msg;
                if (this._roaming != null) {
                    feed = Buffer.concat([this._roaming, msg]);
                }
                const parsedFrame = frame.parse(feed);
                this._roaming = parsedFrame.roaming;
                parsedFrame.chunks.forEach((chunk) => {
                    var key = chunk.key;
                    var fin = chunk.fin;
                    var data = chunk.data;
                    if (this.sessionId == null) {
                        //not connected yet!
                        var m = message.parse(data);
                        if (m.type == 'connected') {
                            this.airId = m.airid;
                            this._retries = 0;
                            this._ongoing = {};
                            console.log("connected!", this.airId.str);
                            api.emit('connection', this.airId);
                        }
                    }
                    else {
                        if (this._ongoing[key] != undefined) {
                            var stream = this._ongoing[key].data;
                            this._ongoing[key].data = Buffer.concat([stream, data]);
                            if (fin) {
                                var m = message.parse(this._ongoing[key].data);
                                if (m.type != undefined) {
                                    if (m.type == 'request') {
                                        api.emit('request', { key, message: m });
                                    }
                                    else if (m.type == 'response') {
                                        api.emit('response', { key, message: m });
                                    }
                                }
                                delete this._ongoing[key];
                            }
                            else {
                                //now is a good time to emit events for partial data receiving
                            }
                        }
                        else {
                            if (fin) {
                                var m = message.parse(data);
                                if (m.type != undefined) {

                                    if (m.type == 'request') {
                                        api.emit('request', { key, message: m });
                                    }
                                    else if (m.type == 'response') {
                                        api.emit('response', { key, message: m });
                                    }
                                }
                            }
                            else {
                                //more chunks r supposed to arrive, for reference store this chunk in ongoing
                                this._ongoing[key] = { data };
                            }
                        }
                    }
                })
            }
        })
        this._socket.on("error", (msg) => {
            console.error(msg);
            //this.reconnect();
        })
        this._socket.on("close", (msg) => {
            console.log("socket closed!");
            this.reconnect();
        })
        this._socket.on("end", (msg) => {
            console.log("socket ended!");
        })
    }
    constructor(uid, host, port = 80) {
        super()
        this.airId = AirId(uid,host);
        this._port = port;
        if (!this._isInit) {
            this.connect();
        }
        this._isInit = true;
    }
    stop() {
        this._isUpgraded = false;
        this.airId.sessionId = null;
        this._socket = null;
        this._willDisconnect = true;
        this._ongoing = {};
    }
    _sendFrame(key, msg) {
        var offset = 0;
        var last = msg.length - 1;
        var end = 0;
        var chunk;
        var fin = false;

        const send = () => {
            if (offset < last) {
                //console.log("---sending a chunk---");
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
                //console.log('FIN', fin);
                //console.log('KEY', key.toString());
                this._write(frm);
                offset = end;
                //console.log('--------------------')
            }
            else
                console.error('local: offset > last', offset, last);
        }

        const schedule = () => {
            if (!fin) {
                console.log('SCHEDULING..');
                send();
                schedule();
            }
        }

        if (msg.length > frameSize) {
            //size too large to be sent together, break them up!
            console.log('size too large to be sent together, break them up!');
            send();
            if (!fin) {
                schedule();
            }
        }
        else {
            //msg can be sent at once
            this._write(frame.build(true, key, msg));
        }
    }
    request(to, keyStr, body = null) {
        //console.log('-----building new request-------');
        var key = Buffer.from(keyStr);
        var msg = message.build({ type: 'request', to, body });
        this._sendFrame(key, msg);
    }
    reply(to, keyStr, status = 200, body = null) {
        //console.log('-----building new response-------');
        var key = Buffer.from(keyStr);
        var msg = message.build({ type: 'response', to, status, body });
        this._sendFrame(key, msg)
    }
}

module.exports = Ws;