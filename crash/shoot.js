// usage: node shoot.js preview t1 t2 ... | node shoot.js render startFrame endFrame out.mp4 | node shoot.js audio out.json
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {spawn}=require('child_process');
const ROOT=__dirname;const mode=process.argv[2];
const TYPES={'.js':'text/javascript','.html':'text/html','.json':'application/json'};
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1080,height:1920}});
 p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('PAGE',m.text())});
 await p.route('http://local/**',r=>{const f=path.join(ROOT,decodeURIComponent(new URL(r.request().url()).pathname));if(!fs.existsSync(f))return r.fulfill({status:404});r.fulfill({body:fs.readFileSync(f),contentType:TYPES[path.extname(f)]||'application/octet-stream'});});
 const t0=Date.now();await p.goto('http://local/index.html');await p.waitForFunction(()=>window.READY===true,null,{timeout:300000});await p.evaluate(()=>document.fonts.ready);
 console.log('init',(Date.now()-t0)/1000,'s total',await p.evaluate(()=>window.TOTAL));
 if(mode==='preview'){const dir=process.env.PD||'prev';fs.mkdirSync(dir,{recursive:true});
  for(const t of process.argv.slice(3).map(Number)){const a=Date.now();await p.evaluate(t=>render(t),t);await p.screenshot({path:`${dir}/f_${t.toFixed(2)}.jpg`,type:'jpeg',quality:85});console.log(t,(Date.now()-a)/1000);}}
 else if(mode==='audio'){fs.writeFileSync(process.argv[3],JSON.stringify(await p.evaluate(()=>audioData())));}
 else {const [s,e,out]=process.argv.slice(3);
  const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30',out],{stdio:['pipe','inherit','inherit']});
  // warm up deterministic state: render a few frames before start so caches exist
  for(let f=+s;f<+e;f++){await p.evaluate(t=>render(t),f/30);const buf=await p.screenshot({type:'jpeg',quality:93});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%60==0)console.log(out,f,((Date.now()-t0)/1000).toFixed(0)+'s');}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));}
 await b.close();})();
