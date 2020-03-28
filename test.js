const airPeer=require("./lib.js");

airPeer.start("peer1","airbroker.herokuapp.com");

var airId=null;

airPeer.on("connection",(id)=>{
    airId=id;
    console.log("CONNECTED AS ",id);
    airPeer.request(airId,"hello friend!",(res)=>{
        res.parseBody();
        console.log("response arrived!",res);
    })
})

airPeer.on("request",(req)=>{
    req.parseBody();
    console.log("A req arrived!",req);
    setTimeout(()=>{
        req.respond(200,"Hello back!");
    },1000)
})
