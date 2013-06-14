  // ==========================================================================
  // sockets. Note that the implementation assumes all sockets are always
  // nonblocking
  // ==========================================================================
mergeInto(LibraryManager.library, {
  $NodeSockets__deps: ['__setErrNo', '$ERRNO_CODES'],
  $NodeSockets: {
    BUFFER_SIZE: 10*1024, // initial size
    MAX_BUFFER_SIZE: 10*1024*1024, // maximum size we will grow the buffer
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
    ])
   },
   close__deps: ['$FS', '__setErrNo', '$ERRNO_CODES'],
   close: function(fildes) {
     // int close(int fildes);
     // http://pubs.opengroup.org/onlinepubs/000095399/functions/close.html
     if(FS.streams[fildes].socket){
        if(typeof FS.streams[fildes].close == 'function') FS.streams[fildes].close();//udp sockets
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
        if(!(family == {{{ cDefine('AF_INET') }}} || family == {{{ cDefine('PF_INET') }}}))
        {
            ___setErrNo(ERRNO_CODES.EAFNOSUPPORT);
            return -1;
        }

        var stream = type == {{{ cDefine('SOCK_STREAM') }}};
        var dgram = type == {{{ cDefine('SOCK_DGRAM') }}};

        if (protocol) {
          assert(stream == (protocol == {{{ cDefine('IPPROTO_TCP') }}})); // if stream, must be tcp
          assert(dgram  == (protocol == {{{ cDefine('IPPROTO_UDP') }}})); // if dgram, must be udp
        }

        try{
         if(stream){
          fd = FS.createFileHandle({
            connected: false,
            stream: true,
            socket: true, //real socket will be created when bind() or connect() is called 
                          //to choose between server and connection sockets
            inQueue: []
          });
         }else if(dgram){
          fd = FS.createFileHandle({
            connected: false,
            stream: false,
            dgram: true,
            socket: new require("dgram").createSocket('udp4'),
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
    connect__deps: ['$NodeSockets', '_inet_ntop_raw', 'htons', 'gethostbyname', '__setErrNo', '$ERRNO_CODES'],
    connect: function(fd, addr, addrlen) {
        if(typeof fd == 'number' && (fd > 64 || fd < 1) ){
            ___setErrNo(ERRNO_CODES.EBADF); return -1;
        }
        var info = FS.streams[fd];
        if (!info) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }

        info.connected = true;

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

        info.addr = getValue(addr + NodeSockets.sockaddr_in_layout.sin_addr, 'i32');
        info.port = _htons(getValue(addr + NodeSockets.sockaddr_in_layout.sin_port, 'i16'));
        info.host = __inet_ntop_raw(info.addr);

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
              info.socket = new require("net").connect({host:info.host,port:info.port,localAddress:info.local_host},function(){
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
        return _recvfrom(fd,buf,len,flags,0,0);
    },
    send__deps: ['$NodeSockets'],
    send: function(fd, buf, len, flags) {
        var info = FS.streams[fd];
        if (!info) return -1;
        info.sender(HEAPU8.subarray(buf, buf+len));
        return len;
    },
    sendmsg__deps: ['$NodeSockets', 'connect'],
    sendmsg: function(fd, msg, flags) {
        var info = FS.streams[fd];
        if (!info) return -1;
        // if we are not connected, use the address info in the message
        if (!info.connected) {
          var name = {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_name', '*') }}};
          assert(name, 'sendmsg on non-connected socket, and no name/address in the message');
          if(info.stream) _connect(fd, name, {{{ makeGetValue('msg', 'NodeSockets.msghdr_layout.msg_namelen', 'i32') }}});
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
        info.sender(buffer,__inet_ntop_raw( getValue(name+NodeSockets.sockaddr_in_layout.sin_addr,'i32')),
                _htons(getValue(name+NodeSockets.sockaddr_in_layout.sin_port,'i16'))); // send all the iovs as a single message
        return ret;
    },
    recvmsg__deps: ['$NodeSockets', 'connect', 'recv', '__setErrNo', '$ERRNO_CODES', 'htons'],
    recvmsg: function(fd, msg, flags) {
        var info = FS.streams[fd];
        if (!info) return -1;
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
        
        // write source
        if(info.connected){
            {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_addr', 'info.addr', 'i32') }}};
            {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_port', '_htons(info.port)', 'i16') }}};
        }else{
            //assuming a dgram.. (howabout a tcp socket from accept() ?...)
            {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_addr', 'buffer.from.addr', 'i32') }}};
            {{{ makeSetValue('name', 'NodeSockets.sockaddr_in_layout.sin_port', '_htons(buffer.from.port)', 'i16') }}};
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
        if (!info) return -1;
        if (!info.hasData()) {
          ___setErrNo(ERRNO_CODES.EAGAIN); // no data, and all sockets are nonblocking, so this is the right behavior
          return -1;
        }
        var buffer = info.inQueue.shift();
        if(addr){
            //assuming udp socket..
            {{{ makeSetValue('addr', 'NodeSockets.sockaddr_in_layout.sin_addr', 'buffer.from.addr', 'i32') }}};
            {{{ makeSetValue('addr', 'NodeSockets.sockaddr_in_layout.sin_port', '_htons(buffer.from.port)', 'i16') }}};
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
        if (!info) return -1;
        if(info.socket) _close(fd);
        return 0;
    },
    
    ioctl: function(fd, request, varargs) {
        var info = FS.streams[fd];
        if (!info) return -1;
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
        if (!info) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        function inet_addr_raw(str) {
            var b = str.split(".");
            return (Number(b[0]) | (Number(b[1]) << 8) | (Number(b[2]) << 16) | (Number(b[3]) << 24)) >>> 0;
        }
        try{
          if(addr){
            info.local_addr = getValue(addr + NodeSockets.sockaddr_in_layout.sin_addr, 'i32');
            info.local_port = _htons(getValue(addr + NodeSockets.sockaddr_in_layout.sin_port, 'i16'));
            info.local_host = __inet_ntop_raw(info.local_addr);
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
                    var buf = new Uint8Array(msg);
                    //console.log("received:",msg);
                    buf.from = {
                        addr: inet_addr_raw(rinfo.address),
                        port: rinfo.port
                    }
                    info.inQueue.push(buf);
               });
               
               info.sender = function(buf,ip,port){
                    var buffer = new Buffer(buf);
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
        if (!info) {
            ___setErrNo(ERRNO_CODES.ENOTSOCK); return -1;
        }
        assert(info.stream);
        info.server = require("net").createServer();
        info.server.listen(info.local_port||0,info.local_host,backlog,function(){
            //todo: complete.. que incoming connections..
        });
        return 0;
    },
    accept: function(fd, addr, addrlen) {
        return -1;
/*
    var info = NodeSockets.fds[fd];
    if (!info) return -1;
    if (addr) {
      setValue(addr + NodeSockets.sockaddr_in_layout.sin_addr, info.addr, 'i32');
      setValue(addr + NodeSockets.sockaddr_in_layout.sin_port, info.port, 'i32');
      setValue(addrlen, NodeSockets.sockaddr_in_layout.__size__, 'i32');
    }
    return fd;
*/
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

