EMCC=`which emcc`

inet_ntop.o: ../../src/inet_ntop.c
	$(EMCC) ../../src/inet_ntop.c -o ../../libs/inet_ntop.o

inet_pton.o: ../../src/inet_pton.c
	$(EMCC) ../../src/inet_pton.c -o ../../libs/inet_pton.o

examples: inet_ntop.o inet_pton.o
	$(EMCC) em_client6.c -o em_client6.js --js-library ../../src/library_node_sockets.js ../../libs/inet_ntop.o ../../libs/inet_pton.o
	$(EMCC) em_server6.c -o em_server6.js --js-library ../../src/library_node_sockets.js ../../libs/inet_ntop.o ../../libs/inet_pton.o
	$(EMCC) em_client.c -o em_client.js --js-library ../../src/library_node_sockets.js ../../libs/inet_ntop.o ../../libs/inet_pton.o -O2 -s ASM_JS=1
	$(EMCC) em_server.c -o em_server.js --js-library ../../src/library_node_sockets.js ../../libs/inet_ntop.o ../../libs/inet_pton.o -O2 -s ASM_JS=1

native:
	cc client.c -o client
	cc server.c -o server

