const airPeer = require("../lib.js");
const fs = require('fs');

airPeer.start("peer1", "airbroker.herokuapp.com", "testapp", "Pix");
//airPeer.start("peer1", "airbase-airbase.apps.us-east-1.starter.openshift-online.com", "testapp", "Pix");
//airPeer.start("peer1", "192.168.137.1:3000", "testapp", "Pix");
//airPeer.start("peer1", "localhost:3000", "testapp", "Pix");

var airId = null;

airPeer.on("connection", (id) => {
    airId = id;
    console.log("CONNECTED AS ", id);
    console.log("sending request...");

    /*airPeer.request(airId, 'media/in.txt', (res) => {
        console.log("response ended!");
        fs.writeFile("out.txt", res.body, () => {
            console.log("file written!")
        });
    })*/
    airPeer.request(airId, 'media/in2.txt', (res) => {
        console.log("response ended!");
        fs.writeFile("out2.txt", res.body, () => {
            console.log("file written!")
        });
    })
    /*setTimeout(() => {
        airPeer.request(airId, 'media/in.jpg', (res) => {
            console.log("response ended!");
            fs.writeFile("out.jpg", res.body, () => {
                console.log("file written!")
            });
        })
    }, 10)*/
})

airPeer.on("request", (req) => {
    console.log("A req arrived!");
    req.parseBody();
    fs.readFile(req.body, (err, data) => {
        if (data != null) {
            req.respond(200, data);
       }
    })
})

airPeer.on('localPeerFound', (rec) => {
    var airId = rec.uid + ':' + rec.host + ':' + rec.sessionId;
    if(rec.uid=='peer2'){
        setTimeout(()=>{
        console.log("sending request to",airId);

        /*airPeer.request(airId, 'media/in2.txt', (res) => {
            console.log("response ended!");
            fs.writeFile("out2.txt", res.body, () => {
                console.log("file written!")
            });
        })*/

        /*airPeer.request(airId, 'media/in.jpg', (res) => {
            console.log("response ended!");
            fs.writeFile("out.jpg", res.body, () => {
                console.log("file written!")
            });
        })*/

        airPeer.request(airId, 'media/in2.txt', (res) => {
            console.log("response ended!");
            fs.writeFile("out2.txt", res.body, () => {
                console.log("file written!")
            });
        })

     },10000)
    }
})
