var Queue = require("Queue").Queue;
var NODE_DGRAM = require("dgram");
var udp_sockets_count=0;
var udp_sockets = {};

var global_udp_callback = function(msg,rinfo,sfd){
    //que each packet it will be de-queed when recvmsg() is called
    var udpsocket = udp_sockets[sfd];
    if(udpsocket){
        udpsocket.packets.enqueue({
            data:msg,
            dataLength:msg.length,
            ip:rinfo.address,
            port:rinfo.port
        });
    }
}

/*
   long2ip and ip2long implementation taken from:
   http://a0002.blogspot.com/2008/06/ip-cidr-calculation-in-mysql-php-and.html
*/
function long2ip(l) {
    with (Math) {   
        var ip1 = floor(l/pow(256,3));
        var ip2 = floor((l%pow(256,3))/pow(256,2));
        var ip3 = floor(((l%pow(256,3))%pow(256,2))/pow(256,1));
        var ip4 = floor((((l%pow(256,3))%pow(256,2))%pow(256,1))/pow(256,0));
    }
    return ip1 + '.' + ip2 + '.' + ip3 + '.' + ip4;
}

function ip2long(ip) {
    var ips = ip.split('.');
    var iplong = 0;
    with (Math) {
        iplong = ips[0]*pow(256,3)+ips[1]*pow(256,2)+ips[2]*pow(256,1)+ips[3]*pow(256,0);
    }
    return iplong;
}

function BufferConcat( buffers ){
    var totalLength = 0;
    buffers.forEach(function(B){
        totalLength = totalLength + B.length;
    });    
    var buf = new Buffer(totalLength);
    var i = 0;
    buffers.forEach(function(B){
        for(var b=0; b<B.length;b++){
            buf[i]=B[b];
            i++;
        }
    });
    return buf;
}

function C_String_to_JS_String(ptr){
    var str = "";
    var i = 0;
    while (HEAP8[((ptr)+(i))]){         
         str = str + String.fromCharCode(HEAP8[((ptr)+(i))]);
         i++;
    }
    return str;
}
function JS_String_to_CString(jstr, ptr){
    var i=0;
    for(;i<jstr.length;){
        HEAP8[(((ptr+i)|0))]=jstr.charCodeAt(i);
        i++;
    }
    HEAP8[(((ptr+i)|0))]=0;//terminating null
}


var _static_ntoa_buffer;

var Module = {
    'preRun':function(){
    
        _static_ntoa_buffer=allocate(16, "i8", ALLOC_STATIC);
        
        _inet_ntoa=function($in_0) {
              var __stackBase__  = STACKTOP; STACKTOP += 4; assert(STACKTOP % 4 == 0, "Stack is unaligned"); assert(STACKTOP < STACK_MAX, "Ran out of stack");
              var __label__;
              var $in=__stackBase__;
              var $1=(($in)|0);
              HEAP32[(($1)>>2)]=$in_0;
              var $2=(($in)|0);             
              var addr = long2ip( HEAP32[(($2)>>2)] );
              //console.log("addr=",addr);
              JS_String_to_CString( addr, _static_ntoa_buffer);                            
              STACKTOP = __stackBase__;
              return ((_static_ntoa_buffer)|0);
        };
        
        
       //int inet_aton(const char *cp, struct in_addr *inp);
       /*
         inet_aton() converts the Internet host address cp from  the  IPv4  num‐
         bers-and-dots  notation  into  binary  form (in network byte order) and
         stores it in the structure that inp  points  to.   inet_aton()  returns
         nonzero  if the address is valid, zero if not.                
       */
       
        _inet_aton=function($cp, $inp){
              var $address = ip2long(C_String_to_JS_String($cp));
              var $1=(($inp)|0);
              HEAP32[(($1)>>2)]=$address;              
              //console.log("converting",C_String_to_JS_String($cp),"to",$address);
              return 1;
        };                
        
        _htonl = function(value) {
            var h16 = value >> 16;
            var l16 = value & 0x0000ffff;
            var nh16 = _htons(l16) << 16;
            var nl16 = _htons(h16);
            return (nh16 + nl16);
        };
        _ntohl = _htonl;
        
        
        //enet API stub functions from unix.c       
        _enet_socket_create =function(){
            //console.log("enet_socket_create()",arguments);
            var sfd;
            try{
                udp_sockets_count++;
                sfd = udp_sockets_count;
                udp_sockets[sfd]=NODE_DGRAM.createSocket("udp4",function(msg,rinfo){
                    global_udp_callback(msg,rinfo,sfd);
                });
                udp_sockets[sfd].packets = new Queue();

            }catch(e){
                sfd=-1;
            }            
            return sfd;
        };
        
        _enet_socket_bind = function($socket,$address){
          //console.log("enet_socket_bind()",arguments);
          var $1;
          var $2;
          var $host;
          var $port;
          $1=$socket;
          $2=$address;
          var $3=$2;
          var $4=(($3)|0);
          var $5=HEAP32[(($4)>>2)];
          $host=$5;
          var $6=$2;
          var $7=(($6+4)|0);
          var $8=HEAP16[(($7)>>1)];
          $port=$8;          
          if(udp_sockets[$socket]){
              console.error("binding to port",$port);
              udp_sockets[$socket].bind($port,long2ip($host));
              return 0;
          }
          return -1;//todo: set error number
        };
        
        _enet_socket_listen = function($socket, $backlog){
          console.error("enet_socket_listen()",arguments);
        };        
        _enet_socket_set_option = function(){
            //console.log("enet_socket_set_option()",arguments);
            return 0;
        };
        
        _recvmsg = function($sockfd, $msgHdr, $flags) {
          var udpsocket = udp_sockets[$sockfd];
          if(!udpsocket) return -1;
          if(!udpsocket.packets.getLength()) return 0;
          //dequeue
          var packet = udpsocket.packets.dequeue();
          if(!packet) return 0;
          //console.log("Dequeing:",packet);
          //console.log(packet.data.toString());          
          var $1;
          var $2;
          var $3;
          var $sin;
          var $buffer;
          var $data;
          $1=$sockfd;
          $2=$msgHdr;
          $3=$flags;
          var $4=$2;
          var $5=(($4)|0);
          var $6=HEAP32[(($5)>>2)];
          var $7=$6;
          $sin=$7;
          var $8=$2;
          var $9=(($8+8)|0);
          var $10=HEAP32[(($9)>>2)];
          var $11=$10;
          $buffer=$11;
          var $12=$buffer;
          var $13=(($12+4)|0);
          HEAP32[(($13)>>2)]=packet.dataLength;//dataLength
          var $14=$buffer;
          var $15=(($14)|0);
          var $16=HEAP32[(($15)>>2)];
          $data=$16;
          var $17=$data;
          var $18=(($17)|0);
          //Copy Node Buffer packet.data into HEAP8[($data)|0],HEAP8[($data+1)|0]
          //MAX_MTU?
          for(var i=0;i<packet.dataLength;i++){
            HEAP8[($data+i)|0]=packet.data[i];
          }

          var $23=$sin;
          var $24=(($23)|0);
          HEAP16[(($24)>>1)]=1;
          var $25=ip2long(packet.ip);
          var $26=$sin;
          var $27=(($26+4)|0);
          var $28=(($27)|0);
          HEAP32[(($28)>>2)]=$25;
          var $29=_htons(packet.port);
          var $30=$sin;
          var $31=(($30+2)|0);
          HEAP16[(($31)>>1)]=$29;

          return packet.dataLength;//truncation??
        };
        
        _sendmsg = function($sockfd, $msgHdr, $flags) {
          var udpsocket = udp_sockets[$sockfd];
          if(!udpsocket) return -1;
          var chunks = [];
          var chunk;
          var chunkLength;
          var __label__;
          __label__ = 2; 
          while(1) switch(__label__) {
            case 2: 
              var $1;
              var $2;
              var $3;
              var $sin;
              var $buffers;
              var $x;
              var $data;
              $1=$sockfd;
              $2=$msgHdr;
              $3=$flags;
              var $4=$2;
              var $5=(($4)|0);
              var $6=HEAP32[(($5)>>2)];
              var $7=$6;
              $sin=$7;
              var $8=$2;
              var $9=(($8+8)|0);
              var $10=HEAP32[(($9)>>2)];
              var $11=$10;
              $buffers=$11;
              $x=0;
              __label__ = 3; break;
            case 3: 
              var $13=$x;
              var $14=$2;
              var $15=(($14+12)|0);
              var $16=HEAPU32[(($15)>>2)];
              var $17=(($13)>>>0) < (($16)>>>0);
              if ($17) { __label__ = 4; break; } else { __label__ = 6; break; }
            case 4: 
              var $19=$x;
              var $20=$buffers;
              var $21=(($20+($19<<3))|0);
              var $22=(($21+4)|0);
              //HEAP32[(($22)>>2)] dataLength
              chunkLength = HEAP32[(($22)>>2)];
              chunk = new Buffer(chunkLength);

              var $23=$x;
              var $24=$buffers;
              var $25=(($24+($23<<3))|0);
              var $26=(($25)|0);
              var $27=HEAP32[(($26)>>2)];
              $data=$27;
              var $28=$data;
              var $29=(($28)|0);
              /*
              HEAP8[($29)]=65;
              var $30=$data;
              var $31=(($30+1)|0);
              HEAP8[($31)]=66;
              */
              //Copy HEAP into node Buffer
              for(var i=0;i<chunkLength;i++){
                chunk[i] = HEAP8[($data+i)|0];
              }
              chunks.push(chunk);
              //console.log("adding chunk:",chunk,"length",chunk.length);
              __label__ = 5; break;
            case 5: 
              var $33=$x;
              var $34=((($33)+(1))|0);
              $x=$34;
              __label__ = 3; break;
            case 6: 
              var $36=$sin;
              var $37=(($36)|0);
              HEAP16[(($37)>>1)]=1;
              //var $38=_ip2long(((STRING_TABLE.__str)|0));
              var $39=$sin;
              var $40=(($39+4)|0);
              var $41=(($40)|0);
              //HEAP32[(($41)>>2)]  -> ipaddress
              //var $42=_htons(5555);
              var $43=$sin;
              var $44=(($43+2)|0);
              //HEAP16[(($44)>>1)]=$42;
              
              var packet = {};
              packet.ip = long2ip(HEAP32[(($41)>>2)]);
              packet.port=_ntohs(HEAP16[(($44)>>1)]);
              packet.data = BufferConcat(chunks);
              packet.dataLength = packet.data.length;
              udpsocket.send(packet.data,0,packet.data.length,packet.port,packet.ip,function(){
                 //console.log("Sent Packet:",packet);
              });
                  
              return packet.data.length;
            default: assert(0, "bad label: " + __label__);
          }
        };
        /*
        _enet_socket_send = function(){
            console.log("enet_socket_send",arguments);
            return;
        };
        _enet_socket_receive = function(){
            console.log("enet_socket_receive()",arguments);
            return 0;
        };
        */
        _enet_socket_wait = function(){
            console.error("enet_socket_wait()",arguments);
            return -1;//don't wait
        };
        _enet_socket_destroy = function($socket){
            //console.log("enet_socket_destroy()",arguments);
            if(udp_sockets[$socket]){
                udp_sockets[$socket].close();
                delete udp_sockets[$socket];
            }
        };
     }//preRun
}
