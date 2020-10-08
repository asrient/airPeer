# Air Peer

This is an implementation of AirPeer protocol in javascript for Node.js

## About AirPeer Protocol

- The main idea of the protocol is that our devices must be be able to discover and
  communicate with each other over any type network, be it the `internet`, or local `WiFi` or `bluetooth` or even `USB` cables.
- It is a networking protocol, like http or websockets, built on top of `tcp` sockets.
- Peers connect with each others in a `p2p` fashion, without the need of a server.
  This means that, peers are able to communicate even without an internet connection.
- It specifies a way of identification, discovery and sending data between peers over any kind of network.
- It uses a broker server when connected over the internet. (As our devices cannot act as a public server behind a NAT like WiFi routers)
- It provides a `duplex` 2 way mode of communication.
- It is suitable for sending or receiving any amount of data, making it suitable for streaming.
- Even though it is inspired by protocols like websockets and http it is not compatable with the same. It also adds a layer of identification and discoverablity along with communication.

## Identification concepts

- Every peer (i.e a program instance) first assigns itself a random `uid`.
- A peer can be uniquely identified by an `airId`.
- An `airId` consists of 3 parts:
  - __uid__ as set by the peer.
  - __host__ domain name (eg: `air.example.com`) of the broker server it is or shall connect to. (It is not needed to acutally connect to it to use this library)
  - __sessionId__ a random string assigned by the library (On local networks) or by the broker server (On the internet)
- `airId` format `uid:host:sessionId` eg: `657gh6fS8sHu:air.example.com:8jhtR5hgr`
- An airId without a `sessionId` is called a `peerId` (`uid:host`)
- A request can be sent to either an `airId` or a `peerId`. When sent to a `peerId`, all the peers with the same id will receive the request.
- `airIds` are like dynamic IP addersses, they change over time, but a `peerId` always stays the same.
- `sessionIds` therefore, `airIds` differ for each network interfaces, i.e your `airId` on the internet is different from the local one.

## How to identify a peer over a network

To know the airId of a known peer (ie peerId is known), we first send a message to peerId, ie all peers with the same peerId.
From the responses received from those peers, you can decide which one is the actual peer and use their `airId` directly for furthur communication with the peer.

You can also get a list of available local airIds for easy discoverablity when on a local network.

## Communication between peers

There are 2 type of messages in airPeer.

- Requests
- Responses

Responses can be sent more than once to a particular request.

## Usage

### Initialize

```javascript
const airPeer = require("../lib.js");
// options: uid, host, appName, deviceName
airPeer.start("peer1", "airbroker.herokuapp.com", "testapp", "my PC");
```

### Send a request

```javascript
// options: airId/peerId, message, callback with response
airPeer.request("sgtedrf5:example.com:45gf4", "Hello there!", (res) => {
  console.log(`A response from ${req.from} arrived!`, res.body);
});
```

A response object consists of:

- __body__ (type: `buffer`) message payload
- __status__ (type: `Int`) status code of the response
- __from__ (type: `string`) `airId` of the remote peer
- __parseBody()__ (type: `func`) parses the body to `string`

### Respond to a request

```javascript
airPeer.on("request", (req) => {
  req.parseBody();
  console.log(`A req from ${req.from} arrived!`, req.body);
  if (req.body == "Hello there!") {
    // Send a response
    req.respond(200, "hi!");
  }
  // Send another response
  req.respond(200, "This is cool!");
});
```

A request object consists of:

- __body__ (type: `buffer`) message payload
- __from__ (type: `string`) `airId` of the remote peer
- __parseBody()__ (type: `func`) parses the body to `string`
- __respond()__ (type: `func`) parameters: _statusCode_, _body_

### Get a list of local peers

```javascript
var localPeers = airPeer.localPeers();
console.log(localPeers);
```

list format:

```javascript
[
  {
    uid: "we4vg4",
    host: "example.com",
    sessionId: "dfgyherty6b5",
    name: "my PC",
    app: "test-app",
    port: 7657,
    address: "192.168.0.103", //IP adderss currently accessable by us
    addresses: ["192.168.0.103", "172.16.0.23"], //All possible IP addersses
    lastSeen: 1602135055, //Unix timestamp
  },
];
```

If the peer is not connected, `adderess` will be `null`.

### When a new local peer is discovered

You don't need to keep checking for new peers, instead you can

```javascript
airPeer.on("localPeerFound", (rec) => {
  var airId = rec.uid + ":" + rec.host + ":" + rec.sessionId;

  console.log("new peer found!", rec);
  console.log("sending request to", airId);

  airPeer.request(airId, "Hey! just found you", (res) => {
    console.log("response received!", res);
  });
});
```

### Get my AirId

To get the current AirIds of the peer

```javascript
var { global, local } = airPeer.getMyAirIds();
```
