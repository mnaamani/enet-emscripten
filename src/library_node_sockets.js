  // ==========================================================================
  // sockets. Note that the implementation assumes all sockets are always
  // nonblocking
  // ==========================================================================
mergeInto(LibraryManager.library, {
  $NodeSockets__deps: ['__setErrNo', '$ERRNO_CODES'],
  $NodeSockets: {
    sockaddr_in_layout: Runtime.generateStructInfo([
      ['i32', 'sin_family'],
      ['i16', 'sin_port'],
      ['i32', 'sin_addr'],
      ['i32', 'sin_zero'],
      ['i16', 'sin_zero_b'],
    ]),
    sockaddr_in6_layout: Runtime.generateStructInfo([
      ['i16', 'sin6_family'],
      ['i16', 'sin6_port'],
      ['i32', 'sin6_flowinfo'],
      ['b16', 'sin6_addr'],//<< struct in6_addr
      ['i32', 'sin6_scopeid'],
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
    inet_aton_raw: function(str) {
        var b = str.split(".");
        return (Number(b[0]) | (Number(b[1]) << 8) | (Number(b[2]) << 16) | (Number(b[3]) << 24)) >>> 0;
    },
    inet_ntoa_raw: function(addr) {
        return (addr & 0xff) + '.' + ((addr >> 8) & 0xff) + '.' + ((addr >> 16) & 0xff) + '.' + ((addr >> 24) & 0xff)
    },
    DGRAM:function(){
        if(typeof require !== 'undefined') return require("dgram");//node or browserified
#if CHROME_SOCKETS
        if(chrome && chrome.socket) return NodeSockets.ChromeDgram();
#endif
        assert(false);        
    },
    NET:function(){
        if(typeof require !== 'undefined') return require("net");//node or browserified
#if CHROME_SOCKETS
        if(chrome && chrome.socket) return NodeSockets.ChromeNet();
#endif
        assert(false);
    },

#if CHROME_SOCKETS
    ChromeNet: undefined,       /* use https://github.com/GoogleChrome/net-chromeify.git ? (Apache license)*/
    ChromeDgram: function(){
        /*
         *  node dgram API from chrome.socket API - using Uint8Array() instead of Buffer()
         *  Copyright (C) 2013 Mokhtar Naamani
         *  license: MIT
         */
        var exports = {};

        exports.createSocket = function (type, message_event_callback){
            assert( type === 'udp4');
            return new UDPSocket(message_event_callback);
        }

        function UDPSocket(msg_evt_cb){
            var self = this;
            self._event_listeners = {};

            self.on("listening",function(){
                //send pending datagrams..
                self.__pending.forEach(function(job){
                    job.socket_id = self.__socket_id;
                    send_datagram(job);            
                });
                delete self.__pending;
                //start polling socket for incoming datagrams
                self.__poll_interval = setInterval(do_recv,30);
                console.log("chrome socket bound to:",JSON.stringify(self.address()));
            });

            if(msg_evt_cb) self.on("message",msg_evt_cb);

            function do_recv(){
                if(!self.__socket_id) return;
                chrome.socket.recvFrom(self.__socket_id, undefined, function(info){
                    var buff;
                    //todo - set correct address family
                    //todo - error detection.
                    if(info.resultCode > 0){
                        buff = new Uint8Array(info.data);
                        self.emit("message",buff,{address:info.address,port:info.port,size:info.data.byteLength,family:'IPv4'});
                    }
                });
            }
            self.__pending = [];//queued datagrams to send (if app tried to send before socket is ready)
        }

        UDPSocket.prototype.on = function(e,cb){
            //used to register callbacks
            //store event name e in this._events 
            this._event_listeners[e] ? this._event_listeners[e].push(cb) : this._event_listeners[e]=[cb];

        };

        UDPSocket.prototype.emit = function(e){
            //used internally to fire events
            //'apply' event handler function  to 'this' channel pass eventname 'e' and arguemnts.slice(1)
            var self = this;
            var args = Array.prototype.slice.call(arguments);

            if(this._event_listeners && this._event_listeners[e]){
                this._event_listeners[e].forEach(function(cb){
                    cb.apply(self,args.length>1?args.slice(1):[undefined]);
                });
            }
        };

        UDPSocket.prototype.close = function(){
            //Close the underlying socket and stop listening for data on it.
            if(!self.__socket_id) return;
            chrome.socket.destroy(self.__socket_id);
            clearInterval(self.__poll_interval);
            delete self.__poll_interval;
        };

        UDPSocket.prototype.bind = function(port,address){
            var self = this;
            address = address || "0.0.0.0";
            port = port || 0;
            if(self.__socket_id || self.__bound ) return;//only bind once!
            self.__bound = true;
            chrome.socket.create('udp',{},function(socketInfo){
                self.__socket_id = socketInfo.socketId;
                chrome.socket.bind(self.__socket_id,address,port,function(result){
                    chrome.socket.getInfo(self.__socket_id,function(info){
                      self.__local_address = info.localAddress;
                      self.__local_port = info.localPort;
                      self.emit("listening");
                    });
                });
            });
        };

        UDPSocket.prototype.address = function(){
            return({address:this.__local_address,port:this.__local_port});
        };

        UDPSocket.prototype.setBroadcast = function(flag){
            //do chrome udp sockets support broadcast?
        };

        UDPSocket.prototype.send = function(buff, offset, length, port, address, callback){
            var self = this;
            var job = {
                    socket_id:self.__socket_id,
                    buff:buff,
                    offset:offset,
                    length:length,
                    port:port,
                    address:address,
                    callback:callback
            };
            if(!self.__socket_id){
                 if(!self.__bound) self.bind();
                 self.__pending.push(job);
            }else{
                send_datagram(job);
            }

        };

        function send_datagram(job){
            var data;
            var buff;
            var i;
            if(job.offset == 0 && job.length == job.buff.length){ 
                buff = job.buff;
            }else{
                buff = job.buff.subarray(job.offset,job.offset+job.length);
            }
            data = buff.buffer;
            chrome.socket.sendTo(job.socket_id,data,job.address,job.port,function(result){
                var err;
                if(result.bytesWritten < data.byteLength ) err = 'truncation-error';
                if(result.bytesWritten < 0 ) err = 'send-error';
                if(job.callback) job.callback(err,result.bytesWritten);
            });
        }

         return exports;

        },
#endif
   },
   htonl: function(value) {
    return ((value & 0xff) << 24) + ((value & 0xff00) << 8) +
           ((value & 0xff0000) >>> 8) + ((value & 0xff000000) >>> 24);
   },
   htons: function(value) {
    return ((value & 0xff) << 8) + ((value & 0xff00) >> 8);
   },
   ntohl: 'htonl',
   ntohs: 'htons',
   inet_addr: function(ptr) {
     var b = Pointer_stringify(ptr).split(".");
     if (b.length !== 4) return -1; // we return -1 for error, and otherwise a uint32. this helps inet_pton differentiate
     return (Number(b[0]) | (Number(b[1]) << 8) | (Number(b[2]) << 16) | (Number(b[3]) << 24)) >>> 0;
   },
  inet_ntoa__deps: ['$NodeSockets'],
  inet_ntoa: function(in_addr) {
    if (!_inet_ntoa.buffer) {
      _inet_ntoa.buffer = _malloc(1024);
    }
    var addr = getValue(in_addr, 'i32');
    var str = NodeSockets.inet_ntoa_raw(addr);
    writeStringToMemory(str.substr(0, 1024), _inet_ntoa.buffer);
    return _inet_ntoa.buffer;
  },

  inet_aton__deps: ['inet_addr'],
  inet_aton: function(cp, inp) {
    var addr = _inet_addr(cp);
    setValue(inp, addr, 'i32');
    if (addr < 0) return 0;
    return 1;
  },
   close__deps: ['$FS', '__setErrNo', '$ERRNO_CODES'],
   close: function(fildes) {
     // int close(int fildes);
     // http://pubs.opengroup.org/onlinepubs/000095399/functions/close.html
     if(FS.streams[fildes].socket){
        if(typeof FS.streams[fildes].close == 'function') FS.streams[fildes].close();//udp sockets, tcp listening sockets
        if(typeof FS.streams[fildes].end == 'function') FS.streams[fildes].end();//tcp connections
        return 0;
     }

     if (FS.streams[fildes]) {
      if (FS.streams[fildes].currentEntry) {
        _free(FS.streams[fildes].currentEntry);
      }
      FS.streams[fildes] = null;
      return 0;
     } else {
      ___setErrNo(ERRNO_CODES.EBADF);
      return -1;
     }
    },
    socket__deps: ['$NodeSockets', '__setErrNo', '$ERRNO_CODES'],
    socket: function(family, type, protocol) {
        var fd;
        //if(!(family == {{{ cDefine('AF_INET') }}} || family == {{{ cDefine('PF_INET') }}}))
        if(!(family == {{{ cDefine('AF_INET') }}} || family == 2 || family == {{{ cDefine('AF_INET6')}}}))
        {
            ___setErrNo(ERRNO_CODES.EAFNOSUPPORT);
            return -1;
        }
        var v6 = (family == {{{ cDefine('AF_INET6')}}})

        var stream = type == {{{ cDefine('SOCK_STREAM') }}};
        //var dgram = type == {{{ cDefine('SOCK_DGRAM') }}};
        var dgram = type == 20;

        if (protocol) {
          assert(stream == (protocol == {{{ cDefine('IPPROTO_TCP') }}})); // if stream, must be tcp
          //assert(dgram  == (protocol == {{{ cDefine('IPPROTO_UDP') }}})); // if dgram, must be udp
          assert(dgram  == (protocol == 2)); // if dgram, must be udp
        }

        try{
         if(stream){
          fd = FS.createFileHandle({
            addrlen : v6 ? NodeSockets.sockaddr_in6_layout.__size__ : NodeSockets.sockaddr_in_layout.__size__ ,
            connected: false,
            stream: true,
            socket: true, //real socket will be created when bind() or connect() is called 
                          //to choose between server and connection sockets
            inQueue: []
          });
         }else if(dgram){
          fd = FS.createFileHandle({
            addrlen : v6 ? NodeSockets.sockaddr_in6_layout.__size__ : NodeSockets.sockaddr_in_layout.__size__ ,
            connected: false,
            stream: false,
            dgram: true,
            socket: new NodeSockets.DGRAM().createSocket(v6?'udp6':'udp4'),
            inQueue: []
          });
         }else{
            ___setErrNo(ERRNO_CODES.EPROTOTYPE);
            return -1;
         }
#if SOCKET_DEBUG
        console.log("created socket:",fd);
#endif
         return fd;
        }catch(e){
            ___setErrNo(ERRNO_CODES.EACCES);
            return -1;
        }
    },
   /*
    *   http://pubs.opengroup.org/onlinepubs/009695399/functions/connect.html
    */
    connect__deps: ['$NodeSockets', 'htons', '__setErrNo', '$ERRNO_CODES'],
    connect: function(fd, addr, addrlen) {
        if(typeof fd == 'number' && (fd > 64 || fd < 1) ){
            ___setErrNo(ERRNO_CODES.EBADF); return -1;
        }
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }

        if(info.dgram){
            if (info.socket._bound || info.socket.__receiving){

            }else { _bind(fd); }
        }

        if(info.stream && info.CONNECTING){
            ___setErrNo(ERRNO_CODES.EALREADY); return -1;
        }
        if(info.stream && info.ESTABLISHED){
            ___setErrNo(ERRNO_CODES.EISCONN); return -1;
        }
        if(info.stream && info.CLOSED){
            //only do a successful connect once per socket
            ___setErrNo(ERRNO_CODES.ECONNRESET); return -1;
        }
        if(info.stream && info.socket.server){
            //listening tcp socket cannot connect
            ___setErrNo(ERRNO_CODES.EOPNOTSUPP); return -1;
        }

        info.connected = true;

        assert( info.addrlen === addrlen );
        switch(addrlen){
            case NodeSockets.sockaddr_in_layout.__size__:
                info.addr = getValue(addr + NodeSockets.sockaddr_in_layout.sin_addr, 'i32');
                info.port = _htons(getValue(addr + NodeSockets.sockaddr_in_layout.sin_port, 'i16'));
                info.host = NodeSockets.inet_ntoa_raw(info.addr);
                break;
            case NodeSockets.sockaddr_in6_layout.__size__:
                info.addr = new Uint16Array(8);
                info.addr.set(HEAPU16.subarray((addr+NodeSockets.sockaddr_in6_layout.sin6_addr)>>1,(addr+NodeSockets.sockaddr_in6_layout.sin6_addr+16)>>1));
                info.port = _htons(getValue(addr + NodeSockets.sockaddr_in6_layout.sin_port, 'i16'));
                info.host = __inet_ntop_raw(info.addr);//fix
                break;
        }

        if(!info.stream) return 0;

        (function(info){
            var intervalling = false, interval;
            var outQueue = [];
            info.hasData = function() { return info.inQueue.length > 0 }
            info.CONNECTING = true;

            function onEnded(){
                info.ESTABLISHED = false;
                info.CLOSED = true;
            }
            info.sender = function(buf){
                outQueue.push(buf);
                trySend();
            };

            function send(data) {
                var buff = new Buffer(data);
                if(!info.socket.write(buff)) info.paused = true;
            }
            function trySend() {
                if (!info.ESTABLISHED) {
                  if (!intervalling) {
                    intervalling = true;
                    interval = setInterval(trySend, 100);
                  }
                  return;
                }
                for (var i = 0; i < outQueue.length; i++) {
                   send(outQueue[i]);
                }
                outQueue.length = 0;
                if (intervalling) {
                    intervalling = false;
                    clearInterval(interval);
                }
            }

            try{
              info.socket = new NodeSockets.NET().connect({host:info.host,port:info.port,localAddress:info.local_host},function(){
                info.CONNECTING = false;
                info.ESTABLISHED = true;
              });
            }catch(e){
                return -1;
            }

            info.socket.on('drain',function(){
               info.paused = false;
            });

            info.socket.on('data',function(buf){
                info.inQueue.push(new Uint8Array(buf));
            });

            info.socket.on('close',onEnded);
            info.socket.on('error',onEnded);
            info.socket.on('end',onEnded);
            info.socket.on('timeout',function(){
                info.socket.end();
                onEnded();
            });
        })(info);
        //for tcp we always return and do an async connect irrespective of socket option O_NONBLOCK
        ___setErrNo(ERRNO_CODES.EINPROGRESS); return -1;
    },
    recv__deps: ['$NodeSockets','recvfrom'],
    recv: function(fd, buf, len, flags) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        return _recvfrom(fd,buf,len,flags,0,0);
    },
    send__deps: ['$NodeSockets'],
    send: function(fd, buf, len, flags) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        info.sender(HEAPU8.subarray(buf, buf+len));
        return len;
    },
    sendmsg__deps: ['$NodeSockets', 'connect'],
    sendmsg: function(fd, msg, flags) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }

        // if we are not connected, use the address info in the message
        var name = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_name', '*') }}};
        var namelen = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_namelen', 'i32') }}};
        if (!info.connected) {
          assert(name, 'sendmsg on non-connected socket, and no name/address in the message');
          if(info.stream) _connect(fd, name, namelen);
        }
        var iov = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_iov', 'i8*') }}};
        var num = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_iovlen', 'i32') }}};
#if SOCKET_DEBUG
          Module.print('sendmsg vecs: ' + num);
#endif
        var totalSize = 0;
        for (var i = 0; i < num; i++) {
          totalSize += {{{ makeGetValue('iov', '8*i + 4', 'i32') }}};
        }
        var buffer = new Uint8Array(totalSize);
        var ret = 0;
        for (var i = 0; i < num; i++) {
          var currNum = {{{ makeGetValue('iov', '8*i + 4', 'i32') }}};
#if SOCKET_DEBUG
         Module.print('sendmsg curr size: ' + currNum);
#endif
          if (!currNum) continue;
          var currBuf = {{{ makeGetValue('iov', '8*i', 'i8*') }}};
          buffer.set(HEAPU8.subarray(currBuf, currBuf+currNum), ret);
          ret += currNum;
        }
        assert( info.addrlen === namelen );
        var addr,port,host;
        switch(namelen){
            case NodeSockets.sockaddr_in_layout.__size__:
                addr = getValue(name + NodeSockets.sockaddr_in_layout.sin_addr, 'i32');
                port = _htons(getValue(name + NodeSockets.sockaddr_in_layout.sin_port, 'i16'));
                host = NodeSockets.inet_ntoa_raw(addr);
                break;
            case NodeSockets.sockaddr_in6_layout.__size__:
                addr = new Uint16Array(8);
                addr.set(HEAPU16.subarray((name+NodeSockets.sockaddr_in6_layout.sin6_addr)>>1,(name+NodeSockets.sockaddr_in6_layout.sin6_addr+16)>>1));
                port = _htons(getValue(name + NodeSockets.sockaddr_in6_layout.sin_port, 'i16'));
                host = __inet_ntop_raw(addr);//fix
                break;
        }
        info.sender(buffer,host,port); // send all the iovs as a single message
        return ret;
    },
    recvmsg__deps: ['$NodeSockets', 'connect', 'recv', '__setErrNo', '$ERRNO_CODES', 'htons'],
    recvmsg: function(fd, msg, flags) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        if (!info.hasData()) {
          ___setErrNo(ERRNO_CODES.EWOULDBLOCK);
          return -1;
        }
        var buffer = info.inQueue.shift();
        var bytes = buffer.length;
#if SOCKET_DEBUG
        Module.print('recvmsg bytes: ' + bytes);
#endif
        var name = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_name', '*') }}};
        var namelen = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_namelen', 'i32') }}};
        assert( info.addrlen === namelen );
        switch(namelen){
            case NodeSockets.sockaddr_in_layout.__size__:
                // write source
                if(info.connected){
                    {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_addr', 'info.addr', 'i32') }}};
                    {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_port', '_htons(info.port)', 'i16') }}};
                }else{
                    //assuming a dgram.. (howabout a tcp socket from accept() ?...)
                    {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_addr', 'buffer.from.addr', 'i32') }}};
                    {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_port', '_htons(buffer.from.port)', 'i16') }}};
                }
                break;
            case NodeSockets.sockaddr_in6_layout.__size__:
                    //todo...ipv6 ccall('inet_pton',...) set the address
                    break;
        }
        
        // write data
        var ret = bytes;
        var iov = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_iov', 'i8*') }}};
        var num = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_iovlen', 'i32') }}};
        var bufferPos = 0;
        for (var i = 0; i < num && bytes > 0; i++) {
          var currNum = {{{ makeGetValue('iov', '8*i + 4', 'i32') }}};
#if SOCKET_DEBUG
          Module.print('recvmsg loop ' + [i, num, bytes, currNum]);
#endif
          if (!currNum) continue;
          currNum = Math.min(currNum, bytes); // XXX what should happen when we partially fill a buffer..?
          bytes -= currNum;
          var currBuf = {{{ makeGetValue('iov', '8*i', 'i8*') }}};
#if SOCKET_DEBUG
          Module.print('recvmsg call recv ' + currNum);
#endif
          HEAPU8.set(buffer.subarray(bufferPos, bufferPos + currNum), currBuf);
          bufferPos += currNum;
        }
        if (info.stream) {
          // This is tcp (reliable), so if not all was read, keep it
          if (bufferPos < bytes) {
            info.inQueue.unshift(buffer.subarray(bufferPos));
#if SOCKET_DEBUG
            Module.print('recvmsg: put back: ' + (bytes - bufferPos));
#endif
          }
        }
        return ret;
    },
    
    recvfrom__deps: ['$NodeSockets'],
    recvfrom: function(fd, buf, len, flags, addr, addrlen) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        if (!info.hasData()) {
          //todo: should return 0 if info.stream && info.CLOSED ?
          ___setErrNo(ERRNO_CODES.EAGAIN); // no data, and all sockets are nonblocking, so this is the right behavior
          return -1;
        }
        var buffer = info.inQueue.shift();
        if(addr){
            assert( info.addrlen === addrlen );
            switch(addrlen){
                case NodeSockets.sockaddr_in_layout.__size__:
                    {{{ makeSetValue('addr', 'NodeSockets.sockaddr_in_layout.sin_addr', 'buffer.from.addr', 'i32') }}};
                    {{{ makeSetValue('addr', 'NodeSockets.sockaddr_in_layout.sin_port', '_htons(buffer.from.port)', 'i16') }}};
                    break;
                case NodeSockets.sockaddr_in6_layout.__size__:
                    //todo: set ipv6 addrress using ccall('inet_pton'....)
                    {{{ makeSetValue('addr', 'NodeSockets.sockaddr_in_layout.sin6_port', '_htons(buffer.from.port)', 'i16') }}};
                    break;
            }
        }
#if SOCKET_DEBUG
        Module.print('recv: ' + [Array.prototype.slice.call(buffer)]);
#endif
        if (len < buffer.length) {
          if (info.stream) {
            // This is tcp (reliable), so if not all was read, keep it
            info.inQueue.unshift(buffer.subarray(len));
#if SOCKET_DEBUG
            Module.print('recv: put back: ' + (len - buffer.length));
#endif
          }
          buffer = buffer.subarray(0, len);
        }
        HEAPU8.set(buffer, buf);
        return buffer.length;
    },
    
    shutdown: function(fd, how) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        //todo: if how = 0 disable sending info.sender=function(){return -1;}
        //             = 1 disable receiving (delete info.inQueue?)
        if(info.socket && fd > 63){
            info.socket.close && info.socket.close();
            info.socket.end && info.socket.end();
        }
        if(info.socket) _close(fd);
        
        return 0;
    },
    
    ioctl: function(fd, request, varargs) {
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        var bytes = 0;
        if (info.hasData()) {
          bytes = info.inQueue[0].length;
        }
        var dest = {{{ makeGetValue('varargs', '0', 'i32') }}};
        {{{ makeSetValue('dest', '0', 'bytes', 'i32') }}};
        return 0;
    },
    
    setsockopt: function(d, level, optname, optval, optlen) {
        //console.log('ignoring setsockopt command');
        return 0;
    },
    
    bind__deps: ['connect'],
    bind: function(fd, addr, addrlen) {
        if(typeof fd == 'number' && (fd > 64 || fd < 1) ){
            ___setErrNo(ERRNO_CODES.EBADF); return -1;
        }
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        
        try{
          if(addr){
            assert(info.addrlen === addrlen);
            switch(addrlen){
                case NodeSockets.sockaddr_in_layout.__size__:
                    info.local_addr = getValue(addr + NodeSockets.sockaddr_in_layout.sin_addr, 'i32');
                    info.local_port = _htons(getValue(addr + NodeSockets.sockaddr_in_layout.sin_port, 'i16'));
                    info.local_host = NodeSockets.inet_ntoa_raw(info.local_addr);
                    break;
                case NodeSockets.sockaddr_in6_layout.__size__:
                    //todo: ipv6 .. __inet_ntop_raw..
                    assert(false,'bind(): IPv6 support not yet completed');
                    break;
            }

          }

          if(info.dgram){
                //if already bound return with error
               info.hasData = function(){return info.inQueue.length>0}
               info.socket.bind(info.local_port||0,info.local_host||undefined);
               info.socket.on('message',function(msg,rinfo){
                    if(info.host && info.connected){
                        //connected dgram socket will only accept packets from info.host:info.port
                        if(info.host !== rinfo.address || info.port !== rinfo.port) return;
                    }
#if CHROME_SOCKETS
                    var buf = msg;
#else
                    var buf = new Uint8Array(msg);
#endif                    
                    //console.log("received:",msg);
                    buf.from = {
                        addr: NodeSockets.inet_aton_raw(rinfo.address),
                        port: rinfo.port
                    }
                    info.inQueue.push(buf);
               });
               
               info.sender = function(buf,ip,port){
#if CHROME_SOCKETS
                    var buffer = buf;
#else
                    var buffer = new Buffer(buf);
#endif
                    //console.log("sending:",buffer,"to:",ip,port);
                    info.socket.send(buffer,0,buffer.length,port,ip);
               }
          }
          
        }catch(e){
            console.log(e);
            return -1;
        }
        return 0;
    },
    
    listen: function(fd, backlog) {
        if(typeof fd == 'number' && (fd > 64 || fd < 1) ){
            ___setErrNo(ERRNO_CODES.EBADF); return -1;
        }
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        assert(info.stream);
        info.socket = NodeSockets.NET().createServer();
        info.server = info.socket;//mark it as a listening socket
        info.connQueue = [];
        info.socket.listen(info.local_port||0,info.local_host,backlog,function(){});
        info.socket.on("connection",function(socket){
            info.connQueue.push(socket);
        });
        return 0;
    },
    
    accept: function(fd, addr, addrlen) {
        if(typeof fd == 'number' && (fd > 64 || fd < 1) ){
            ___setErrNo(ERRNO_CODES.EBADF); return -1;
        }
        var info = FS.streams[fd];
        if (!info || !info.socket) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        
        if(!info.server){   //not a listening socket
            ___setErrNo(ERRNO_CODES.EINVAL); return -1;
        }
        if(info.connQueue.length == 0) {
            ___setErrNo(ERRNO_CODES.EAGAIN); return -1;
        }
        
        var newfd = FS.createFileHandle({
            socket:false,   //newfd will be > 63
            inQueue:[]
        });

        if(newfd == -1){
            ___setErrNo(ERRNO_CODES.ENFILE); return -1;
        }

        var conn = FS.streams[newfd];
        conn.socket = info.connQueue.shift();
        
        conn.addr = NodeSockets.inet_aton_raw(conn.socket.remoteAddress);
        conn.port = _htons(conn.socket.remotePort);
        conn.host = conn.socket.remoteAddress;
                
        if (addr) {
            setValue(addr + NodeSockets.sockaddr_in_layout.sin_addr, conn.addr, 'i32');
            setValue(addr + NodeSockets.sockaddr_in_layout.sin_port, conn.port, 'i32');
            setValue(addrlen, NodeSockets.sockaddr_in_layout.__size__, 'i32');
        }
        
        (function(info){
            var intervalling = false, interval;
            var outQueue = [];
            info.hasData = function() { return info.inQueue.length > 0 }
            info.ESTABLISHED = true;

            function onEnded(){
                info.ESTABLISHED = false;
                info.CLOSED = true;
            }
            info.sender = function(buf){
                outQueue.push(buf);
                trySend();
            };

            function send(data) {
                var buff = new Buffer(data);
                if(!info.socket.write(buff)) info.paused = true;
            }
            function trySend() {
                if (!info.ESTABLISHED) {
                  if (!intervalling) {
                    intervalling = true;
                    interval = setInterval(trySend, 100);
                  }
                  return;
                }
                for (var i = 0; i < outQueue.length; i++) {
                   send(outQueue[i]);
                }
                outQueue.length = 0;
                if (intervalling) {
                    intervalling = false;
                    clearInterval(interval);
                }
            }

            info.socket.on('drain',function(){
               info.paused = false;
            });

            info.socket.on('data',function(buf){
                info.inQueue.push(new Uint8Array(buf));
            });

            info.socket.on('close',onEnded);
            info.socket.on('error',onEnded);
            info.socket.on('end',onEnded);
            info.socket.on('timeout',function(){
                info.socket.end();
                onEnded();
            });
        })(conn);
        
        return newfd;

    },
   /*
    *  http://pubs.opengroup.org/onlinepubs/009695399/functions/select.html
    */
    select: function(nfds, readfds, writefds, exceptfds, timeout) {
        // readfds are supported,
        // writefds checks socket open status
        // exceptfds not supported
        // timeout is always 0 - fully async
        assert(!exceptfds);
        
        var errorCondition = 0;

        function canRead(info) {
          // make sure hasData exists. 
          // we do create it when the socket is connected, 
          // but other implementations may create it lazily
          if(info.stream){
           if ((info.socket._readableState.ended || info.socket.errorEmitted ) && info.inQueue.length == 0) {
             errorCondition = -1;
             return false;
           }
           return info.hasData && info.hasData();
          }else{
            if(info.socket._receiving || info.socket._bound) return (info.hasData && info.hasData());           
            errorCondition = -1;
            return false;
          }
        }

        function canWrite(info) {
          // make sure socket exists. 
          // we do create it when the socket is connected, 
          // but other implementations may create it lazily
          if(info.stream){
              if (info.socket._writableState.ended || info.socket._writableState.ending || info.socket.errorEmitted) {
                errorCondition = -1;
                return false;
              }
              return info.socket && info.socket.writable
          }else{
            if(info.socket._receiving || info.socket._bound) return (info.hasData && info.hasData());           
            errorCondition = -1;
            return false;
          }
        }

        function checkfds(nfds, fds, can) {
          if (!fds) return 0;

          var bitsSet = 0;
          var dstLow  = 0;
          var dstHigh = 0;
          var srcLow  = {{{ makeGetValue('fds', 0, 'i32') }}};
          var srcHigh = {{{ makeGetValue('fds', 4, 'i32') }}};
          nfds = Math.min(64, nfds); // fd sets have 64 bits

          for (var fd = 0; fd < nfds; fd++) {
            var mask = 1 << (fd % 32), int = fd < 32 ? srcLow : srcHigh;
            if (int & mask) {
              // index is in the set, check if it is ready for read
              var info = FS.streams[fd];
              if (info && can(info)) {
                // set bit
                fd < 32 ? (dstLow = dstLow | mask) : (dstHigh = dstHigh | mask);
                bitsSet++;
              }
            }
          }

          {{{ makeSetValue('fds', 0, 'dstLow', 'i32') }}};
          {{{ makeSetValue('fds', 4, 'dstHigh', 'i32') }}};
          return bitsSet;
        }

        var totalHandles = checkfds(nfds, readfds, canRead) + checkfds(nfds, writefds, canWrite);
        if (errorCondition) {
          ___setErrNo(ERRNO_CODES.EBADF);
          return -1;
        } else {
          return totalHandles;
        }
    },

    socketpair__deps: ['__setErrNo', '$ERRNO_CODES'],
    socketpair: function(domain, type, protocol, sv) {
        // int socketpair(int domain, int type, int protocol, int sv[2]);
        // http://pubs.opengroup.org/onlinepubs/009695399/functions/socketpair.html
        ___setErrNo(ERRNO_CODES.EOPNOTSUPP);
        return -1;
    },
});
