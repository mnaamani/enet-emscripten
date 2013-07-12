var net = require("net");

net.connect({port:3490,host:"::ffff:127.0.0.1",localAddress:"::"},function(){
    console.log("connected!");
});
