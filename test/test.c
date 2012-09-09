#include <enet/enet.h>
#include <string.h>
#include <stdio.h>
#include <emscripten/emscripten.h>
#include <sys/socket.h>

ENetHost * glbl_server;

void my_event_loop();

void main(int argc, char **argv ){

    ENetAddress address;
    enet_initialize();

    /* Bind the server to the default localhost.     */
    /* A specific host address can be specified by   */
    /* enet_address_set_host (& address, "x.x.x.x"); */

    address.host = ENET_HOST_ANY;
    /* Bind the server to port 5000. */
    address.port = 5000;

    glbl_server = enet_host_create (& address /* the address to bind the server host to */,
                                 32      /* allow up to 32 clients and/or outgoing connections */,
                                  5      /* allow up to 5 channels to be used, 0 and 1 */,
                                  0      /* assume any amount of incoming bandwidth */,
                                  0      /* assume any amount of outgoing bandwidth */);
    if (glbl_server == NULL)
    {
        fprintf (stderr,
                 "An error occurred while trying to create an ENet server host.\n");
        exit (EXIT_FAILURE);
    }

    emscripten_set_main_loop(my_event_loop, 5);
}

void my_event_loop(){

    ENetEvent event;
    struct in_addr addr;
    enet_host_service (glbl_server, &event, 0);

    switch (event.type)
    {
    case ENET_EVENT_TYPE_CONNECT:
        addr.s_addr = event.peer->address.host;
        printf ("A new client connected from %s:%u.\n",
                inet_ntoa(addr),
                event.peer -> address.port);

        /* Store any relevant client information here. */
        event.peer -> data = "Client information";
        break;

    case ENET_EVENT_TYPE_RECEIVE:
        printf ("A packet of length %u containing %s was received from %s on channel %u.\n",
                event.packet -> dataLength,
                event.packet -> data,
                event.peer -> data,
                event.channelID);

        /* Clean up the packet now that we're done using it. */
        enet_packet_destroy (event.packet);
        break;
    case ENET_EVENT_TYPE_DISCONNECT:
        printf ("%s disconected.\n", event.peer -> data);
        /* Reset the peer's client information. */
        event.peer -> data = NULL;
        break;
    }
}
