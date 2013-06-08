/* If compiling with -O2 or --closure  make sure to include -s LINKABLE=1 */

var node_sockets = {
    $ENetSockets__postset:""+ 
        "_gethostbyname = _gehostbyname_r = function(){ return 0; };"+
        "_fcntl=function(){return -1;};"+
        "_ioctl=function(){return -1;};"+
        "_ntohs = _htons;"+
        "_ntohl = _htonl;"+
        "_recvmsg = ENetSockets.recvMsg;"+
        "_sendmsg = ENetSockets.sendMsg;"+
        "_enet_socket_create = ENetSockets.create;"+
        "_enet_socket_bind = ENetSockets.bind;"+
        "_enet_socket_listen = function($socket, $backlog){};"+
        "_enet_socket_set_option = function(){return 0;};"+
        "_enet_socket_wait = function(){return -1;};"+
        "_enet_socket_destroy = ENetSockets.destroy;",

    $ENetSockets__deps: ['__setErrNo', '$ERRNO_CODES'],
    $ENetSockets: {
        sockets: {},
        nextFd: 1,
        sockaddr_in_layout: Runtime.generateStructInfo([
          ['i32', 'sin_family'],
          ['i16', 'sin_port'],
          ['i32', 'sin_addr'],
          ['i32', 'sin_zero'],
          ['i16', 'sin_zero_b'],
        ]),
        msghdr_layout: Runtime.generateStructInfo([
          ['*', 'msg_name'],
          ['i32', 'msg_namelen'],
          ['*', 'msg_iov'],
          ['i32', 'msg_iovlen'],
          ['*', 'msg_control'],
          ['i32', 'msg_controllen'],
          ['i32', 'msg_flags'],
        ]),
        getSocket:function($fd){
            return ENetSockets.sockets[$fd];
        },
        create:function(){
            var fd;
            var socket;
            try{
                fd = ENetSockets.nextFd++;
                socket = ENetSockets.sockets[fd]=require('dgram').createSocket("udp4",function(msg,rinfo){
                    //que each packet it will be de-queed when recvmsg() is called
                    socket.packets.push({
                          data:msg,
                          dataLength:msg.length,
                          ip:rinfo.address,
                          port:rinfo.port
                    });
                });
                socket.packets = [];
                return fd;
            }catch(e){
                return -1;
            }            
        },
        bind:function($socket,$address){
          var $host=0;
          var $port=0;
          if($address){
              $host = HEAPU32[(($address)>>2)];
              $port = HEAPU16[(($address+4)>>1)];
          }
          if(ENetSockets.sockets[$socket]){
              //console.error("binding to",long2ip($host),$port);
              try{
                ENetSockets.sockets[$socket].bind($port,ENetSockets.long2ip($host));
                return 0;
              }catch(E){
                return -1;
              }
          }else{
              ___setErrNo(ERRNO_CODES.EBADF);
          }
          return -1;
        },
        get_sockaddr_in:function($sin){
          return ({
              "family": HEAP32[($sin+0)>>1],
              "port":   HEAPU16[($sin+4)>>1],
              "addr":   HEAPU32[($sin+8)>>2]
          });
        },
        set_sockaddr_in:function($sin,family,port,address){
          HEAP32[($sin+0)>>1] = family;
          HEAP16[($sin+4)>>1] = port;
          HEAPU32[($sin+8)>>2] = address;
        },
          /*
           * http://pubs.opengroup.org/onlinepubs/009695399/functions/recvmsg.html
           */
         recvMsg: function($sockfd, $msgHdr, $flags){
          var udpsocket = ENetSockets.sockets[$sockfd];
          if(!udpsocket) {
             ___setErrNo(ERRNO_CODES.EBADF);
             return -1;
          }
          if(!udpsocket.packets.length){
             ___setErrNo(ERRNO_CODES.EAGAIN);
             return -1;
          }
          var packet = udpsocket.packets.shift();
          if(!packet){
            ___setErrNo(ERRNO_CODES.EAGAIN);
            return -1;
          }
          var $sin=HEAP32[(($msgHdr)>>2)];
          var $buffer=HEAP32[(($msgHdr+8)>>2)];
          var $buffer_size = HEAP32[(($buffer+4)>>2)];
          HEAP32[(($buffer+4)>>2)]=packet.dataLength;

          var $data=HEAP32[($buffer)>>2];

          for(var i=0;i<packet.dataLength && i<$buffer_size;i++){
            HEAPU8[($data+i)|0]=packet.data.readUInt8(i);
          }
          ENetSockets.set_sockaddr_in($sin,1,_htons(packet.port),ENetSockets.ip2long(packet.ip));
          if(packet.dataLength > $buffer_size){
            //MSG_TRUNC shall be set in the msg_flags member of the msghdr structure
            HEAP32[($msgHdr+16)>>2] = 0x20;
          }
          return packet.dataLength;
        },
        sendMsg:function($sockfd, $msgHdr, $flags){
          var udpsocket = ENetSockets.sockets[$sockfd];
          if(!udpsocket) {
             ___setErrNo(ERRNO_CODES.EBADF);
             return -1;
          }
          var chunks = [];
          var chunk;
          var chunkLength;
          var $sin=HEAP32[(($msgHdr)>>2)];
          var $buffers=HEAP32[(($msgHdr+8)>>2)];
          var $bufferCount=HEAPU32[($msgHdr+12)>>2];
          var packet = {};
          var addr = ENetSockets.get_sockaddr_in($sin);
          var $x,i;
          for($x=0; $x < $bufferCount ; $x++ ){
              chunkLength = HEAP32[(($buffers+($x<<3)+4)>>2)];
              chunk = new Buffer(chunkLength);
              $data=HEAP32[($buffers+($x<<3))>>2]
              if(!chunkLength) continue;
              //Copy HEAP into node Buffer
              for(i=0;i<chunkLength;i++){
                chunk.writeUInt8(HEAPU8[($data+i)|0],i);
              }
              chunks.push(chunk);
           }

           //HEAP16[(($sin)>>1)]  //AF_INET == 1
           packet.ip = ENetSockets.long2ip(addr.addr);
           packet.port=_ntohs(addr.port);
           packet.data = ENetSockets.bufferConcat(chunks);
           packet.dataLength = packet.data.length;
           try{
                udpsocket.send(packet.data,0,packet.data.length,packet.port,packet.ip);
           }
           catch(E){
                ___setErrNo(ERRNO_CODES.EIO);
                return -1;
           }
           return packet.data.length;
        },
        destroy:function($socket){
          if(ENetSockets.sockets[$socket]){
              ENetSockets.sockets[$socket].close();
              delete ENetSockets.sockets[$socket];
          }
        },
        long2ip:function long2ip(l, source) {
             if(l<0){
                 throw('long2ip got a negative number!');
             }
             with (Math) {   
                var ip1 = floor(l/pow(256,3));
                var ip2 = floor((l%pow(256,3))/pow(256,2));
                var ip3 = floor(((l%pow(256,3))%pow(256,2))/pow(256,1));
                var ip4 = floor((((l%pow(256,3))%pow(256,2))%pow(256,1))/pow(256,0));
            }
            return ip1 + '.' + ip2 + '.' + ip3 + '.' + ip4;
        },
        ip2long:function(ip) {
            var ips = ip.split('.');
            var iplong = 0;
            with (Math) {
                iplong = ips[0]*pow(256,3)+ips[1]*pow(256,2)+ips[2]*pow(256,1)+ips[3]*pow(256,0);
            }
            if(iplong<0) throw ('ip2long produced a negative number! '+iplong);
            return iplong;
        },
        bufferConcat:function( buffers ){
            var totalLength = 0;
            buffers.forEach(function(B){
                if(!B || !B.length) return;
                totalLength = totalLength + B.length;
            });
            if(!totalLength) return [];
        
            var buf = new Buffer(totalLength);
            var i = 0;
            buffers.forEach(function(B){
                for(var b=0; b<B.length;b++){
                    buf.writeUInt8(B.readUInt8(b),i);
                    i++;
                }
            });
            return buf;
        }

    },

    init_enet_sockets_backend__deps: ['$ENetSockets'],
    init_enet_sockets_backend:function(){
    }
};

mergeInto(LibraryManager.library, node_sockets);
