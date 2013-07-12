var net = require('net');

var server = net.createServer(function(){
    console.log("got connection");
});

server.listen(3490,"::");
