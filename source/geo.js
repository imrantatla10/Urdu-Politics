const topo=require('topojson-client');const d3=require('d3-geo');
const w=require('./node_modules/world-atlas/countries-50m.json');
const fc=topo.feature(w,w.objects.countries);
const byName={};fc.features.forEach(f=>byName[f.properties.name]=f);
console.error(Object.keys(byName).filter(n=>/India|Pak|Kash|Afgh|China|Nepal|Bangl|Iran|Sri|Bhut|Myan/.test(n)));
const IN=byName['India'],PK=byName['Pakistan'];
const out={};
// projection 1: region map (both countries)
function mk(fitTo,W,H,pad){const p=d3.geoMercator().fitExtent([[pad,pad],[W-pad,H-pad]],fitTo);p.clipExtent([[-1400,-1000],[3320,2080]]);return p;}
const both={type:'FeatureCollection',features:[IN,PK]};
const p1=mk(both,1920,1080,90);const g1=d3.geoPath(p1);
out.region={india:g1(IN),pak:g1(PK),others:fc.features.filter(f=>!['India','Pakistan'].includes(f.properties.name)).map(f=>g1(f)).filter(Boolean),
 border:null};
// shared border via topojson mesh
const ids=w.objects.countries.geometries;
const bm=topo.mesh(w,w.objects.countries,(a,b)=>{const n=[a.properties.name,b.properties.name];return n.includes('India')&&n.includes('Pakistan');});
out.region.border=g1(bm);
out.region.centerIN=p1([79,22]);out.region.centerPK=p1([69.5,29.5]);
// projection 2: Pakistan map
const p2=mk(PK,1920,1080,70);const g2=d3.geoPath(p2);
out.pak={pak:g2(PK),others:fc.features.filter(f=>f.properties.name!=='Pakistan').map(f=>g2(f)).filter(Boolean),
 cities:[[74.36,31.52],[74.53,32.49],[67.01,24.86]].map(c=>p2(c))};
const l=require('./node_modules/world-atlas/land-110m.json');out.land=topo.feature(l,l.objects.land);
out.pak.extra=[[73.05,33.68],[71.52,34.01],[67.0,30.18],[71.47,30.2],[73.08,31.42],[68.37,25.39]].map(c=>p2(c));
require('fs').writeFileSync('geo.json',JSON.stringify(out));
console.error('ok',JSON.stringify(out).length);
