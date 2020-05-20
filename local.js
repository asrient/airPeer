const net = require('net');
const Emitter = require("component-emitter");
const mdns = require('multicast-dns')();
const crypto = require('crypto');
const frame = require('./frame.js');
const os = require('os');
const message = require('./msg.js');

var airBook = {};

const frameSize = 64535;

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


mdns.on('response', function (response) {
    response.answers.forEach(ans => {
        if (ans.name == 'air.local' && ans.type == 'TXT') {
            var data = {};
            ans.data.forEach((rec) => {
                var r = Buffer.from(rec).toString().split('=');
                data[r[0].trim()] = r[1].trim();
            })
            if (data.uid != undefined && data.host != undefined && data.sessionId != undefined && data.addresses != undefined) {
                data.addresses = JSON.parse(data.addresses);
                var airId = data.uid + ':' + data.host + ':' + data.sessionId;
                if (airBook[airId] == undefined) {
                    //setting up new record
                    airBook[airId] = data;
                    airBook[airId].address = null;
                    //console.log('setting up new peer record', airBook[airId]);
                    sendConnectMsg(airId);
                }
                else if (airBook[airId].address == null) {
                    sendConnectMsg(airId);
                }
                var dt = new Date();
                airBook[airId].lastSeen = dt.getTime();
                airBook[airId].addresses = data.addresses;
            }
            else
                console.log("invalid rec", data);
        }
    });
})

function housekeeping() {
    var dt = new Date();
    //remove peers that has been inactive for more than 20 secs
    Object.keys(airBook).forEach((airId) => {
        if ((airBook[airId].lastSeen + 20000) < dt.getTime()) {
            console.log("removing peer", airId)
            api.emit('localPeerRemoved', airBook[airId]);
            delete airBook[airId];
        }
    })
}

function broadcast() {
    var rec = [
        'uid=' + api.uid,
        'host=' + api.host,
        'sessionId=' + api.sessionId,
        'app=' + api.app,
        'name=' + api.name,
        'addresses=' + JSON.stringify(api.addresses),
        'port=' + api.port
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

function sendConnectMsg(airId) {
    const port = airBook[airId].port;
    airBook[airId].addresses.forEach((addr) => {
        //console.log('sending connect msg to', airId, addr, port);
        sendFrame(crypto.randomBytes(8), message.build({
            type: 'connect',
            uid: api.uid,
            host: api.host,
            sessionid: api.sessionId,
            port: api.port,
            name: api.name,
            app: api.app
        }), addr, port)
    })
}

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

function sendFrame(key, msg, ip, port) {
    //console.log('sending frame', msg, ip, port)
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

function handleConnection(socket) {
    /////////////////////////////
    var address = socket.remoteAddress;
    var port = socket.remotePort;
    if (net.isIPv6(address)) {
        address = address.split('::ffff:')[1];
    }
    //console.log('client connected', address + ':' + port);

    var roaming = null;
    var ongoing = null;

    done = (key, m) => {
        socket.end();
        var airId = m.from;
        if (airId == undefined && m.uid != undefined && m.host != undefined && m.sessionid != undefined) {
            airId = m.uid + ':' + m.host + ':' + m.sessionid;
            //console.log('AIRID',airId,m)
        }
        var peer = airBook[airId];
        if (peer != undefined) {
            if (peer.addresses.includes(address)) {
                if (m.type == 'request') {
                    api.emit('request', { key, message: m });
                }
                else if (m.type == 'response') {
                    console.log("got a response");
                    api.emit('response', { key, message: m });
                }
                else if (m.type == 'connect') {
                    //connecting a before seen peer
                    var prevAddr = airBook[airId].address;
                    airBook[airId].address = address;
                    if (prevAddr == null) {
                        api.emit('localPeerFound', airBook[airId]);
                    }
                }
                if (peer.address != address) {
                    airBook[airId].address = address;
                    console.log("Selected IP changed!", airBook[airId]);
                }
            }
            else {
                console.warn("RECEIVED MSG FROM UNAUTHORIZED IP", address, peer);
            }
        }
        else if (m.type == 'connect') {
            //connecting a brand new peer
            console.log('connecting a brand new peer', m)
            if (m.uid != undefined && m.host != undefined && m.sessionid != undefined && m.port != undefined) {
                airBook[airId] = {
                    uid: m.uid,
                    host: m.host,
                    sessionId: m.sessionid,
                    name: m.name,
                    app: m.app,
                    port: m.port,
                    address,
                    addresses: [address],
                    lastSeen: new Date().getTime()
                }
                sendConnectMsg(airId);
                api.emit('localPeerFound', airBook[airId]);
            }
        }
        else {
            console.log("got a msg from unknown address", address + ':' + port, m.type, m.from, m.body.length);
        }
    }

    //console.log('client connected', address + ':' + port);
    socket.on('end', () => {
        //console.log('client disconnected');
    });
    socket.on('data', (msg) => {
        //console.log('msg from client', msg);
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
                    done(key, m);
                    ongoing = null;
                }
                else {
                    //now is a good time to emit events for partial data receiving
                }
            }
            else {
                if (fin) {
                    var m = message.parse(data);
                    done(key, m);
                }
                else {
                    //more chunks r supposed to arrive, for reference store this chunk in ongoing
                    ongoing = { data, count: 1 };
                }
            }
        })

    });
}

function getPeerAddresses(id) {
    //console.log('getting peer addrs',id)
    var ids = parseAirId(id);
    if (ids.sessionId != undefined) {
        if (airBook[id] != undefined) {
            addr = airBook[id].address;
            if (addr != null) {
                return [{ address: addr, port: airBook[id].port }];
            }
            else {
                return [];
            }
        }

    }
    else {
        var addrs = [];
        Object.keys(airBook).forEach((airId) => {
            if (airBook[airId].address != null) {
                if (airBook[airId].uid == ids.uid && airBook[airId].host == ids.host) {
                    addrs.push({ address: airBook[airId].address, port: airBook[airId].port });
                }
            }
        })
        return addrs;
    }
}

var api = {
    isInit: false,
    willDisconnect: false,
    host: "airbroker.herokuapp.com",
    server: null,
    name: null,
    app: null,
    uid: null,
    sessionId: null,
    addresses: [],
    port: null,
    start: function (uid, host, app, name) {
        this.uid = uid;
        this.host = host;
        this.sessionId = 'local.' + keyGen(4);
        this.app = app;
        this.name = name;
        this.roaming = null;
        this.ongoing = {};
        var network = os.networkInterfaces();
        Object.keys(network).forEach((connName) => {
            network[connName].forEach((conn) => {
                if (conn.family == 'IPv4') {
                    if (conn.address != '127.0.0.1')
                        this.addresses.push(conn.address);
                }
            })
        })
        //Starting the server
        this.server = net.createServer(handleConnection);
        this.server.on('error', (err) => {
            console.error(err);
        });
        this.server.listen(() => {
            console.log('server listening', this.server.listening);
            this.port = this.server.address().port;
            //Start broadscasting my existance to others
            broadcast();
            setInterval(broadcast, 2000);
        });
    },
    request: function (to, key, body = null) {
        var from = this.uid + ':' + this.host + ':' + this.sessionId;
        getPeerAddresses(to).forEach((rec) => {
            sendFrame(key, message.build({ type: 'request', to, from, body }), rec.address, rec.port);
        })
    },
    reply: function (to, key, status = 200, body = null) {
        var from = this.uid + ':' + this.host + ':' + this.sessionId;
        getPeerAddresses(to).forEach((rec) => {
            sendFrame(key, message.build({ type: 'response', to, from, status, body }), rec.address, rec.port);
        })
    },
    getPeers: function () {
        var peers=[]
        Object.keys(airBook).forEach((airId)=>{
            if(airBook[airId].address!=null){
                peers.push(airBook[airId]);
            }
        })
    }
}

//////////////////////////////////////////////////////////////////////////////

Emitter(api);
module.exports = api;