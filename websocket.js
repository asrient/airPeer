const net = require('net');
const Emitter = require("component-emitter");
const message = require('./msg.js');

var api = {
    isInit: false,
    willDisconnect: false,
    isUpgraded: false,
    retries: 0,
    host: "airbroker.herokuapp.com",
    port: 80,
    socket: null,
    uid: null,
    sessionId: null,
    reconnect: function () {
        if (this.isInit && !this.willDisconnect) {
            this.isUpgraded = false;
            this.sessionId = null;
            this.socket = null;
            this.retries++;
            if (this.retries <= 10) {
                console.log("reconnecting...");
                this.connect();
            }
            else{
                console.error("No internet connection");
                api.emit('disconnection');
                setTimeout(()=>{
                    this.retries = 5;
                    this.reconnect();
                },10000)
            }
        }
    },
    connect: function () {
        this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
            // 'connect' listener.
            console.log('connected to server! Upgrading..');
            this.socket.write("GET / HTTP/1.1\r\n" +
                "Host: " + this.host + "\r\n" +
                "Upgrade-Insecure-Requests: 1\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
                "\r\n");
        });
        this.socket.on("data", (msg) => {
            if (!this.isUpgraded) {
                var str = Buffer.from(msg).toString();
                var title = str.split("\r\n")[0];
                if (title == "HTTP/1.1 101 Switching Protocols") {
                    console.log("upgraded! now connecting...");
                    this.socket.write(message.build({ type: 'connect', uid: this.uid }));
                    this.isUpgraded = true;
                }
                else {
                    console.error("not upgraded yet!", title);
                }
            }
            else {
                //already upgraded
                msg = message.parse(msg);
                if (msg.type != undefined) {
                    if (msg.type == 'connected') {
                        var airId = msg.airid;
                        this.sessionId = airId.split(':')[2];
                        this.retries = 0;
                        console.log("connected!.", airId);
                        api.emit('connection', airId);
                    }
                    else if (msg.type == 'request') {
                        api.emit('request', msg);
                    }
                    else if (msg.type == 'response') {
                        api.emit('response', msg);
                    }
                }
            }
        })
        this.socket.on("error", (msg) => {
            console.error(msg);
            this.reconnect();
        })
        this.socket.on("close", (msg) => {
            console.log("socket closed!");
            this.reconnect();
        })
        this.socket.on("end", (msg) => {
            console.log("socket ended!");
        })
    },
    start: function (uid, host, port = 80) {
        this.uid = uid;
        this.host = host,
            this.port = port;
        if (!this.isInit) {
            this.connect();
        }
        this.isInit = true;
    },
    stop: function () {
        this.isUpgraded = false;
        this.sessionId = null;
        this.socket = null;
        this.willDisconnect = true;
    },
    request: function (to, key, body = null) {
        this.socket.write(message.build({ type: 'request', to, key, body }));
    },
    reply: function (to, key, status = 200, body = null) {
        this.socket.write(message.build({ type: 'response', to, key, status, body }));
    }
}

Emitter(api);

module.exports = api;