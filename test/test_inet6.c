#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int tests  = 0;
int passed = 0;

int test(char *test_addr, unsigned char *excpected){
    char str[64];
    struct in6_addr addr;
    unsigned char *p = (unsigned char*)&addr;
    int ret,i;
    tests++;
    printf("testing %s ",test_addr);
    ret = inet_pton(AF_INET6,test_addr,&addr);
    if(ret == -1){
        perror("inet_pton");
        return 0;
    }
    if(ret == 0){
        printf("badly formatted string\n");
        return 0;
    }

    printf("%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x",
         p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],p[9],p[10],p[11],p[12],p[13],p[14],p[15]);

    for(i=0;i<16;i++){
        if(excpected[i] != ((unsigned char*)&addr)[i]){
            printf("[inet_pton error]\n");
            return 0;
        }
    }

    if(inet_ntop(AF_INET6,&addr,str,sizeof(str)) == NULL ){
        perror("inet_ntop");
        return 0;
    }
    if(strcmp(str,test_addr)!=0){
        printf("[inet_ntop wrong output] %s\n",str);
        return 0;
    }
    passed++;
    printf(" [ok]\n");
    return 1;
}

int main(){

    test("::",(unsigned char[]){0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0});
    test("::1",(unsigned char[]){0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1});
    test("::1.2.3.4",(unsigned char[]){0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,4});
    test("::100.200.255.255",(unsigned char[]){0,0,0,0,0,0,0,0,0,0,0,0,100,200,255,255});
    test("::ffff:1.2.3.4",(unsigned char[]){0,0,0,0,0,0,0,0,0,0,255,255,1,2,3,4});
    test("1::ffff",(unsigned char[]){0,1,0,0,0,0,0,0,0,0,0,0,0,0,255,255});
    test("ff00:1::",(unsigned char[]){255,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0});
    test("ff:1::",(unsigned char[]){0,255,0,1,0,0,0,0,0,0,0,0,0,0,0,0});
    test("0:ff00:1::",(unsigned char[]){0,0,255,0,0,1,0,0,0,0,0,0,0,0,0,0});
    test("0:ff::",(unsigned char[]){0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,0});
    test("abcd::",(unsigned char[]){0xab,0xcd,0,0,0,0,0,0,0,0,0,0,0,0,0,0});

    test("f0::",   (unsigned char[]){0x00,0xf0,0,0,0,0,0,0,0,0,0,0,0,0,0,0});
    test("ff0::",  (unsigned char[]){0x0f,0xf0,0,0,0,0,0,0,0,0,0,0,0,0,0,0});
    test("fff0::", (unsigned char[]){0xff,0xf0,0,0,0,0,0,0,0,0,0,0,0,0,0,0});
    test("ffff::", (unsigned char[]){0xff,0xff,0,0,0,0,0,0,0,0,0,0,0,0,0,0});

    test("ffff::a", (unsigned char[]){0xff,0xff,0,0,0,0,0,0,0,0,0,0,0,0,0,0xa});
    test("ffff::a:b", (unsigned char[]){0xff,0xff,0,0,0,0,0,0,0,0,0,0,0,0xa,0,0xb});
    test("ffff::a:b:c", (unsigned char[]){0xff,0xff,0,0,0,0,0,0,0,0,0,0xa,0,0xb,0,0xc});
    test("ffff::a:b:c:d", (unsigned char[]){0xff,0xff,0,0,0,0,0,0,0,0xa,0,0xb,0,0xc,0,0xd});

    test("ffff:1::a", (unsigned char[]){0xff,0xff,0,1,0,0,0,0,0,0,0,0,0,0,0,0xa});

    test("ffff:1:2::a:b", (unsigned char[]){0xff,0xff,0,1,0,2,0,0,0,0,0,0,0,0xa,0,0xb});
    test("::1:2:0:0:0", (unsigned char[]){0,0,0,0,0,0,0,1,0,2,0,0,0,0,0,0});
    test("0:0:1:2:3::", (unsigned char[]){0,0,0,0,0,1,0,2,0,3,0,0,0,0,0,0});

    printf("ran %d tests. %d failed\n",tests,tests-passed);
}
