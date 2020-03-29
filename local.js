const Emitter = require("component-emitter");
const mdns = require('multicast-dns')();
const crypto = require('crypto');
const os = require('os');
const dgram = require('dgram');
const message = require('./msg.js');

var peers = [];

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
        return (peer.uid == rec.uid && peer.host == rec.host && peer.address == rec.address)
    })
    if (ind >= 0) {
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
            sessionId: 'local.' + keyGen(),
            lastSeen: dt.getTime()
        }
        peers.push(record);
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
                var isFound = false;
                data.addresses.forEach((addr) => {
                    var ip = addr.split(':')[0];
                    var port = addr.split(':')[1];
                    api.socket.send("ping", port, ip, (err) => {
                        if (!isFound) {
                            if (err == null) {
                                console.log("proper address fonud!", addr);
                                delete data.addresses;
                                data.address = addr;
                                isFound = true;
                                peerUpdate(data);
                            }
                            else {
                                console.log("addr not valid", err);
                            }
                        }
                    })
                })
            }
            else
                console.log("invalid rec", data);
        }
    });
})

function housekeeping() {
    var dt = new Date();
    //remove peers that have been inactive for more than 3 min
    peers = peers.filter((peer) => {
        return (peer.lastSeen > (dt.getTime() - 180000))
    })
}

function broadcast() {
    var rec = ['uid=' + api.uid, 'host=' + api.host, 'name=' + api.name, 'icon=default', 'addresses=' + JSON.stringify(api.addresses)];
    mdns.response({
        answers: [{
            name: 'air.local',
            type: 'TXT',
            data: rec
        }]
    })
    housekeeping();
}

var api = {
    isInit: false,
    willDisconnect: false,
    host: "airbroker.herokuapp.com",
    socket: null,
    name: null,
    uid: null,
    addresses: [],
    start: function (uid, host, name) {
        this.uid = uid;
        this.host = host;
        this.name = name;
        var network = os.networkInterfaces();
        Object.keys(network).forEach((connName) => {
            var addr = null;
            network[connName].forEach((conn) => {
                if (conn.family == 'IPv4') {
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
            //console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
            msg = message.parse(msg);
            if (msg.type != undefined) {
                var airId = getPeerAirId(rinfo.address + ':' + rinfo.port);
                if (airId != null) {
                    msg.from = airId;
                    if (msg.type == 'request') {
                        api.emit('request', msg);
                    }
                    else if (msg.type == 'response') {
                        api.emit('response', msg);
                    }
                }
                else {
                    console.warn("message received from unkown address", msg, rinfo);
                }
            }
        });

        this.socket.on('listening', () => {
            var port = this.socket.address().port;
            this.addresses = this.addresses.map((addr) => {
                return addr + ':' + port;
            })
            broadcast();
            setInterval(broadcast, 1500);
        });
        this.socket.bind();//////////
    },
    request: function (to, key, body = null) {
        getPeerAddresses(to).forEach((address) => {
            console.log(address);
            var ip = address.split(':')[0];
            var port = address.split(':')[1];
            port = parseInt(port);
            this.socket.send(message.build({ type: 'request', to, key, body }), port, ip, (err) => {
                console.log("req message sent!", err)
            });
        })
    },
    reply: function (to, key, status = 200, body = null) {
        getPeerAddresses(to).forEach((address) => {
            var ip = address.split(':')[0];
            var port = address.split(':')[1];
            port = parseInt(port);
            this.socket.send(message.build({ type: 'response', to, key, status, body }), port, ip, (err) => {
                console.log("res message sent!", err)
            });
        })
    },
    getPeers: function () {
        return peers;
    }
}

Emitter(api);

module.exports = api;