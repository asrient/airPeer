const fs=require('fs');

var str='Bad robots. count:';
var data='';
for(var i=0;i<5000;i++){
data+=str+i+'\n';
}

fs.writeFileSync('in2.txt',data);