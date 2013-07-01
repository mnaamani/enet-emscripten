#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(){
    char str[128];
    struct in_addr addr;

    int ret = inet_pton(AF_INET,"127.0.0.1",&addr);
    if(ret == -1){
        perror("inet_pton");
        exit(1);
    }
    if(ret == 0){
        puts("badly formatted string");exit(2);
    }
    if(inet_ntop(AF_INET,&addr,str,sizeof(str)) == NULL ){
        perror("inet_ntop");
        exit(1);
    }
    printf("%s\n",str);

    return 0;
}
