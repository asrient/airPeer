const net = require('net');

const server = net.createServer((c) => {
    // 'connection' listener.
    console.log('client connected',c.remoteAddress+':'+c.remotePort);
    c.on('end', () => {
        console.log('client disconnected');
    });
    c.on('data', (data) => {
        console.log('client data received', data.toString());
    });
    c.write('No way!');
});
server.on('error', (err) => {
    throw err;
});

server.listen(2000,(x) => {
    console.log('server bound',x);
});

const port=server.address().port;
console.log(server.address());


socket.on('data', (data) => {
    console.log('data received from server', data.toString());
});

socket.setNoDelay(true);