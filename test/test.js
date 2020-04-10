const airPeer=require("../lib.js");

airPeer.start("peer1","airbroker.herokuapp.com","testapp","Pix");

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
        console.log("sending response...");
        req.respond(200,"Hello back!");
    },1000)
})

airPeer.on('localPeerFound',(rec)=>{
    console.log("new peer found",rec);
    if(rec.uid!='peer1'){
        var id=rec.uid+':'+rec.host+':'+rec.sessionId;
       console.log("[new local peer]",id);
    airPeer.request(id,"hello local friend!",(res)=>{
        res.parseBody();
        console.log("response arrived!",res);
    }) 
    }
    
})
