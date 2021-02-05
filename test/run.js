const AirPeer = require("../lib.js");
const fs = require('fs');

const TXT = 'text'
const FILE = 'file'

//airbroker.herokuapp.com

// input:'hi', output:'FILE:in.png'

function run(input = null, output = null, local = false, cb) {
    const peer = new AirPeer({ uid: "peer1", host: "localhost:3000", appName: "testapp", deviceName: "Pix" });
    var inType = TXT
    var outType = TXT
    if (input.split(':')[0] == 'FILE') {
        inType = FILE
        const inFile = 'media/' + input.split(':')[1]
        const tmpInFile = 'tmp/' + input.split(':')[1]
    }
    if (output.split(':')[0] == 'FILE') {
        outType = FILE
        const outFile = 'media/' + output.split(':')[1]
        const tmpOutFile = 'tmp/' + output.split(':')[1]
    }

    var request = (airId) => {
        var req = input
        if (inType != TXT)
            fs.readFile(inFile, (err, data) => {
                if (data != null) {
                    req = data;
                }
                else
                    cb(false, 'Cant read input file')
            });
        peer.request(airId, req, (res) => {
            console.log("response ended!");
            if (outType == FILE)
                fs.writeFile(tmpOutFile, res.body, () => {
                    console.log("file written!")
                    cb(true)
                });
            else {
                res.parseBody();
                if (res.body == output) {
                    cb(true)
                }
                else {
                    cb(false, 'TEXT OUTPUT WRONG', 'Expected: ' + output, 'Received: ' + res.body)
                }
            }
        })
    }

    //For global
    peer.on("connection", (airId) => {
        console.log("CONNECTED AS ", airId.str);
        if (!local) {
            console.log("sending request...");
            request(airId)
        }
    })

    //For local
    peer.on('localPeerFound', (rec) => {
        console.log('Local Peer Found', rec);
        if (local)
            request(rec.airId)
    })

    peer.on("request", (req) => {
        console.log("A request arrived!");
        if (inType == FILE) {
            fs.writeFile(tmpInFile, res.body, () => {
                console.log("file written!")
                //
            });
        }
        else {
            req.parseBody();
            if (req.body != input) {
                cb(false, 'TEXT INPUT WRONG', 'Expected: ' + input, 'Received: ' + req.body)
            }
        }
        if (outType == FILE) {
            fs.readFile(outFile, (err, data) => {
                if (data != null) {
                    req.respond(200, data);
                }
            })
        }
        else {
            req.respond(200, output);
        }

    })
}

module.exports = run