#include <string.h>
#include <sys/types.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <stdio.h>
#include <enet/enet.h>
#include <emscripten/emscripten.h>

//globals are a bad idea.. this is just for testing..
ENetHost *server, *client;
ENetPeer *peer;

void network_event_loop();
void service(ENetHost *);

ENetHost * createHost(int port,char *identifier){
    ENetAddress address;
    ENetHost *host;

    address.host = ENET_HOST_ANY;
    address.port = port;
    host = enet_host_create (&address /* the address to bind the server host to */,
                                 32      /* allow up to 32 clients and/or outgoing connections */,
                                  5      /* allow up to 5 channels to be used, 0 and 1 */,
                                  0      /* assume any amount of incoming bandwidth */,
                                  0      /* assume any amount of outgoing bandwidth */);
    if (host == NULL)
    {
        perror("createHost:");
        fprintf (stderr,"An error occurred while trying to create an ENet host on port %d.\n",port);
    }
    printf("%s successfully created on port: %d\n",identifier, port);
    return host;
}

int main(int argc, char **argv ){
    enet_initialize();
    client = server = NULL;
    peer = NULL;

    if(argc > 1 ){
	    if(strcmp(argv[1],"server")==0 || strcmp(argv[2],"server")==0) server = createHost(5000,"server");
	    if(strcmp(argv[1],"client")==0 || strcmp(argv[2],"client")==0) client = createHost(5001,"client");
    }else{
	server = createHost(5000,"server");
    }
    if( server == NULL && client == NULL ){
	fprintf(stderr,"invalid arguments. specify either server or client, or no arguments for default server.\n");
	 exit(0);//at aleast one host should be created
    }

    if(client != NULL ){
	    ENetAddress address;
	    struct in_addr A;
	    inet_aton("127.0.0.1",&A);
        //inet_pton(AF_INET,"127.0.0.1",&A);
	    address.host = A.s_addr;
	    address.port = 5000;
	    peer = enet_host_connect(client,&address,2,0);
    }

    //run loop x times per second - for low latency requirement should be atleast 5
    emscripten_set_main_loop(network_event_loop, 2,1);
    return 0;
}
void bye(){
	emscripten_cancel_main_loop();
	if(server!=NULL) enet_host_destroy(server);
	if(client!=NULL) enet_host_destroy(client);
}

void network_event_loop(){
    char packet_data[] = "ENet + Emscripten Rock!";
    if(peer!=NULL){
	ENetPacket *packet = enet_packet_create(packet_data,sizeof(packet_data),ENET_PACKET_FLAG_NO_ALLOCATE | ENET_PACKET_FLAG_RELIABLE);
	enet_peer_send(peer,0,packet);
	if(peer->packetsSent > 10){
		enet_peer_disconnect_later(peer,0);
	}
    }
    service(client);
    service(server);
}

void service(ENetHost *host){
    ENetEvent event;
    struct in_addr addr;
    if(host == NULL) return;
    enet_host_service (host, &event, 0);

    switch (event.type)
    {
    case ENET_EVENT_TYPE_NONE:
        return;
    case ENET_EVENT_TYPE_CONNECT:
        addr.s_addr = event.peer->address.host;
        printf ("peer connection established with %s:%u.\n",
                inet_ntoa(addr),
                event.peer -> address.port);

        /* Store any relevant client information here. */
        event.peer -> data = "- peer -";
        break;

    case ENET_EVENT_TYPE_RECEIVE:
        printf ("'%s'[packet length:%u] received from '%s' [channel: %u].\n",
                event.packet -> data,
                event.packet -> dataLength,
                event.peer -> data,
                event.channelID);
        /* Clean up the packet now that we're done using it. */
        enet_packet_destroy (event.packet);
        break;
    case ENET_EVENT_TYPE_DISCONNECT:
        printf ("peer disconected. [%s]\n", event.peer -> data);
        /* Reset the peer's client information. */
        event.peer -> data = NULL;
    	if(client != NULL ){
	    	bye();
	    }
        break;
    }
}
