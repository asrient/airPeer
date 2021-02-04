const os = require('os');
const process = require('process');

class AirId {
    static isEqual(id1, id2) {
        return id1.airId === id2.airId
    }
    airId = null;
    constructor(airId, host = null, sessionId = null) {
        if (!host && !sessionId && airId.split(':').length > 1) {
            this.airId = airId
        }
        else if (host && airId.split(':').length == 1) {
            //airId is uid
            if (sessionId) {
                this.airId = `${airId}:${host}:${sessionId}`
            }
            else {
                this.airId = `${airId}:${host}`
            }
        }
    }
    parse() {
        var ids = this.airId.split(':');
        return {
            uid: ids[0],
            host: ids[1],
            sessionId: ids[2]||null
        }
    }
    get str() {
        return this.airId;
    }
    get host() {
        return this.airId.split(':')[1]
    }
    set host(str) {
        this.airId = `${this.airId.split(':')[0]}:${str}:${this.airId.split(':')[1]}`
    }
    get uid() {
        return this.airId.split(':')[0]
    }
    set uid(str) {
        this.airId = `${str}:${this.airId.split(':')[0]}:${this.airId.split(':')[1]}`
    }
    get sessionId() {
        return this.airId.split(':')[2]||null
    }
    set sessionId(str) {
        if(str)
        this.airId = `${this.airId.split(':')[0]}:${this.airId.split(':')[1]}:${str}`
        else
        this.airId = `${this.airId.split(':')[0]}:${this.airId.split(':')[1]}`
    }
    get isLocal() {
        if (this.sessionId) {
            return this.sessionId.split('#').length == 2
        }
        return null
    }
    get ipAddr() {
        if (this.isLocal) {
            return this.sessionId.split('#')[0]
        }
        return null
    }
    get port() {
        if (this.isLocal) {
            return this.sessionId.split('#')[1]
        }
        return null
    }
}

module.exports = {
    getIpAddrs() {
        var network = os.networkInterfaces();
        var obj = {}
        Object.keys(network).forEach((connName) => {
            network[connName].forEach((conn) => {
                if (conn.family === 'IPv4' && conn.address !== '127.0.0.1' && !conn.internal) {
                    obj[connName] = conn.address;
                }
            })
        })
        return obj;
    },
    getIpAddr() {
        //This will return the most probable IP address of WiFi
        var ips = this.getIpAddrs();
        if (ips['Wi-Fi']) return ips['Wi-Fi']
        if (ips['Wi-Fi']) return ips['en0']
        return ips[Object.keys(ips)[0]]
    },
    getDeviceName() {
        if (process.env['COMPUTERNAME'])
            return process.env['COMPUTERNAME'];
        return os.hostname().split('.')[0].split('-').join(' ');
    },
    parseAirId(airId) {
        var ids = airId.split(':');
        return {
            uid: ids[0],
            host: ids[1],
            sessionId: ids[2]
        }
    },
    AirId
}