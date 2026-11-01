const {chromium}=require('playwright');const fs=require('fs');const {spawn}=require('child_process');
const geo=JSON.parse(fs.readFileSync('geo.json'));const T=JSON.parse(fs.readFileSync('timing.json')).T;
const mode=process.argv[2];
(async()=>{
 const b=await chromium.launch();
 async function page(){const p=await b.newPage({viewport:{width:1920,height:1080}});p.on('console',m=>console.log('PAGE',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+__dirname+'/render.html');await p.evaluate(([g,t])=>init(g,t),[geo,T]);await p.evaluate(()=>document.fonts.ready);return p;}
 if(mode==='preview'){const p=await page();const ts=process.argv.slice(3).map(Number);
  for(const t of ts){await p.evaluate(t=>render(t),t);await p.screenshot({path:`${process.env.PD||"prev"}/f_${t.toFixed(2)}.jpg`,type:'jpeg',quality:80});}
 } else { // render range: start end out
  const [s,e,out]=process.argv.slice(3);const p=await page();const FPS=30;
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-r','30',out],{stdio:['pipe','inherit','inherit']});
  for(let f=+s;f<+e;f++){await p.evaluate(t=>render(t),f/FPS);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%150==0)console.log(out,f);}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));
 }
 await b.close();})();
