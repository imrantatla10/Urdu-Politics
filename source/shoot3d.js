// usage: node shoot3d.js preview t1 t2 ... | node shoot3d.js render startFrame endFrame out.mp4
const {chromium}=require('playwright');const fs=require('fs');const http=require('http');const path=require('path');const {spawn}=require('child_process');
const CFG={tempo:1.12,lead:0.5,tail:1.6,fps:30};
const W=JSON.parse(fs.readFileSync(__dirname+'/words_timing.json'));const PAK=JSON.parse(fs.readFileSync(__dirname+'/pak3d.json'));
const END=CFG.lead+W.orig_len/CFG.tempo+CFG.tail;
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const srv=http.createServer((q,r)=>{const f=path.join(__dirname,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});r.end(d);});});
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const b=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1920,height:1280}});p.on('console',m=>console.log('PAGE',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto(`http://127.0.0.1:${port}/render3d.html`);await p.waitForFunction(()=>window.ready===true);await p.evaluate(()=>document.fonts.load('900 100px "Inter Display"'));
 const sc=await p.evaluate(([k,pak,c,e])=>init(k,pak,c.tempo,c.lead,e),[W.K,PAK,CFG,END]);
 const mode=process.argv[2];
 if(mode==='info'){console.log('END',END,'frames',Math.round(END*CFG.fps));console.log(JSON.stringify(sc));}
 else if(mode==='preview'){const dir=process.env.PD||'prev';fs.mkdirSync(dir,{recursive:true});
  for(const a of process.argv.slice(3)){const t=+a;const t0=Date.now();await p.evaluate(t=>render(t),t);await p.screenshot({path:`${dir}/f_${t.toFixed(2)}.jpg`,type:'jpeg',quality:85});console.log('t',t,Date.now()-t0,'ms');}}
 else{const [s,e,out]=process.argv.slice(3);
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30',out],{stdio:['pipe','inherit','inherit']});
  const t0=Date.now();for(let f=+s;f<+e;f++){await p.evaluate(t=>render(t),f/CFG.fps);const buf=await p.screenshot({type:'jpeg',quality:94});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%60==0)console.log(out,f,((Date.now()-t0)/1000).toFixed(0)+'s');}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));}
 await b.close();srv.close();})();
