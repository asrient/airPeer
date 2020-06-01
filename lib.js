const Emitter = require("component-emitter");
const crypto = require('crypto');
const ws = require("./websocket.js");
const local = require("./local.js");

function parseAirId(airId) {
    var ids = airId.split(':');
    return {
        uid: ids[0],
        host: ids[1],
        sessionId: ids[2]
    }
}

function keyGen(n = 2) {
    return crypto.randomBytes(n).toString('hex');
}

var replies = new Emitter;

var api = {
    uid: null,
    host: null,
    app: null,
    name: null,
    start: function (uid, host, app, name) {
        var port = 80;
        if (host.split(':')[1] != undefined) {
            port = parseInt(host.split(':')[1]);
            host = host.split(':')[0];
        }
        this.uid = uid;
        this.host = host;
        this.app = app;
        this.name = name;
        ws.start(uid, host, port);
        local.start(uid, host, app, name);
    },
    stop: function () {

    },
    getMyAirIds: function () {
        return {
            global: ws.getAirId(),
            local: local.getAirId(),
        }
    },
    localPeers: function () {
        return local.getPeers();
    },
    request: function (to, body, cb = function () { }) {
        var key = crypto.randomBytes(8);
        var toId = parseAirId(to);
        var source = 'all';
        if (toId.sessionId != undefined) {
            source = toId.sessionId.split('.')[0];
            if (source != 'local') {
                source = 'global';
            }
        }
        if (source == 'all' || source == 'global') {
            ws.request(to, key, body);//
        }
        if (source == 'all' || source == 'local') {
            local.request(to, key, body);//
        }
        replies.on(key, (res) => {
            var fromId = parseAirId(res.from);
            if (toId.uid == fromId.uid && toId.host == fromId.host) {
                delete res.key;
                res.parseBody = () => {
                    res.body = Buffer.from(res.body).toString();
                }
                cb(res);
            }
        })
    }
}

Emitter(api);

function receiveRequest(source, key, msg) {
    var from = msg.from;
    msg.source = source;
    msg.parseBody = () => {
        msg.body = Buffer.from(msg.body).toString();
    }
    msg.respond = (status = 200, body) => {
        if (status == undefined || status == null) {
            status = 200;
        }
        if (source == 'global') {
            ws.reply(from, key, status, body);//
        }
        else {
            local.reply(from, key, status, body);//
        }
    }
    return msg;
}

ws.on("request", (req) => {
    //console.log("new req from ws");
    api.emit("request", receiveRequest('global', req.key, req.message));
})

ws.on("response", (res) => {
    //console.log("new res from ws");
    replies.emit(res.key, res.message);
})

local.on("request", (req) => {
    // console.log("new req from local");
    api.emit("request", receiveRequest('local', req.key, req.message));
})

local.on("response", (res) => {
    //console.log("new res from local");
    replies.emit(res.key, res.message);
})

ws.on("connection", (airId) => {
    api.emit("connection", airId);
})

ws.on("disconnection", (airId) => {
    api.emit("disconnection", airId);
})

local.on("localPeerFound", (rec) => {
    api.emit("localPeerFound", rec);
})

local.on("localPeerRemoved", (rec) => {
    api.emit("localPeerRemoved", rec);
})

module.exports = api;