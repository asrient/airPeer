const Emitter = require("component-emitter");
const crypto = require('crypto');
const util = require("./util.js")
const Ws = require('./ws.js')
const Local = require('./local.js');
const { AirId } = require("./util.js");

class AirPeer extends Emitter {
    static getIpAddrs() {
        return util.getIpAddrs()
    }
    _replies = new Emitter;
    constructor({ appName, deviceName, uid, ipAddr, host }) {
        super()
        if (appName && uid && host) {
            if (!ipAddr) {
                ipAddr = util.getIpAddr();
            }
            if (!deviceName) {
                deviceName = util.getDeviceName();
            }
            var port = 80;
            if (host.split(':')[1] != undefined) {
                port = parseInt(host.split(':')[1]);
                host = host.split(':')[0];
            }
            this.ws = Ws(uid, host, port);
            this.local = Local(appName, deviceName, uid, host, ipAddr);
            this.ws.on("request", (req) => {
                //console.log("new req from ws");
                this.emit("request", this._receiveRequest(req.key, req.message));
            })

            this.ws.on("response", (res) => {
                //console.log("new res from ws");
                this._replies.emit(res.key, res.message);
            })

            this.local.on("request", (req) => {
                // console.log("new req from local");
                this.emit("request", this._receiveRequest(req.key, req.message));
            })

            this.local.on("response", (res) => {
                //console.log("new res from local");
                this._replies.emit(res.key, res.message);
            })

            this.ws.on("connection", (airId) => {
                api.emit("connection", airId);
            })

            this.ws.on("disconnection", (airId) => {
                this.emit("disconnection", airId);
            })

            this.local.on("localPeerFound", (rec) => {
                this.emit("localPeerFound", rec);
            })
        }
        else
            console.error("Required Arguments Missing")
    }
    stop() {
        this.local.stop();
        this.ws.stop();
    }
    get airIds() {
        return {
            ws: this.ws.airId,
            local: this.local.airId,
        }
    }
    request(to, body, cb = function () { }) {
        var key = crypto.randomBytes(8);
        var toId = AirId(to);
        if (toId.isLocal)
            this.local.request(to, key, body);
        else
            this.ws.request(to, key, body);

        this._replies.on(key, (res) => {
            var fromId = res.from;
            if (toId.uid == fromId.uid && toId.host == fromId.host) {
                delete res.key;
                res.parseBody = () => {
                    res.body = Buffer.from(res.body).toString();
                }
                cb(res);
            }
        })
    }
    _receiveRequest(key, msg) {
        var from = msg.from;
        msg.parseBody = () => {
            msg.body = Buffer.from(msg.body).toString();
        }
        msg.respond = (status = 200, body) => {
            if (status == undefined || status == null) {
                status = 200;
            }
            if (!from.isLocal) {
                this.ws.reply(from, key, status, body);
            }
            else {
                this.local.reply(from, key, status, body);
            }
        }
        return msg;
    }
}


module.exports = AirPeer;