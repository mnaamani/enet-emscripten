EMCC=`which emcc`

test:
	$(EMCC) ../src/test.c -lenet -L../libs -I../include -o index.js --js-library ../src/library_enet_node_backend.js -s ASM_JS=0 -O2 -s LINKABLE=1
oldway:
	$(EMCC) ../src/test.c -lenet -L../libs -I../include -o index.js --pre-js ../src/udp-socket-extension.js -s ASM_JS=0
