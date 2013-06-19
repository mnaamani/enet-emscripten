EMCC=`which emcc`

release:
	$(EMCC) em_client.c -o em_client.js --js-library ../library_node_sockets.js -O2 -s ASM_JS=1
	$(EMCC) em_server.c -o em_server.js --js-library ../library_node_sockets.js -O2 -s ASM_JS=1
	cc client.c -o client
	cc server.c -o server

