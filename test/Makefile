EMCC=`which emcc`

enetsockets:
	$(EMCC) test.c -lenet -L../libs -I../include -o index.js --js-library ../src/library_enet_node_backend.js -s ASM_JS=0 -O2 -s LINKABLE=1

inet_ntop.o: ../src/inet_ntop.c
	$(EMCC) ../src/inet_ntop.c -o ../libs/inet_ntop.o

inet_pton.o: ../src/inet_pton.c
	$(EMCC) ../src/inet_pton.c -o ../libs/inet_pton.o

nodesockets:
	$(EMCC) test-new.c -lenet -L../libs -I../include -o index-new.js \
        --js-library ../src/library_node_sockets.js --js-library ../src/library_inet.js -O2

test_inet1: test_inet4.c test_inet6.c ../src/library_inet.js
	$(EMCC) test_inet6.c -o test_inet6.js --js-library ../src/library_inet.js
	$(EMCC) test_inet4.c -o test_inet4.js --js-library ../src/library_inet.js

test_inet2: test_inet6.c test_inet4.c inet_ntop.o inet_pton.o
	$(EMCC) test_inet6.c ../libs/inet_ntop.o ../libs/inet_pton.o -o test_inet6.js
	$(EMCC) test_inet4.c ../libs/inet_ntop.o ../libs/inet_pton.o -o test_inet4.js

chrome-ext:
	mkdir -p chrome/
	$(EMCC) test-new.c -lenet -L../libs -I../include -o chrome/index.js --js-library ../src/library_node_sockets.js -s CHROME_SOCKETS=1 -O2 
