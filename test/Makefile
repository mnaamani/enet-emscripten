EMCC=$(HOME)/Dev/emscripten/emcc

test:
	$(EMCC) test.c -lenet -L../libs -I../include -o index.js --pre-js ../js/udp-socket-extension.js -s ASM_JS=0
