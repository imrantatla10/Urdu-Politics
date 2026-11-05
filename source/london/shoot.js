// usage: node shoot.js preview t1 t2 ...   |   node shoot.js render startFrame endFrame out.mp4
const {chromium}=require('playwright');const fs=require('fs');const {spawn}=require('child_process');
const geo=JSON.parse(fs.readFileSync(__dirname+'/geo.json'));const mode=process.argv[2];const FPS=30;
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1080,height:1080}});
 p.on('console',m=>console.log('PAGE',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+__dirname+'/render.html');await p.evaluate(g=>init(g),geo);await p.evaluate(()=>document.fonts.ready);
 const el=await p.$('canvas');
 if(mode==='preview'){const dir=process.env.PD||'prev';fs.mkdirSync(dir,{recursive:true});
  for(const t of process.argv.slice(3).map(Number)){await p.evaluate(t=>render(t),t);await el.screenshot({path:`${dir}/f_${t.toFixed(2).padStart(5,'0')}.jpg`,type:'jpeg',quality:80});}
 } else {
  const [s,e,out]=process.argv.slice(3);
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-r',String(FPS),out],{stdio:['pipe','inherit','inherit']});
  for(let f=+s;f<+e;f++){await p.evaluate(t=>render(t),f/FPS);const buf=await el.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%150==0)console.log(out,f);}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));
 }
 await b.close();})();
