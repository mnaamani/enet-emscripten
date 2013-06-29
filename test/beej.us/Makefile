EMCC=`which emcc`

6:
	$(EMCC) em_client6.c -o em_client6.js --js-library ../../src/library_node_sockets.js ../../libs/inet_ntop.o ../../libs/inet_pton.o

release:
	$(EMCC) em_client.c -o em_client.js --js-library ../../src/library_node_sockets.js -O2 -s ASM_JS=1
	$(EMCC) em_server.c -o em_server.js --js-library ../../src/library_node_sockets.js -O2 -s ASM_JS=1
	cc client.c -o client
	cc server.c -o server

