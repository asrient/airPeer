const Emitter = require("component-emitter");
const crypto = require('crypto');
const ws = require("./websocket.js");

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
    start: function (uid, host) {
        ws.start(uid, host);
    },
    stop: function () {

    },
    localPeers: function () {

    },
    request: function (to, body, cb = function () { }) {
        var key = keyGen();
        var toId = parseAirId(to);
        ws.request(to, key, body);//
        replies.on(key, (res) => {
            var fromId = parseAirId(res.to);
            if (toId.uid == fromId.uid && toId.host == fromId.host) {
                delete res.key;
                res.parseBody=()=>{
                    res.body=Buffer.from(res.body).toString();
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
    msg.parseBody=()=>{
        msg.body=Buffer.from(msg.body).toString();
    }
    msg.respond = (status = 200, body) => {
        if (status == undefined || status == null) {
            status = 200;
        }
        if (source == 'ws') {
            ws.reply(from, key, status, body);//
        }
        else {
            //
        }
    }
    return msg;
}

ws.on("request", (msg) => {
    console.log("new req from ws");
    api.emit("request", receiveRequest('ws', msg));
})

ws.on("response", (msg) => {
    console.log("new res from ws");
    replies.emit(msg.key, msg);
})

ws.on("connection", (airId) => {
    api.emit("connection", airId);
})

module.exports = api;