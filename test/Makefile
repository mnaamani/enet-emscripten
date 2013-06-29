EMCC=`which emcc`

enetsockets:
	$(EMCC) test.c -lenet -L../libs -I../include -o index.js --js-library ../src/library_enet_node_backend.js -s ASM_JS=0 -O2 -s LINKABLE=1

inet_ntop.o: ../src/inet_ntop.c
	$(EMCC) ../src/inet_ntop.c -o ../libs/inet_ntop.o

inet_pton.o: ../src/inet_pton.c
	$(EMCC) ../src/inet_pton.c -o ../libs/inet_pton.o

nodesockets: inet_ntop.o inet_pton.o
	$(EMCC) test-new.c ../libs/inet_ntop.o ../libs/inet_pton.o \
        -lenet -L../libs -I../include -o index-new.js \
        --js-library ../src/library_node_sockets.js -O2

test_inet.js: test_inet.c
	$(EMCC) test_inet.c ../libs/inet_ntop.o ../libs/inet_pton.o -o test_inet.js --js-library ../src/library_node_sockets.js

chrome-ext:
	$(EMCC) test-new.c -lenet -L../libs -I../include -o chrome/index.js --js-library ../src/library_node_sockets.js -s CHROME_SOCKETS=1 -O2 

oldway:
	$(EMCC) test.c -lenet -L../libs -I../include -o index.js --pre-js ../src/udp-socket-extension.js -s ASM_JS=0
