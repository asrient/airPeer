const airPeer = require("../lib.js");
const fs = require('fs');

airPeer.start("peer1", "localhost:3000", "testapp", "Pix");

var airId = null;

airPeer.on("connection", (id) => {
    airId = id;
    console.log("CONNECTED AS ", id);
    console.log("sending request...");

    airPeer.request(airId, 'in.jpg', (res) => {
        console.log("response ended!");
        fs.writeFile("out.jpg", res.body, () => {
            console.log("file written!")
        });
    })
   /* setTimeout(() => {
        airPeer.request(airId, 'in1.jpg', (res) => {
            console.log("response ended!");
            fs.writeFile("out1.jpg", res.body, () => {
                console.log("file written!")
            });
        })
    }, 30)*/

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
     setTimeout(()=>{
        console.log("sending request to",airId);
        airPeer.request(airId, 'in.jpg', (res) => {
            console.log("response ended!");
            fs.writeFile("out.jpg", res.body, () => {
                console.log("file written!")
            });
        }) 
     },1000)


})
