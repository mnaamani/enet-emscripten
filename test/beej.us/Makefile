EMCC=`which emcc`

LIBRARIES= --js-library ../../src/library_node_sockets.js --js-library ../../src/library_inet.js
OPT= -O2 -s ASM_JS=1 --closure 1

examples:
	$(EMCC) em_client6.c -o em_client6.js $(LIBRARIES) $(OPT)
	$(EMCC) em_server6.c -o em_server6.js $(LIBRARIES) $(OPT)
	$(EMCC) em_client.c -o em_client.js $(LIBRARIES) $(OPT)
	$(EMCC) em_server.c -o em_server.js $(LIBRARIES) $(OPT)

inet_ntop.o: ../../src/inet_ntop.c
	$(EMCC) ../../src/inet_ntop.c -o ../../libs/inet_ntop.o

inet_pton.o: ../../src/inet_pton.c
	$(EMCC) ../../src/inet_pton.c -o ../../libs/inet_pton.o

native:
	cc client.c -o client
	cc server.c -o server

