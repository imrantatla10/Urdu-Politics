const topo=require('topojson-client');const w=require('world-atlas/countries-50m.json');
const fc=topo.feature(w,w.objects.countries);
const pk=fc.features.find(f=>f.properties.name==='Pakistan');
const lat0=30,lon0=69.5,k=Math.cos(lat0*Math.PI/180),S=1/1.0; // 1 unit = 1 degree lat
let polys=pk.geometry.type==='Polygon'?[pk.geometry.coordinates]:pk.geometry.coordinates;
polys=polys.map(p=>p.map(r=>r.map(([lo,la])=>[+(((lo-lon0)*k)*S).toFixed(4),+((la-lat0)*S).toFixed(4)])));
polys.sort((a,b)=>b[0].length-a[0].length);
const cities={isb:[73.05,33.68],khi:[67.01,24.86],lhr:[74.36,31.52]};
const c={};for(const n in cities){const[lo,la]=cities[n];c[n]=[(lo-lon0)*k,la-lat0];}
require('fs').writeFileSync('pak3d.json',JSON.stringify({polys:polys.slice(0,1),cities:c}));
console.log(polys.length,polys[0][0].length);
