const Emitter = require("component-emitter");
const mdns = require('multicast-dns')();
const crypto = require('crypto');
const frame = require('./frame.js');
const os = require('os');
const dgram = require('dgram');
const message = require('./msg.js');

var peers = [];
var addrBook = {};

const frameSize = 65535;

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

function getPeerAddresses(airId) {
    var r = parseAirId(airId);
    return peers.filter((peer) => {
        if (r.sessionId != undefined) {
            return (peer.host == r.host && peer.uid == r.uid && peer.sessionId == r.sessionId)
        }
        else {
            return (peer.host == r.host && peer.uid == r.uid)
        }
    }).map((peer) => {
        return peer.address;
    })
}

function getPeerByCode(code) {
    return peers.find((peer) => {
        return peer.code == code;
    })
}

function getPeerAirId(address) {
    var p = peers.find((peer) => {
        return peer.address == address;
    })
    if (p != undefined)
        return p.uid + ':' + p.host + ':' + p.sessionId;
    return null;
}

function peerUpdate(rec) {
    var dt = new Date();
    var ind = peers.findIndex((peer) => {
        return (peer.uid == rec.uid && peer.host == rec.host && peer.code == rec.code)
    })
    if (ind >= 0) {
        if (peers[ind].name != rec.name || peers[ind].icon != rec.icon) {
            console.log("Updating name & icon", peers[ind].name, rec.name)
        }
        peers[ind].address = rec.address;
        peers[ind].name = rec.name;
        peers[ind].icon = rec.icon;
        peers[ind].lastSeen = dt.getTime();
    }
    else {
        //new rec
        var record = {
            uid: rec.uid,
            host: rec.host,
            address: rec.address,
            name: rec.name,
            icon: rec.icon,
            app: rec.app,
            code: rec.code,
            sessionId: 'local.' + keyGen(),
            lastSeen: dt.getTime()
        }
        peers.push(record);
        console.log(peers[peers.length - 1]);
        console.log(peers);
        api.emit('localPeerFound', record);
    }
}

mdns.on('response', function (response) {
    response.answers.forEach(ans => {
        if (ans.name == 'air.local' && ans.type == 'TXT') {
            var data = {};
            ans.data.forEach((rec) => {
                var r = Buffer.from(rec).toString().split('=');
                data[r[0].trim()] = r[1].trim();
            })
            if (data.uid != undefined && data.host != undefined && data.addresses != undefined) {
                data.addresses = JSON.parse(data.addresses);
                var code = keyGen(6);
                //check if an address from the set already exists, then use its code
                data.addresses.forEach((addr) => {
                    if (addrBook[addr] != undefined) {
                        //console.log("[DISCOVERY] peer has an address regestered already")
                        code = addrBook[addr].code;
                    }
                })
                data.addresses.forEach((addr) => {
                    if (addrBook[addr] == undefined) {
                        addrBook[addr] = { code, uid: data.uid, app: data.app, host: data.host, name: data.name, icon: data.icon, address: addr }
                    }
                    var ip = addr.split(':')[0];
                    var port = addr.split(':')[1];
                    api.sendFrame(crypto.randomBytes(8), message.build({ type: 'connect', uid: api.uid, host: api.host, name: api.name, app: api.app }), port, ip)
                })
            }
            else
                console.log("invalid rec", data);
        }
    });
})

function housekeeping() {
    var dt = new Date();
    //remove peers that has been inactive for more than 6 secs
    peers = peers.filter((peer) => {
        var willStay = (peer.lastSeen > (dt.getTime() - 20000));
        if (!willStay) {
            console.log("removing peer", peer)
            api.emit('localPeerRemoved', peer);
        }
        return willStay;
    })
}

function broadcast() {
    var rec = [
        'uid=' + api.uid,
        'host=' + api.host,
        'app=' + api.app,
        'name=' + api.name,
        'icon=default',
        'addresses=' + JSON.stringify(api.addresses)
    ];
    mdns.response({
        answers: [{
            name: 'air.local',
            type: 'TXT',
            data: rec
        }]
    })
    housekeeping();
}

function peerConnect(address, msg) {
    var uid = msg.uid;
    var host = msg.host;
    var rec = addrBook[address];
    if (rec != undefined) {
        if (uid == rec.uid && host == rec.host) {
            var peer = getPeerByCode(rec.code);
            if (peer != undefined) {
                //A peer with this code already exists, just update it now
                //console.warn("A peer with this code already exists, just update it now", peer, rec, address)
                peerUpdate(rec);
            }
            else if (peer == undefined) {
                //A peer with such code is found for 1st time
                //console.warn("A peer with such code is found for 1st time", rec, address)
                peerUpdate(rec);
            }

        }
        else {
            console.error("[CONNECT] Check info mismatch");
        }
    }
    else {
        if (api.uid != uid)
            console.error("\n[CONNECT] unknown address", uid, address, "\n");

        //For situations where peer A finds peer B, but peer B is unable to discover peer A
        /*var code = keyGen(6);
        rec = { code, uid, host, name: msg.name, icon: "default", address, app: msg.app };
        addrBook[address] = rec;
        peerConnect(address, msg);*/
    }
}

var api = {
    isInit: false,
    willDisconnect: false,
    host: "airbroker.herokuapp.com",
    socket: null,
    name: null,
    app: null,
    uid: null,
    addresses: [],
    ongoing: {},
    start: function (uid, host, app, name) {
        this.uid = uid;
        this.host = host;
        this.app = app;
        this.name = name;
        this.ongoing = {};
        var network = os.networkInterfaces();
        Object.keys(network).forEach((connName) => {
            var addr = null;
            network[connName].forEach((conn) => {
                if (conn.family == 'IPv4') {
                    if(conn.address!='127.0.0.1')
                    this.addresses.push(conn.address);
                }
            })
        })
        //start udp socket here
        this.socket = dgram.createSocket('udp4');
        this.socket.on('error', (err) => {
            console.log(`server error:\n${err.stack}`);
            this.socket.close();
        });

        this.socket.on('message', (msg, rinfo) => {
            done = (m) => {
                var airId = getPeerAirId(rinfo.address + ':' + rinfo.port);
                if (airId != null) {
                    m.from = airId;
                    if (m.type == 'request') {
                        api.emit('request', { key, message: m });
                    }
                    else if (m.type == 'response') {
                        console.log("got a response");
                        api.emit('response', { key, message: m });
                    }
                }
                if (m.type == 'connect') {
                    peerConnect(rinfo.address + ':' + rinfo.port, m);
                }
                else
                console.log("got a msg from unknown address",m,rinfo.address + ':' + rinfo.port);
            }
            var chunk = frame.parse(msg);
            var key = chunk.key;
            var fin = chunk.fin;
            var data = chunk.data;
            if (this.ongoing[key] != undefined) {
                var stream = this.ongoing[key].data;
                this.ongoing[key].data = Buffer.concat([stream, data]);
                if (fin) {
                    var m = message.parse(this.ongoing[key].data);
                    done(m);
                    delete this.ongoing[key];
                }
                else {
                    //now is a good time to emit events for partial data receiving
                }
            }
            else {
                if (fin) {
                    var m = message.parse(data);
                    done(m);
                }
                else {
                    //more chunks r supposed to arrive, for reference store this chunk in ongoing
                    this.ongoing[key] = { data };
                }
            }
        });

        this.socket.on('listening', () => {
            var port = this.socket.address().port;
            this.addresses = this.addresses.map((addr) => {
                return addr + ':' + port;
            })
            broadcast();
            setInterval(broadcast, 2000);
        });
        this.socket.bind();//////////
    },
    send: function (msg, port, ip) {
        if (msg != null) {
            this.socket.send(msg, port, ip);
        }
    },
    sendFrame: function (key, msg, port, ip) {
        send = () => {
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
                console.log("sending res chunk size", frm.length);
                this.send(frm, port, ip);
                offset = end;
            }
        }
        schedule = () => {
            setTimeout(() => {
                if (!fin) {
                    send();
                    schedule();
                }
            }, 3)
        }
        if (msg.length > frameSize) {
            //size too large to be sent together, break them up!
            var offset = 0;
            var last = msg.length - 1;
            var end = 0;
            var chunk;
            var fin = false;
            send();
            if (!fin) {
                schedule();
            }
        }
        else {
            //msg can be sent at once
            this.send(frame.build(true, key, msg), port, ip);
        }
    },
    request: function (to, key, body = null) {
        getPeerAddresses(to).forEach((address) => {
            var ip = address.split(':')[0];
            var port = address.split(':')[1];
            port = parseInt(port);
            console.log("sending req to",address);
            this.sendFrame(key, message.build({ type: 'request', to, body }), port, ip);
        })
    },
    reply: function (to, key, status = 200, body = null) {
        getPeerAddresses(to).forEach((address) => {
            var ip = address.split(':')[0];
            var port = address.split(':')[1];
            port = parseInt(port);
            this.sendFrame(key, message.build({ type: 'response', to, status, body }), port, ip);
        })
    },
    getPeers: function () {
        return peers;
    }
}

Emitter(api);

module.exports = api;