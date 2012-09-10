build:
	./build.sh

rebuild:
	make clean
	make build
clean:
	rm -fr enet-1.3.5/
	rm -fr libs/
	rm -fr include/
