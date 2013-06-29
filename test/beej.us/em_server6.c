/*
 * em_server.c  - stream socket server demo
*/

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <netdb.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <sys/socket.h>

#include <arpa/inet.h>

#include <emscripten/emscripten.h>

void network_event_loop();

#define PORT 3490 // the port client will be connecting to 
#define BACKLOG 10

int serverfd;

int main(int argc, char *argv[])
{
    struct sockaddr_in6 server;

    inet_pton(AF_INET6,"::1",&server.sin6_addr);
    server.sin6_port = htons(PORT);

    if ((serverfd = socket(AF_INET6,SOCK_STREAM,0)) == -1){
		perror("server: socket");
        return 1;
	}

	if (bind(serverfd, (struct sockaddr*)&server, sizeof(struct sockaddr_in6)) == -1) {
		close(serverfd);
		perror("server: bind");
		return 1;
	}

	if (listen(serverfd, BACKLOG) == -1) {
		perror("listen");
        return 1;
	}

    emscripten_set_main_loop(network_event_loop, 2,0);
	return 0;
}

void network_event_loop(){
    socklen_t sin_size;
    struct sockaddr_in6 their_addr;
   	sin_size = sizeof their_addr;
	char s[256];

   	int new_fd = accept(serverfd, (struct sockaddr *)&their_addr, &sin_size);

	if (new_fd == -1) {
		return;
	}

	inet_ntop(their_addr.sin6_family,
		&their_addr.sin6_addr,
		s, sizeof s);

	printf("server: got connection from %s\n", s);

    send(new_fd, "Hello, world!", 13, 0);

	close(new_fd);
}
