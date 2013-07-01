var net = require('net');

var server = net.createServer(function(){
    console.log("got connection");
});

server.listen(3490,"::");
//server.listen(3490,"127.0.0.1");
