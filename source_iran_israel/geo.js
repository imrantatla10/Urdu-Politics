const topo=require('topojson-client');const d3=require('d3-geo');
const w=require('./node_modules/world-atlas/countries-50m.json');
const fc=topo.feature(w,w.objects.countries);
const by={};fc.features.forEach(f=>by[f.properties.name]=f);
const IR=by['Iran'],IL=by['Israel'],US=by['United States of America'];
const out={};
// Region map: Middle East
const p1=d3.geoMercator().center([45,30]).scale(2350).translate([960,560]);
p1.clipExtent([[-1500,-1000],[3420,2080]]);const g1=d3.geoPath(p1);
out.me={others:fc.features.filter(f=>f!==IR&&f!==IL).map(f=>g1(f)).filter(Boolean),ir:g1(IR),il:g1(IL),
 cIR:p1([54,32.5]),cIL:p1([34.9,31.4])};
// world map for scene 7
const p2=d3.geoNaturalEarth1().scale(330).translate([960,560]).rotate([-10,0]);const g2=d3.geoPath(p2);
out.world={others:fc.features.filter(f=>f!==US&&f!==IL).map(f=>g2(f)).filter(Boolean),us:g2(US),il:g2(IL),cUS:p2([-98,39]),cIL:p2([34.9,31.4])};
const l=require('./node_modules/world-atlas/land-110m.json');out.land=topo.feature(l,l.objects.land);
out.irF=IR;out.ilF=d3.geoCentroid(IL);out.irC=[54,32.5];
require('fs').writeFileSync('geo.json',JSON.stringify(out));console.error('ok',JSON.stringify(out).length);
