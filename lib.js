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
    start: function (uid, host, app, name) {
        ws.start(uid, host);
        local.start(uid, host, app, name);
    },
    stop: function () {

    },
    localPeers: function () {
        return local.getPeers();
    },
    request: function (to, body, cb = function () { }) {
        var key = keyGen();
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

function receiveRequest(source, msg) {
    var key = msg.key;
    var from = msg.from;
    delete msg.key;
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

ws.on("request", (msg) => {
    //console.log("new req from ws");
    api.emit("request", receiveRequest('global', msg));
})

ws.on("response", (msg) => {
    //console.log("new res from ws");
    replies.emit(msg.key, msg);
})

local.on("request", (msg) => {
    // console.log("new req from local");
    api.emit("request", receiveRequest('local', msg));
})

local.on("response", (msg) => {
    //console.log("new res from local");
    replies.emit(msg.key, msg);
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