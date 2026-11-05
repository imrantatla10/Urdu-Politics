// Prepares projected map polygons + population dot samples for render.html
const d3=require('d3-geo');const fs=require('fs');
const src=JSON.parse(fs.readFileSync('data/eng_lad.json'));
const feats=src.features;
const isLon=f=>f.properties.LAD13CD.startsWith('E09');
const lon={type:'FeatureCollection',features:feats.filter(isLon)};
const eng={type:'FeatureCollection',features:feats};
function rnd(i){const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);}
function build(fc,S,minD,nDots,minArea){
  const p=d3.geoMercator().fitExtent([[-S/2,-S/2],[S/2,S/2]],fc);
  const polys=[];
  fc.features.forEach((f,fi)=>{
    const g=f.geometry;const P=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    P.forEach(poly=>{
      const ring=poly[0];const out=[];let lx=1e9,ly=1e9;
      for(const c of ring){const [x,y]=p(c);if(Math.hypot(x-lx,y-ly)>=minD){out.push(Math.round(x*10)/10,Math.round(y*10)/10);lx=x;ly=y;}}
      if(out.length<6)return;
      let a=0;for(let i=0;i<out.length;i+=2){const j=(i+2)%out.length;a+=out[i]*out[j+1]-out[j]*out[i+1];}
      if(Math.abs(a/2)<minArea)return;
      polys.push({f:fi,r:out});
    });
  });
  // dots: rejection sampling inside features
  const dots=[];let i=0;const b=d3.geoBounds(fc);
  while(dots.length<nDots&&i<nDots*200){i++;
    const lo=b[0][0]+(b[1][0]-b[0][0])*rnd(i*3+1),la=b[0][1]+(b[1][1]-b[0][1])*rnd(i*3+2);
    if(fc.features.some(f=>d3.geoContains(f,[lo,la]))){const [x,y]=p([lo,la]);dots.push([Math.round(x),Math.round(y)]);}
  }
  return {polys,dots,proj:p};
}
const L=build(lon,780,2.5,620,4);
const E=build(eng,860,3.5,1100,3);
// London's position/size inside England map (for the zoom transition)
const lb=d3.geoBounds(lon);const a=E.proj(lb[0]),c=E.proj(lb[1]);
const out={lon:{polys:L.polys,dots:L.dots},eng:{polys:E.polys,dots:E.dots},
  lonInEng:{x:(a[0]+c[0])/2,y:(a[1]+c[1])/2,s:Math.abs(c[0]-a[0])/780}};
fs.writeFileSync('geo.json',JSON.stringify(out));
console.log('lon polys',L.polys.length,'pts',L.polys.reduce((s,p)=>s+p.r.length/2,0),'dots',L.dots.length);
console.log('eng polys',E.polys.length,'pts',E.polys.reduce((s,p)=>s+p.r.length/2,0),'dots',E.dots.length,out.lonInEng);
