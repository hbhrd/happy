cd /c/Users/USER/백과사전
node -e "
const fs=require('fs');let h=fs.readFileSync('parts/shell.html','utf8');
const t=fs.readFileSync('parts/trails.js','utf8'), v=fs.readFileSync('parts/video.js','utf8'), b=fs.readFileSync('parts/bgm.js','utf8'), r=fs.readFileSync('parts/rest.js','utf8');
h=h.replace('/*@@TRAILS@@*/',()=>t).replace('/*@@VIDEO@@*/',()=>v).replace('/*@@BGM@@*/',()=>b).replace('/*@@REST@@*/',()=>r);
fs.writeFileSync('index.html',h);fs.writeFileSync('둘레길백과사전.html',h);console.log('built',h.length);"
