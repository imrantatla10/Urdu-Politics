const {chromium}=require('playwright');const fs=require('fs');const {spawn}=require('child_process');
const topo=require('topojson-client');const w=require('world-atlas/countries-50m.json');
const fc=topo.feature(w,w.objects.countries);
const mode=process.argv[2];
(async()=>{
 const b=await chromium.launch();
 async function page(){const p=await b.newPage({viewport:{width:1080,height:1080}});p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>console.log('PAGE',m.text()));
  await p.goto('file://'+__dirname+'/asylum.html');await p.evaluate(f=>init(f),fc);await p.evaluate(()=>document.fonts.ready);return p;}
 if(mode==='preview'){const p=await page();const dir=process.env.PD||'prev';fs.mkdirSync(dir,{recursive:true});
  for(const t of process.argv.slice(3).map(Number)){await p.evaluate(t=>render(t),t);await p.screenshot({path:`${dir}/f_${t.toFixed(2)}.jpg`,type:'jpeg',quality:80});}
 } else {const [s,e,out]=process.argv.slice(3);const p=await page();
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-r','30',out],{stdio:['pipe','inherit','inherit']});
  for(let f=+s;f<+e;f++){await p.evaluate(t=>render(t),f/30);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%300==0)console.log(out,f);}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));}
 await b.close();})();
