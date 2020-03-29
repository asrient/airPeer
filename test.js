const airPeer=require("./lib.js");

airPeer.start("peer1","airbroker.herokuapp.com","Pix");

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

airPeer.on('localPeerFound',(rec)=>{
    console.log("new peer found",rec);
    var airId=rec.uid+':'+rec.host+':'+rec.sessionId;
    airPeer.request(airId,"hello local friend!",(res)=>{
        res.parseBody();
        console.log("response arrived!",res);
    })
})
