build:
	./build.sh

rebuild:
	make clean
	make build
clean:
	rm -fr enet-1.3.7/
	rm -fr libs/
	rm -fr include/
