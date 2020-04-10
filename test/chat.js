const airPeer = require("../lib.js");

const info = {
    uid: "peer345",
    host: "airbroker.herokuapp.com",
    app: "messages",
    username: "Test User",
    devicename: "Piz",
    icon: "default",
    sessionId: null
}

var peers = {};

var crypto = require('crypto');

function code(n = 5) {
    return crypto.randomBytes(n).toString('hex');
}

function parseAirId(airId) {
    var ids = airId.split(':');
    return {
        uid: ids[0],
        host: ids[1],
        sessionId: ids[2]
    }
}

const seperator = ";;";
const sepLen = Buffer.byteLength(seperator);

function parseMessage(msg) {
    var buff = Buffer.from(msg);
    var data = {};
    var offset = buff.indexOf(seperator);
    var body = buff.slice(offset + sepLen);
    var head = buff.slice(0, offset).toString();
    var opts = head.split(";");
    data.body = body;
    opts.forEach((opt, ind) => {
        var key = opt.split('=')[0];
        var val = opt.split('=')[1];
        key = key.toLowerCase();
        key = key.trim();
        val = val.trim();
        data[key] = val;
    })
    return data;
}

function buildMessage(obj) {
    var sep = ";";
    var msg = "";
    Object.keys(obj).forEach((item) => {
        if (item != 'body') {
            msg += item + "=" + obj[item] + sep;
        }
    })
    msg += sep;
    var buff = Buffer.from(msg);
    if (obj.body != undefined) {
        if (!Buffer.isBuffer(obj.body)) {
            obj.body = Buffer.from(obj.body);
        }
        return Buffer.concat([buff, obj.body])
    }
    else
        return buff;
}

const dynamic = ['sessionId', 'lastPing', 'isTyping'];

airPeer.start(info.uid, info.host, info.app, info.username + ':' + info.devicename);

var airId = null;

airPeer.on("connection", (id) => {
    airId = parseAirId(id);
    info.sessionId = airId.sessionId;
})

function init1(airId) {
    console.log("INIT1...")
    var secret = code();
    var uid = airId.split(':')[0];
    var host = airId.split(':')[1];
    var sessionId = airId.split(':')[2];
    var req = {
        type: 'INIT1',
        username: info.username,
        devicename: info.devicename,
        icon: "default",
        instanceCode: info.instanceCode,
        secret
    };
    airPeer.request(airId, buildMessage(req), (ress) => {
        var res = parseMessage(ress.body);
        var dt = new Date;
        var time = dt.getTime();
        var peer = {
            uid,
            host,
            secret,
            username: res.devicename,
            devicename: res.devicename,
            icon: res.icon,
            chatStatus: 'SAYHI',
            sessionId,
            isTyping: false,
            addedOn: time,
            lastPing: time,
            lastContact: time
        }
        addPeer(peer);
    })
}

function addPeer(peer, cb = function () { }) {
    var peerId = peer.uid + ':' + peer.host;
    peers[peerId] = peer;
    cb(true);
}

function handleInit1(airId, req, respond) {
    var idObj = parseAirId(airId);
    var dt = new Date;
    var time = dt.getTime();
    var peer = {
        uid: idObj.uid,
        host: idObj.host,
        secret: req.secret,
        username: req.devicename,
        devicename: req.devicename,
        icon: req.icon,
        chatStatus: 'SAYHI',
        sessionId: idObj.sessionId,
        isTyping: false,
        addedOn: time,
        lastPing: time,
        lastContact: time
    }
    addPeer(peer);
    var reply = {
        username: info.username,
        devicename: info.devicename,
        icon: info.icon,
        instanceCode: info.instanceCode
    }
    respond(200, buildMessage(reply));
}

function handleInit2(airId, encdata, respond) {
    var peerId = airId.split(':')[0] + ':' + airId.split(':')[1];
    var sessionId = airId.split(':')[2];
    getPeer(peerId, (peer) => {
        if (peer != null) {
            var secret = peer.secret;
            //decrypt data here;
            var dec = encdata;//
            respond(200, buildMessage({
                decdata: dec,
                devicename: info.devicename,
                username: info.username,
                icon: info.icon
            }));
            if (peer.sessionId != sessionId) {
                init2(peerId, true);
                console.log("handle INIT2: new sessionId, force INIT2 ing..");
            }
        }
        else {
            respond(300, buildMessage({ decdata: 'none' }));
            console.error("Failed to respond to INIT2: peer not found.");
        }
    })
}

function getPeer(peerId, cb) {
    if (peers[peerId] != undefined) {
        cb(peers[peerId]);
        var dt = new Date;
        var time = dt.getTime();
        if ((peers[peerId].lastPing + 60 * 60 * 3) < time) {
            console.log("[get Peer] requesting init2.. ");
            init2(peerId,false,peers[peerId]);
        }
    }
    else {
        cb(null)
    }
}
function init2(peerId, force = false,peerObj) {
    console.log("INIT2...")
    var getInfo = (cb) => {
        if (peerObj == undefined) {
            getPeer(peerId, cb);
        }
        else{
            cb(peerObj);
        }
    }
    getInfo((peer) => {
        var dt = new Date;
        var time = dt.getTime();
        if (peer != null) {
            if ((peer.lastPing + 60 * 60 * 5) < time) {
                //Its about 5 mins since we got auth.. consider the peer offline
                updatePeer(peerId, { sessionId: null, lastPing: 0 }, peer)
            }
            if (((peer.lastPing + 60 * 60 * 3) < time) || force || peer.sessionId == null) {
                var secret = peer.secret;
                var data = code();
                var enc = data;//
                //encrypt here

                airPeer.request(peerId, buildMessage({ type: 'INIT2', encdata: enc }), (ress) => {
                    if (ress.status == 200) {
                        var res = parseMessage(ress.body);
                        var airId = ress.from;
                        var sessionId = ress.from.split(':')[2];
                        var dec = res.decdata;//
                        //decrypt here
                        if (dec == data) {
                            //authorized!
                            dt = new Date;
                            time = dt.getTime();
                            var update = { sessionId, lastPing: time }
                            if (res.devicename != undefined) {
                                update.devicename = res.devicename;
                            }
                            if (res.username != undefined) {
                                update.username = res.username;
                            }
                            if (res.icon != undefined) {
                                update.icon = res.icon;
                            }
                            updatePeer(peerId, update, peer);
                        }
                        else {
                            console.error("INIT2 BLOCKED: hash did not match!");
                        }
                    }
                    //TODO: If it keeps unauthorizing.. find a way to UNINIT1 the peer
                })
            }
            else {
                console.log("skipping INIT2..");
            }
        }
        else {
            console.error("Cannot INIT2: peerId not in records.")
        }
    })

}

function updatePeer(peerId, prop, peerObj) {
    var idObj = parseAirId(peerId);
    var getInfo = (cb) => {
        if (peerObj == undefined) {
            getPeer(peerId, cb);
        }
        else {
            cb(peerObj);
        }
    }
    getInfo((peer) => {
        var rec = {};
        Object.keys(peer).forEach((key) => {
            if (prop[key] != undefined) {
                peer[key] = prop[key];
            }
            if (!dynamic.includes(key)) {
                rec[key] = peer[key];
            }
        })
        peers[peerId] = peer;
    })
}

airPeer.on('request', (req) => {
    var data = parseMessage(req.body);
    if (data.type == 'reveal') {
        var reply = {
            username: info.username,
            devicename: info.devicename,
            icon: info.icon,
            instanceCode: info.instanceCode
        }
        req.respond(200, buildMessage(reply));
    }
    else if (data.type == 'INIT1') {
        console.log("Handling INIT1")
        handleInit1(req.from, data, req.respond);
    }
    else if (data.type == 'INIT2') {
        console.log("Handling INIT2")
        handleInit2(req.from, data.encdata, req.respond);
    }
})