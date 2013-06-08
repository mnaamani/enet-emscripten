EMCC=`which emcc`

test:
	$(EMCC) test.c -lenet -L../libs -I../include -o index.js --js-library ../js/library_enet_node_backend.js -s ASM_JS=0 -O2 -s LINKABLE=1
oldway:
	$(EMCC) test.c -lenet -L../libs -I../include -o index.js --pre-js ../js/udp-socket-extension.js -s ASM_JS=0
