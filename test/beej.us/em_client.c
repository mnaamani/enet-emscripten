/*
** client.c -- a stream socket client demo
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
#define MAXDATASIZE 512 // max number of bytes we can get at once 

int clientSockFD;

int main(int argc, char *argv[])
{
    struct sockaddr_in server;
	char s[256];

    inet_pton(AF_INET,"127.0.0.1",&server.sin_addr);
    server.sin_port = htons(PORT);

    if ((clientSockFD = socket(AF_INET,SOCK_STREAM,0)) == -1){
		perror("client: socket");
        return 0;
	}

    inet_ntop(AF_INET, &server.sin_addr, s, sizeof s);

    printf("client: connecting to %s\n", s);

	connect(clientSockFD,(struct sockaddr *) &server, sizeof(struct sockaddr_in));

    emscripten_set_main_loop(network_event_loop, 2,0);
	return 0;
}

void network_event_loop(){
	int numbytes;
	char buf[MAXDATASIZE];
    fd_set settr;
    fd_set settw;
    FD_ZERO(&settr);
    FD_ZERO(&settw);
    FD_SET(clientSockFD, &settr);
    FD_SET(clientSockFD, &settw);

    if( select(64, &settr, &settw, NULL, NULL) ){
        if (FD_ISSET (clientSockFD, &settr)){
    	  if ((numbytes = recv(clientSockFD, buf, MAXDATASIZE-1, 0)) == -1) {
    	    perror("recv");
            exit(2);
    	  }
    	  buf[numbytes] = '\0';
    	  printf("client: received '%s' (%d) bytes\n",buf,numbytes);
        }
        if (FD_ISSET (clientSockFD, &settw)){
             send(clientSockFD,"Wassup!\n",8,0);
        }
    }
}
