const http = require('http');
const net = require('net');

const message = require('./msg.js');

const opts={
  host:"airbroker.herokuapp.com",
  port:80
}
var isUpgraded=false;
const client = net.createConnection(opts, () => {
  // 'connect' listener.
  console.log('connected to server! Upgrading..');
  client.write("GET / HTTP/1.1\r\n"+
  "Host: airbroker.herokuapp.com\r\n"+
  "Upgrade-Insecure-Requests: 1\r\n"+
  "Upgrade: websocket\r\n"+
  "Connection: Upgrade\r\n"+
  "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"+
  "\r\n");
});

client.on("data",(msg)=>{
  console.log("----------------")
 console.log(Buffer.from(msg).toString());
 if(!isUpgraded){
   var str=Buffer.from(msg).toString();
   var title=str.split("\r\n")[0];
   if(title=="HTTP/1.1 101 Switching Protocols"){
     console.log("upgraded! now connecting...");
     client.write(message.build({ type: 'connect', uid: '8jh6hjjuj' }));
     isUpgraded=true;
   }
  else{
    console.error("not upgraded yet!",title);
  }
 }
})

dup(client);


var airId = null;

function dup(socket) {
  socket.on("data", (m) => {
    msg = message.parse(m);
    if (msg.type != undefined) {
      if (msg.type == 'connected') {
        airId = msg.airid;
        console.log("connected, sending request now...",airId);
        socket.write(message.build({ type: 'request', to: '8jh6hjjuj:'+opts.host, key: 'e5ry', body: 'Hello!' }));
      }
      if (msg.type == 'request') {
        socket.write(message.build({ type: 'response', to: airId, key: msg.key, body: 'Hello back!' }));
      }
    }
  })
  socket.on("error", (msg) => {
    console.error(msg);
  })
  socket.on("close", (msg) => {
    console.log("socket closed!");
  })
  socket.on("end", (msg) => {
    console.log("socket ended!");
  })
}
