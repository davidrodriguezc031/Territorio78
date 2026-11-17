const $ = id => document.getElementById(id);
const iconPaths = {
  brand: '<path d="M3 18V8m6 10V5m6 13v-7m6 7V3M2 21h20"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart: '<path d="M3 3v18h18M8 16v-3m5 3V9m5 7V6"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5zm9 9-9 5-9-5m18 4-9 5-9-5"/>',
  book: '<path d="M12 5a8 8 0 0 0-9-1v15a8 8 0 0 1 9 1 8 8 0 0 1 9-1V4a8 8 0 0 0-9 1zm0 0v15"/>',
  shield: '<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10zm-3-10 2 2 4-4"/>',
  external: '<path d="M13 5h6v6m0-6-8 8m7 0v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 14h18m-12-4v9"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4v2"/>',
  house: '<path d="m3 11 9-8 9 8v9H3v-9zm6 9v-6h6v6"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-9c-1-2-6-2-6 1 0 3 6 1 6 4s-5 3-6 1"/>'
};
const icon = name => '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+iconPaths[name]+'</svg>';
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textKey = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const official = url => {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'census.gov' || u.hostname.endsWith('.census.gov')) ? u.href : ''; }
  catch { return ''; }
};
const sourceLink = (url, label='Fuente oficial') => official(url) ? '<a href="'+esc(official(url))+'" target="_blank" rel="noopener">'+esc(label)+' ↗</a>' : '';
const collator = new Intl.Collator('es-PR',{sensitivity:'base',numeric:true});
const nf = new Intl.NumberFormat('es-PR',{maximumFractionDigits:2});
const cf = new Intl.NumberFormat('es-PR',{style:'currency',currency:'USD',maximumFractionDigits:0});
const groups = {'pep':'Estimados de población (PEP)','acs5':'Encuesta sobre la Comunidad · 5 años','acs1':'Encuesta sobre la Comunidad · 1 año','decennial':'Censo Decenal','cbp':'County Business Patterns','cre':'Resiliencia comunitaria (CRE)','economic':'Censo Económico','bds':'Dinámica empresarial (BDS)','bps':'Permisos de construcción (BPS)'};
const pageSize = 15;
const catalogSize = 12;
const colors = ['#d5eee5','#a5dccd','#65c0aa','#289d88','#146857'];
const missingColor = '#d5deda';
let datasets = [], catalog = [], locations = [], geoIndex = new Map(), maps = {}, mapsInfo = {};
let selected = '', page = 0, catalogPage = 0, sorting = {key:'name',dir:1};
let lastRows = [], lastView = null;
const json = async path => { const r = await fetch(path); if (!r.ok) throw Error(r.status+' '+path); return r.json(); };
function nav() {
  const key = location.hash.slice(1) || 'inicio';
  const active = document.querySelector('[data-nav="'+({inicio:'inicio',explorar:'explorar',mapa:'mapa',catalogo:'catalogo',metodologia:'metodologia'}[key] || 'inicio')+'"]');
  for (const a of document.querySelectorAll('[data-nav]')) a.removeAttribute('aria-current');
  active.setAttribute('aria-current','location');
  $('breadcrumb').textContent = active.textContent.trim();
}
nav();
addEventListener('hashchange',nav);
function options(el, items, prev) {
  el.replaceChildren(...items.map(([id,label]) => new Option(label,id)));
  if (items.some(([id]) => String(id) === String(prev))) el.value = prev;
}
function modeOf(ds) {
  if (ds.family) return ds.family;
  const id = ds.id.toLowerCase();
  const prefix = id.match(/^(pep|acs5|acs1|cbp|cre|ec|bds|bps)(?:-|$)/)?.[1];
  if (prefix) return prefix === 'ec' ? 'economic' : prefix;
  return 'decennial';
}
function selectedDataset() { return datasets.find(d => d.id === $('year').value); }
function periodOptions() {
  const old = $('year').value;
  const family = $('product').value;
  const pool = family==='pep'?datasets.filter(d=>modeOf(d)===family).sort((a,b)=>compare(b.id,a.id)):datasets.filter(d=>modeOf(d)===family);
  const unique = new Map();
  for(const dataset of pool)if(!unique.has(dataset.year))unique.set(dataset.year,dataset);
  const choices = [...unique.values()].sort((a,b) => b.year-a.year || collator.compare(a.period,b.period));
  options($('year'),choices.map(d => [d.id,d.period]),old);
  indicatorOptions();
}
function indicatorOptions() {
  const ds = selectedDataset();
  const current = $('indicator').value;
  options($('indicator'),ds?.variables.map(v => [v.id,v.label]) ?? [],current);
  render();
}
function format(value, variable) {
  if (!Number.isFinite(value)) return 'No disponible';
  const unit = textKey(variable.unit);
  if (/mil.*usd|usd.*mil/.test(unit)) return nf.format(value)+' mil USD';
  if (/usd|dolar|currency/.test(unit)) return cf.format(value);
  if (/%|por ciento|porcentaje|percent/.test(unit)) return nf.format(value)+' %';
  return nf.format(value);
}
function compare(a,b) { return collator.compare(a,b); }
function geoName(id, ds) {
  const geography=geoIndex.get(id);
  return ds?.names?.[id] || (id.length===10?geography?.label:geography?.name) || (id === '72' ? 'Puerto Rico' : id);
}
function geoParent(id) { return id.length > 5 ? id.slice(0,5) : ''; }
function view() {
  const ds = selectedDataset();
  const index = ds?.variables.findIndex(v => v.id === $('indicator').value) ?? -1;
  if (!ds || index < 0) return null;
  const level = $('level').value;
  const parent = $('parent').value;
  const variable = ds.variables[index];
  const length = {pr:2,municipio:5,barrio:10}[level];
  const boundary = level === 'barrio' ? mapsInfo?.observationYears?.[String(ds.boundaryYear || ds.year)] || 2025 : 2025;
  const geoSet = new Set([...Object.keys(ds.rows), ...locations.map(g => g.geoid)]);
  const relevant = [...geoSet].filter(id => id.length === length && (!parent || level === 'pr' || id.startsWith(parent)));
  const available = relevant.filter(id => Array.isArray(ds.rows[id]));
  const ids = level === 'barrio' && available.length ? available : relevant;
  const query = textKey($('table-search').value.trim());
  const rows = ids.map(id => {
    const [value,moe] = ds.rows[id]?.[index] ?? [null,null];
    return {id,name:geoName(id,ds),value,moe,parent:geoName(geoParent(id)),note:ds.notes?.[id]?.[index] || ''};
  });
  const filtered = rows.filter(row => !query || textKey([row.id,row.name,row.parent].join(' ')).includes(query));
  return {ds,variable,index,level,parent,boundary,rows,filtered,byId:new Map(rows.map(row=>[row.id,row]))};
}
function pager(el, current, size, count, change) {
  const total = Math.max(1,Math.ceil(count/size));
  const range = document.createElement('span');
  range.textContent = count ? nf.format(current*size+1)+'–'+nf.format(Math.min((current+1)*size,count))+' de '+nf.format(count) : '0 resultados';
  const buttons = document.createElement('div');
  for (const [label,step] of [['Anterior',-1],['Siguiente',1]]) {
    const button=document.createElement('button');
    button.className='btn small neutral';
    button.textContent=label;
    button.disabled=current+step<0 || current+step>=total;
    button.addEventListener('click',()=>change(current+step));
    buttons.append(button);
  }
  el.replaceChildren(range,buttons);
}
function table(v) {
  const {ds,variable,level,filtered} = v;
  const sorted = [...filtered].sort((a,b) => {
    if (sorting.key === 'value') {
      if (a.value == null) return b.value == null ? compare(a.name,b.name) : 1;
      if (b.value == null) return -1;
      return (a.value-b.value)*sorting.dir || compare(a.name,b.name);
    }
    return compare(a[sorting.key],b[sorting.key])*sorting.dir;
  });
  lastRows=sorted;
  page=Math.min(page,Math.max(0,Math.ceil(sorted.length/pageSize)-1));
  $('table-caption').textContent=variable.label+' · '+ds.period;
  const cols = [['name',level==='barrio'?'Barrio o subdivisión censal':'Geografía'],...(level==='barrio'?[['parent','Municipio']]:[]),['id','GEOID'],['value','Valor'],...(variable.moe?[[null,'Margen de error (90 %)']]:[])];
  $('table-head').innerHTML='<tr>'+cols.map(([key,label])=>'<th scope="col"'+(key===sorting.key?' aria-sort="'+(sorting.dir===1?'ascending':'descending')+'"':'')+'>'+(key?'<button type="button" data-sort="'+key+'">'+label+(key===sorting.key?(sorting.dir===1?' ↑':' ↓'):'')+'</button>':label)+'</th>').join('')+'</tr>';
  $('table-body').innerHTML=sorted.slice(page*pageSize,(page+1)*pageSize).map(r=>'<tr><td><button type="button" class="link" data-select="'+r.id+'">'+esc(r.name)+'</button></td>'+(level==='barrio'?'<td>'+esc(r.parent)+'</td>':'')+'<td>'+esc(r.id)+'</td><td>'+esc(format(r.value,variable))+'</td>'+(variable.moe?'<td>'+(r.moe==null?'No disponible':'± '+esc(format(r.moe,variable)))+'</td>':'')+'</tr>').join('') || '<tr><td colspan="'+cols.length+'" class="empty">Sin resultados con estos filtros.</td></tr>';
  pager($('pagination'),page,pageSize,sorted.length,p=>{page=p;table(v);});
  const src = variable.sourceUrl || ds.sourceUrl;
  $('data-source').innerHTML = 'U.S. Census Bureau · '+esc(ds.title)+' · '+esc(variable.table || variable.id)+' · '+sourceLink(src, 'Publicación y archivos oficiales')+(ds.description?' · '+esc(ds.description):'')+'<br>Fecha de consulta '+esc(ds.retrievedAt || '2026-11-17')+' · GEOID conserva el código geográfico oficial.';
  for (const id of ['export-csv','export-xlsx']) $(id).disabled = !sorted.length;
}
function svgMap(features, title, colorFor, interactive, hero=false) {
  const rings = f => f.geometry.type==='Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
  let left=Infinity, right=-Infinity, bottom=Infinity, top=-Infinity;
  for (const f of features) for (const ring of rings(f)) for (const [x,y] of ring) {
    left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
  }
  if (!features.length) return '';
  const w=(right-left)*100*Math.cos(18.2*Math.PI/180);
  const h=(top-bottom)*100;
  const xScale=100*Math.cos(18.2*Math.PI/180);
  const pad=Math.max(w,h)*.045;
  const viewBox=[-pad,-pad,w+pad*2,h+pad*2].join(' ');
  const paths=features.map(f=>{
    const props=f.properties;
    const id=props.geoid;
    const d=rings(f).map(r=>r.map(([x,y],i)=>(i?'L':'M')+((x-left)*xScale).toFixed(2)+' '+((top-y)*100).toFixed(2)).join('')+'Z').join('');
    const label=interactive ? interactive.label(id,props) : props.name;
    const focus=interactive ? ' tabindex="0" role="button" data-geo="'+esc(id)+'" aria-label="'+esc(label)+'"'+(selected===id?' class="is-selected"':'') : '';
    return '<path d="'+d+'" fill-rule="evenodd" fill="'+colorFor(id,props)+'"'+focus+(hero?' stroke="#90f0d5" stroke-width=".65" vector-effect="non-scaling-stroke"':'')+'>'+(hero?'':'<title>'+esc(label)+'</title>')+'</path>';
  }).join('');
  return '<svg viewBox="'+viewBox+'" role="'+(interactive?'group':'img')+'" aria-label="'+esc(title)+'">'+paths+'</svg>';
}
function mapView(v) {
  const {variable,level,parent,rows,byId,ds,boundary}=v;
  const vintageMaps = maps['barrio-'+boundary] || maps.barrio;
  const geojson = level==='barrio' ? vintageMaps : maps[level];
  const features = (geojson?.features || []).filter(f=>!parent||(level!=='barrio'&&level!=='municipio')||f.properties.municipio===parent);
  const values=features.map(f=>byId.get(f.properties.geoid)?.value).filter(Number.isFinite);
  const min=values.length?Math.min(...values):0;
  const max=values.length?Math.max(...values):0;
  const zone = val => max===min ? 2 : Math.min(4,Math.floor(5*(val-min)/(max-min)));
  const selection = byId.get(selected);
  $('drill-map').hidden=level!=='municipio'||!selection;
  $('map-caption').textContent = (selection?selection.name+' · '+format(selection.value,variable):variable.label)+' · '+ds.period;
  $('clear-map').hidden=!selected;
  $('map-frame').innerHTML=svgMap(features,'Mapa de '+variable.label,(id)=>Number.isFinite(byId.get(id)?.value)?colors[zone(byId.get(id).value)]:missingColor,{
    label:(id,p)=>geoName(id,ds)+' · '+format(byId.get(id)?.value,variable)
  }) || '<p class="empty">Cartografía no disponible para esta selección.</p>';
  const items=[];
  if (values.length && max===min) items.push([colors[2],format(min,variable)]);
  else if (values.length) {
    const step=(max-min)/5;
    for (let i=0;i<5;i++) items.push([colors[i],format(min+i*step,variable)+' a '+format(i===4?max:min+(i+1)*step,variable)]);
  }
  if (features.some(f=>!Number.isFinite(byId.get(f.properties.geoid)?.value))) items.push([missingColor,'No disponible']);
  $('legend').innerHTML=items.map(([c,t])=>'<span><b class="swatch" style="background:'+c+'"></b>'+esc(t)+'</span>').join('');
  const actualYear=level==='barrio' && maps['barrio-'+boundary] ? boundary:2025;
  const geoUrl=mapsInfo?.boundarySources?.[String(actualYear)] || 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.'+actualYear+'.html';
  const displayed=new Set(features.map(f=>f.properties.geoid));
  const unplotted=level==='barrio'?rows.filter(r=>!displayed.has(r.id)).length:0;
  $('map-source').innerHTML=sourceLink(geoUrl,'Límites cartográficos '+actualYear)+(unplotted?' · '+nf.format(unplotted)+' subdivisiones en la tabla sin polígono visible.':'')+(selection&&variable.moe&&selection.moe!=null?' · Margen de error ± '+esc(format(selection.moe,variable)):'');
}
function showTrend(v) {
  const {ds,variable,level,parent}=v;
  const id=selected || (level==='barrio' ? '' : level==='municipio' && parent ? parent : '72');
  if (!id) {
    $('chart-caption').textContent='Serie temporal por geografía';
    $('chart').innerHTML='<p class="empty">Selecciona un barrio en el mapa o en la tabla para ver su serie.</p>';
    return;
  }
  const family=modeOf(ds);
  const compatible=d=>family!=='pep'||d.id.split('-')[1]===ds.id.split('-')[1];
  const series=datasets.filter(d=>modeOf(d)===family && compatible(d) && d.rows[id]).map(d=>{
    const i=d.variables.findIndex(x=>x.id===variable.id);
    return {year:d.year,period:d.period,value:d.rows[id][i]?.[0]};
  }).filter(d=>Number.isFinite(d.value)).sort((a,b)=>a.year-b.year);
  $('chart-caption').textContent=geoName(id,ds)+' · '+variable.label;
  if (series.length<2) {
    $('chart').innerHTML='<p class="empty">'+(series.length?'Un periodo disponible · '+esc(series[0].period)+' · '+esc(format(series[0].value,variable)):'Sin serie disponible para esta geografía e indicador.')+'</p>';
    return;
  }
  const left=72, right=406, top=13, bottom=174;
  const ymin=Math.min(...series.map(d=>d.value));
  const ymax=Math.max(...series.map(d=>d.value));
  const span=ymax-ymin || Math.abs(ymax)*.08 || 1;
  const max=ymax+span*.10,min=ymin-span*.10;
  const x=i=>left+(right-left)*(series[i].year-series[0].year)/(series.at(-1).year-series[0].year||1);
  const y=value=>bottom-(bottom-top)*(value-min)/(max-min);
  const guides=[0,.25,.5,.75,1].map(r=>{const value=min+(max-min)*r;const yy=y(value);return '<path d="M'+left+' '+yy+'H'+right+'" stroke="#dce9e6"/><text x="'+(left-5)+'" y="'+(yy+3)+'" text-anchor="end">'+esc(format(value,variable))+'</text>';}).join('');
  const path=series.map((d,i)=>x(i)+','+y(d.value)).join(' ');
  const points=series.map((d,i)=>'<circle cx="'+x(i)+'" cy="'+y(d.value)+'" r="4" fill="#13846e"><title>'+esc(d.period+' · '+format(d.value,variable))+'</title></circle>').join('');
  const labels=series.map((d,i)=>i===0 || i===series.length-1 || (i%Math.ceil(series.length/5)===0 && x(i)<right-30)?'<text x="'+x(i)+'" y="193" text-anchor="middle">'+d.year+'</text>':'').join('');
  $('chart').innerHTML='<svg class="linechart" role="img" aria-label="'+esc(geoName(id,ds)+' '+variable.label)+'" viewBox="0 0 420 204" font-size="9" fill="#527075">'+guides+'<polyline points="'+path+'" fill="none" stroke="#239d87" stroke-width="2.5" stroke-linejoin="round"/>'+points+labels+'</svg>'+(modeOf(ds)==='acs5'?'<p class="chart-note">Los periodos quinquenales consecutivos se superponen. Consulta los márgenes en la tabla.</p>':'');
}
function chart(v) {
  if ($('chart-mode').value==='trend') {showTrend(v);return;}
  const {variable,filtered,ds}=v;
  const items=filtered.filter(r=>Number.isFinite(r.value)).sort((a,b)=>b.value-a.value || compare(a.name,b.name)).slice(0,8);
  const top=Math.max(1,...items.map(r=>Math.abs(r.value)));
  $('chart-caption').textContent=items.length?'Valores más altos · '+ds.period:'Sin cifras disponibles';
  $('chart').innerHTML=items.length?'<div class="bars">'+items.map(r=>'<div class="bar-row"><span title="'+esc(r.name)+'">'+esc(r.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+Math.max(1,Math.abs(r.value)*100/top).toFixed(2)+'%"></div></div><strong>'+esc(format(r.value,variable))+'</strong></div>').join('')+'</div>':'<p class="empty">Selecciona otro periodo o geografía para comparar.</p>';
}
function render() {
  const v=view();
  if (!v) return;
  lastView=v;
  $('parent-label').hidden=v.level==='pr';
  $('parent').disabled=v.level==='pr';
  const stats=v.rows.filter(d=>Number.isFinite(d.value)).length;
  $('status').textContent=nf.format(stats)+' de '+nf.format(v.rows.length)+' geografías con cifra disponible'+(v.level==='barrio'&&!stats?' · Este producto o periodo puede no publicar cifras para barrios.':'')+(v.variable.moe?' · Márgenes de error al 90 %.':'');
  table(v);mapView(v);chart(v);
}
function pick(id, go=false) {
  if (!lastView) return;
  selected=id;
  if (go) {
    $('chart-mode').value='trend';
    $('mapa').scrollIntoView({block:'start'});
  }
  render();
  if (go) $('mapa').querySelector('.is-selected')?.focus({preventScroll:true});
}
for(const id of ['product','year','indicator','level','parent']) $(id).addEventListener('change',()=>{
  page=0;selected='';
  if(id==='product')periodOptions();
  else if(id==='year')indicatorOptions();
  else render();
});
$('chart-mode').addEventListener('change',()=>lastView&&chart(lastView));
$('table-search').addEventListener('input',()=>{page=0;render();});
$('table-head').addEventListener('click',e=>{
  const key=e.target.closest('button')?.dataset.sort;
  if(key){sorting={key,dir:key===sorting.key?-sorting.dir:key==='value'?-1:1};page=0;table(lastView);}
});
$('table-body').addEventListener('click',e=>{const id=e.target.closest('button')?.dataset.select;if(id)pick(id,true);});
function useMap(e) {
  if(e.type==='keydown' && !['Enter',' '].includes(e.key))return;
  const id=e.target.closest('[data-geo]')?.dataset.geo;
  if(!id)return;
  e.preventDefault();
  pick(id);
  if(e.type==='keydown') $('map-frame').querySelector('.is-selected')?.focus();
}
$('map-frame').addEventListener('click',useMap);
$('map-frame').addEventListener('keydown',useMap);
$('clear-map').addEventListener('click',()=>{selected='';render();});
$('drill-map').addEventListener('click',()=>{if(!selected)return;$('parent').value=selected;$('level').value='barrio';selected='';page=0;render();});
function overview() {
  const pep=datasets.filter(d=>modeOf(d)==='pep').sort((a,b)=>b.year-a.year)[0];
  const acs=datasets.filter(d=>modeOf(d)==='acs5').sort((a,b)=>b.year-a.year)[0];
  const decennial=datasets.filter(d=>modeOf(d)==='decennial'&&d.rows['72']).sort((a,b)=>b.year-a.year)[0];
  const entry=(d,ids)=>d?.variables.findIndex(v=>ids.includes(v.id)) ?? -1;
  const cards=[
    ['people','Población residente',pep,entry(pep,['population','PEPPOP']),'PEP'],
    ['house','Unidades de vivienda',decennial,entry(decennial,['housing','H1_001N','H1_001NA','H001001']),'Censo Decenal'],
    ['money','Ingreso mediano del hogar',acs,entry(acs,['B19013_001E','B19013_001','median_income','household_income']),'PRCS'],
    ['map','Municipios',null,-1,'Geografía censal']
  ];
  $('kpis').innerHTML=cards.map(([sym,title,d,i,label])=>{
    const value=d&&i>=0 ? d.rows['72']?.[i]?.[0] : !d&&sym==='map'?locations.filter(g=>g.geoid.length===5).length:null;
    const v=d&&i>=0?d.variables[i]:{unit:''};
    return '<article class="panel kpi"><div class="kpi-icon">'+icon(sym)+'</div><h3>'+title+'</h3><strong>'+esc(format(value,v))+'</strong>'+(d?sourceLink(v.sourceUrl || d.sourceUrl,label+' · '+d.period):'<small>'+esc(label)+'</small>')+'</article>';
  }).join('');
}
function matchesGeo(item,key) {
  if(!key)return true;
  const geo=textKey(item.geographies?.join(' ') || '');
  return key==='pr'?/puerto rico|territorio/.test(geo):key==='municipio'?/municipio|county equivalent/.test(geo):/barrio|county subdivision/.test(geo);
}
function renderCatalog() {
  const q=textKey($('catalog-search').value.trim()).split(/\s+/).filter(Boolean);
  const cat=$('catalog-category').value;
  const geo=$('catalog-geo').value;
  const filtered=catalog.filter(c=>(!cat||c.category===cat)&&matchesGeo(c,geo)&&q.every(word=>textKey([c.title,c.category,c.years,c.description,c.coverage,c.geographies?.join(' ')].join(' ')).includes(word)));
  catalogPage=Math.min(catalogPage,Math.max(0,Math.ceil(filtered.length/catalogSize)-1));
  $('catalog-count').textContent=nf.format(filtered.length)+' productos y series';
  $('catalog-items').innerHTML=filtered.slice(catalogPage*catalogSize,(catalogPage+1)*catalogSize).map(c=>{
    const coverage=Array.isArray(c.geographies)?c.geographies.join(' · '):c.coverage;
    const extras=(Array.isArray(c.links)?c.links:[]).slice(0,2).map(l=>sourceLink(l.url,l.label || l.title)).join('');
    const explore=c.explore && [...$('product').options].some(o=>o.value===c.explore) ? '<a href="#explorar" data-family="'+esc(c.explore)+'">Explorar datos ↑</a>':'';
    return '<article class="catalog-item"><span class="tag">'+esc(c.category)+'</span><h3>'+esc(c.title)+'</h3><small>'+esc(c.years || '')+'</small><p>'+esc(c.description || '')+'</p>'+(coverage?'<p>'+esc(coverage)+'</p>':'')+'<div class="catalog-links">'+explore+sourceLink(c.url,'Fuente oficial')+extras+'</div></article>';
  }).join('')||'<p class="empty">No hay productos que coincidan con la búsqueda.</p>';
  pager($('catalog-pages'),catalogPage,catalogSize,filtered.length,p=>{catalogPage=p;renderCatalog();$('catalogo').scrollIntoView();});
}
for(const id of ['catalog-search','catalog-category','catalog-geo']) $(id).addEventListener(id==='catalog-search'?'input':'change',()=>{catalogPage=0;renderCatalog();});
$('catalog-items').addEventListener('click',e=>{
  const family=e.target.closest('a')?.dataset.family;
  if(family&&[...$('product').options].some(o=>o.value===family)){$('product').value=family;page=0;selected='';periodOptions();}
});
function save(blob,name) {
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportRows() {
  const {ds,variable,level}=lastView;
  const header=['GEOID','Geografía','Municipio','Indicador','Unidad','Periodo','Valor','Margen de error (90 %)','Estado','Producto','Tabla o variable','Fuente oficial','Fecha de consulta'];
  const rows=lastRows.map(r=>[r.id,r.name,level==='barrio'?r.parent:'',variable.label,variable.unit,ds.period,r.value??'',r.moe??'',r.value==null?'No disponible':'Publicado',ds.title,variable.table || variable.id,variable.sourceUrl || ds.sourceUrl,ds.retrievedAt || '2026-11-17']);
  const meta=[['Campo','Descripción'],['Producto',ds.title],['Periodo',ds.period],['Indicador',variable.label],['Tabla',variable.table||variable.id],['Unidad',variable.unit],['Geografía',level],['Consulta',ds.retrievedAt||'2026-11-17'],['Fuente',variable.sourceUrl||ds.sourceUrl],['Registros',rows.length],['Notas',ds.description||'Los valores no disponibles se conservan en blanco y se identifican en la columna Estado.']];
  return {data:[header,...rows],meta,file:'Censo_PR_'+ds.id+'_'+variable.id+'_'+level};
}
$('export-csv').addEventListener('click',()=>{
  const {data,file}=exportRows();
  const csv=data.map(r=>r.map(k=>'"'+String(k??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  save(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}),file+'.csv');
});
$('export-xlsx').addEventListener('click',async()=>{
  const {data,meta,file}=exportRows();
  const {workbook}=await import('./xlsx.js');
  save(workbook([['Datos',data],['Fuentes',meta]]),file+'.xlsx');
});
const local=path=>json('./data/'+path+new URL(import.meta.url).search);
const fixedMaps=[['pr','puerto-rico.geojson'],['municipio','municipios.geojson'],['barrio','barrios.geojson'],['barrio-2024','barrios-2024.geojson'],['barrio-2020','barrios-2020.geojson'],['barrio-2010','barrios-2010.geojson']];
const mapLoads=Promise.all(fixedMaps.map(async ([id,file])=>{try{maps[id]=await local(file);}catch{}}));
const live=Promise.race([json('./api/releases').catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),3500))]);
Promise.all([local('catalog.json'),live]).then(([initial,updates])=>{
  const init=Array.isArray(initial)?initial:initial.products;
  const familyGroups = Object.keys(groups);
  catalog=init.map(c=>({...c,explore:c.explore && familyGroups.includes(c.explore)?c.explore:null}));
  if(updates?.products?.length) catalog.push(...updates.products);
  if(updates?.checkedAt) {
    const date=new Intl.DateTimeFormat('es-PR',{dateStyle:'medium',timeZone:'America/Puerto_Rico'}).format(new Date(updates.checkedAt));
    $('update-status').textContent='Última revisión del inventario oficial: '+date+'. Los archivos nuevos que aún no se han validado se enlazan en el catálogo.'+(updates.errors?.length?' Quedaron fuentes pendientes de revisión.':'');
  }
  options($('catalog-category'),[['','Todos los temas'],...[...new Set(catalog.map(c=>c.category))].sort(compare).map(c=>[c,c])]);
  renderCatalog();
}).catch(()=>{$('catalog-count').textContent='El catálogo no pudo cargarse.';});
Promise.all([local('observations.json'),local('geografias.json'),local('metadatos.json'),mapLoads,live]).then(([obs,geos,meta,_maps,updates])=>{
  const merged = new Map(obs.datasets.map(d=>[d.id,d]));
  for (const dataset of updates?.datasets || []) merged.set(dataset.id,dataset);
  datasets=[...merged.values()];
  locations=Array.isArray(geos)?geos:geos.geographies;
  mapsInfo=meta;
  geoIndex=new Map(locations.map(item=>[item.geoid,item]));
  const municipalities=locations.filter(g=>g.geoid.length===5).sort((a,b)=>compare(a.name,b.name));
  options($('parent'),[['','Todos los municipios'],...municipalities.map(g=>[g.geoid,g.name])]);
  const enabled = new Set(datasets.map(modeOf));
  options($('product'),Object.entries(groups).filter(([key])=>enabled.has(key)));
  for(const id of ['product','year','indicator','level','parent']) $(id).disabled=false;
  if(maps.municipio) $('hero-map').innerHTML=svgMap(maps.municipio.features,'',(_,p)=>Number(p.geoid.slice(-2))%3===0?'#3da98c58':'#63c9a62c',null,true);
  overview();periodOptions();if(catalog.length)renderCatalog();
}).catch(error=>{
  $('kpis').textContent='No se pudieron cargar los indicadores.';
  $('data-error').textContent='El explorador no pudo acceder a sus datos. Puedes consultar los enlaces del catálogo.';
  $('data-error').hidden=false;
  console.error(error);
});
