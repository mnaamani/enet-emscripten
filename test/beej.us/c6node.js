var net = require("net");

net.connect({port:3490,host:"::1",localAddress:"::"},function(){
    console.log("connected!");
});
