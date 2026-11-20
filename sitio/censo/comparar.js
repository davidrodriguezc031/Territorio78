/* Observatorio Censal PR · Comparaciones entre productos y periodos
   Tablas comparativas descargables y mapas por indicador (municipios y barrios),
   con reglas de coherencia basadas en la guía oficial del U.S. Census Bureau. */

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const collator = new Intl.Collator('es-PR', {sensitivity:'base', numeric:true});
const nf0 = new Intl.NumberFormat('es-PR', {maximumFractionDigits:0});
const nf1 = new Intl.NumberFormat('es-PR', {maximumFractionDigits:1, minimumFractionDigits:1});
const nf2 = new Intl.NumberFormat('es-PR', {maximumFractionDigits:2});
const qs = new URL(import.meta.url).search;
const getJSON = async p => { const r = await fetch('./data/' + p + qs); if (!r.ok) throw Error(r.status + ' ' + p); return r.json(); };

/* ---------- Límites de análisis (ver criterios en la página) ---------- */
export const LIMITES = {
  tablaPublicaciones: 6,   // periodos o productos por tabla
  tablaIndicadores: 4,     // indicadores por tabla
  mapaMunicipios: 4,       // periodos en mapas de municipios (+1 mapa de cambio)
  mapaBarrios: 2           // periodos en mapas de barrios (+1 mapa de cambio)
};
const Z90 = 1.645;

/* R-CPI-U-RS, promedio anual (dic. 1977 = 100). 2009–2019: BLS, tabla CPI-U-RS All items.
   2020: 2015 × 1.09257667 (Census, comparación ACS 2011–2015 vs 2016–2020). 2021: 399.0 (Census, comparación 2012–2016 vs 2017–2021).
   2022–2025: 2021 encadenado con los factores oficiales publicados por el Census Bureau (1.08091182, 1.04125145, 1.02937903, 1.02701423). */
const CPI = {2009:315.2,2010:320.4,2011:330.5,2012:337.5,2013:342.5,2014:348.3,2015:348.9,2016:353.4,2017:361.0,2018:369.8,2019:376.5,2020:381.2,2021:399.0};
CPI[2022] = CPI[2021]*1.08091182; CPI[2023] = CPI[2022]*1.04125145; CPI[2024] = CPI[2023]*1.02937903; CPI[2025] = CPI[2024]*1.02701423;
const DOLAR_ACS = new Set(['household_income','per_capita_income','median_rent']);

/* ---------- Familias de productos ---------- */
const FAM = {dec:'Censo Decenal', acs5:'ACS 5 años', acs1:'ACS 1 año', pep:'Estimados de población', cbp:'County Business Patterns', cre:'Resiliencia comunitaria', bps:'Permisos de construcción', ec:'Censo Económico'};
const fam = d => (d.id.match(/^(dec|acs5|acs1|pep|cbp|cre|bps|ec)-/) || [,'dec'])[1];
const pepVint = d => d.id.split('-')[1];
const pubLabel = d => {
  const f = fam(d);
  if (f === 'dec') return 'Censo ' + d.year;
  if (f === 'acs5') return 'ACS 5 años ' + d.period;
  if (f === 'acs1') return 'ACS 1 año ' + d.period;
  if (f === 'pep') return 'PEP v' + pepVint(d) + ' · ' + d.year;
  return FAM[f] + ' ' + d.period;
};
const sampled = f => f === 'acs5' || f === 'acs1' || f === 'cre';

/* ---------- Indicadores derivados (tasas y densidades) ---------- */
const DERIVED = {
  pct_vacant:      {label:'Viviendas vacantes (% del total de viviendas)', unit:'%', num:'vacant_housing', den:'housing'},
  pct_owner:       {label:'Viviendas ocupadas por sus dueños (% de ocupadas)', unit:'%', num:'owner_occupied', den:'occupied_housing'},
  pct_renter:      {label:'Viviendas ocupadas por inquilinos (% de ocupadas)', unit:'%', num:'renter_occupied', den:'occupied_housing'},
  poverty_rate:    {label:'Tasa de pobreza (% de personas con condición determinada)', unit:'%', num:'below_poverty', den:'poverty_universe'},
  unemployment_rate:{label:'Tasa de desempleo civil (% de la fuerza laboral civil)', unit:'%', num:'civilian_unemployed', den:'civilian_labor_force'},
  pct_bachelors:   {label:'Población de 25 años o más cuyo grado mayor es bachillerato (%)', unit:'%', num:'bachelors', den:'education_universe'},
  pct_public_transport:{label:'Trabajadores que usan transporte colectivo (%)', unit:'%', num:'public_transport', den:'commute_universe'},
  pct_work_home:   {label:'Trabajadores que trabajan desde su hogar (%)', unit:'%', num:'work_from_home', den:'commute_universe'},
  pct_internet:    {label:'Hogares con suscripción a internet (% de hogares)', unit:'%', num:'internet_households', den:'occupied_housing'},
  pop_density:     {label:'Densidad poblacional (personas por km² de tierra)', unit:'personas/km²', num:'population', den:'@area'},
  housing_density: {label:'Densidad de viviendas (viviendas por km² de tierra)', unit:'viviendas/km²', num:'housing', den:'@area'}
};
const MEDIANAS = new Set(['household_income','per_capita_income','median_rent','median_age']);
/* Comparables con el Censo Decenal (características básicas, guía del Census Bureau) */
const BASICAS = new Set(['population','housing','occupied_housing','vacant_housing','owner_occupied','renter_occupied','median_age','pct_vacant','pct_owner','pct_renter','pop_density','housing_density','male_population','female_population']);

/* ---------- Estado ---------- */
let DS = [], byId = new Map(), GEO = new Map(), META = {}, MUNI = null, BARRIOS = {}, INDS = new Map();
const st = {
  t: {level:'municipio', parent:'', pubs:[], inds:[], active:'', adjust:true, page:0, q:''},
  m: {level:'municipio', parent:'', pubs:[], ind:'', breaks:'quantile', change:true}
};

/* ---------- Valores ---------- */
const varIndex = (d, v) => d._idx.get(v) ?? -1;
function hasInd(d, ind) {
  if (DERIVED[ind]) { const D = DERIVED[ind]; return varIndex(d, D.num) >= 0 && (D.den === '@area' || varIndex(d, D.den) >= 0); }
  return varIndex(d, ind) >= 0;
}
function raw(d, geo, v) {
  const i = varIndex(d, v); if (i < 0) return {v:null, m:null};
  const r = d.rows[geo]?.[i]; const val = r?.[0], moe = r?.[1];
  if (!Number.isFinite(val)) return {v:null, m:null};
  // En la ACS, una cifra sin margen publicado es un total controlado (*****): MOE = 0 (instrucciones de prueba estadística del Census Bureau).
  if (sampled(fam(d))) return {v:val, m: Number.isFinite(moe) ? moe : (fam(d) === 'cre' ? null : 0)};
  return {v:val, m:null};
}
function areaKm2(geo, vintage) {
  const src = geo.length === 10 ? BARRIOS[vintage] : null;
  const f = src?._land?.get(geo);
  const land = f ?? GEO.get(geo)?.land_m2;
  return Number.isFinite(land) && land > 0 ? land / 1e6 : null;
}
function value(d, geo, ind) {
  const D = DERIVED[ind];
  if (!D) return raw(d, geo, ind);
  const X = raw(d, geo, D.num);
  if (!Number.isFinite(X.v)) return {v:null, m:null};
  if (D.den === '@area') {
    const a = areaKm2(geo, barrioVintage(d)); if (!a) return {v:null, m:null};
    return {v:X.v / a, m: X.m == null ? null : X.m / a};
  }
  const Y = raw(d, geo, D.den);
  if (!Number.isFinite(Y.v) || Y.v <= 0) return {v:null, m:null};
  const p = X.v / Y.v;
  let m = null;
  if (X.m != null && Y.m != null) {
    // MOE de una proporción (Census Bureau, ACS General Handbook, cap. 8); si el radicando es negativo, fórmula de razón.
    let inner = X.m**2 - p**2 * Y.m**2;
    if (inner < 0) inner = X.m**2 + p**2 * Y.m**2;
    m = 100 * Math.sqrt(inner) / Y.v;
  }
  return {v:100 * p, m};
}
function adjusted(d, geo, ind, target) {
  const r = value(d, geo, ind);
  if (target && DOLAR_ACS.has(ind) && fam(d).startsWith('acs') && Number.isFinite(r.v) && CPI[d.year] && CPI[target]) {
    const k = CPI[target] / CPI[d.year];
    return {v:r.v * k, m:r.m == null ? null : r.m * k, k};
  }
  return r;
}

/* ---------- Geografía: cambios de límites ---------- */
function barrioVintage(d) {
  const y = d.year, f = fam(d);
  const o = META.observationYears?.[String(y)];
  if (o) return o;
  if (f === 'dec' && y >= 2020) return 2020;
  return 2010;
}
const MUNI_CAMBIO = new Set(['72017','72029','72054','72087']); // Barceloneta, Canóvanas, Florida y Loíza
function geoExclusion(a, b, geo) {
  if (geo.length === 5 && MUNI_CAMBIO.has(geo) && Math.min(a.year, b.year) < 1980)
    return 'Límites municipales distintos: Canóvanas se creó en 1970 a partir de Loíza y Florida en 1971 a partir de Barceloneta.';
  if (geo.length === 10) {
    const va = barrioVintage(a), vb = barrioVintage(b);
    if (va !== vb && BARRIOS[va] && BARRIOS[vb]) {
      const la = BARRIOS[va]._land.get(geo), lb = BARRIOS[vb]._land.get(geo);
      if (la == null || lb == null) return 'El barrio no aparece en ambas ediciones cartográficas (' + va + ' y ' + vb + ').';
      if (Math.abs(la - lb) / Math.max(la, lb) > 0.02) return 'El área de tierra del barrio cambió más de 2 % entre las ediciones cartográficas ' + va + ' y ' + vb + '.';
    }
  }
  return '';
}

/* ---------- Reglas de coherencia entre dos publicaciones ---------- */
function rule(a, b, ind, level, adjust) {
  const fa = fam(a), fb = fam(b), out = {lvl:'ok', why:[]};
  const no = t => ({lvl:'no', why:[t]});
  const caution = t => { if (out.lvl === 'ok') out.lvl = 'cautela'; out.why.push(t); };
  if (a.id === b.id) return no('Es la misma publicación.');
  if (!hasInd(a, ind) || !hasInd(b, ind)) return no('El indicador no se publica en ambos productos.');
  const acs = f => f === 'acs1' || f === 'acs5';
  if (acs(fa) && acs(fb) && fa !== fb) return no('No se comparan estimados de 1 año con estimados de 5 años (Census Bureau: “1-year estimates should only be compared with other 1-year estimates”).');
  if (fa === 'acs5' && fb === 'acs5' && Math.abs(a.year - b.year) < 5) return no('Periodos de 5 años solapados (' + a.period + ' y ' + b.period + '): comparten ' + (5 - Math.abs(a.year - b.year)) + ' años de muestra. El Census Bureau recomienda comparar periodos que no se solapan.');
  if (fa === 'pep' && fb === 'pep' && pepVint(a) !== pepVint(b)) return no('Estimados de población de ediciones (vintages) distintas: cada edición revisa toda la serie; se compara dentro de la misma edición.');
  if ((fa === 'dec' && acs(fb)) || (fb === 'dec' && acs(fa))) {
    if (!BASICAS.has(ind)) return no('Con el Censo Decenal solo se comparan características básicas.');
    caution('Recuento censal frente a estimado de encuesta: el Censo es la cifra oficial de población; la ACS mide características y tiene margen de error.');
  }
  if ((fa === 'pep' && fb === 'dec') || (fb === 'pep' && fa === 'dec')) caution('Estimado al 1 de julio frente a recuento al 1 de abril; el PEP parte de la base del censo más reciente.');
  if ((fa === 'pep' && acs(fb)) || (fb === 'pep' && acs(fa))) caution('Los totales de población de la ACS se controlan a estimados del PEP de otra edición.');
  if (fa === 'cbp' && fb === 'cbp') caution('El Census Bureau no recomienda usar CBP como serie de tiempo: cambios de NAICS, ruido estadístico desde 2007 y ajustes de 2020–2022.');
  if (fa === 'cre' && fb === 'cre') caution('La metodología de Resiliencia Comunitaria cambió entre ediciones (correlación geográfica y márgenes desde 2023).');
  if (fa === 'ec' && fb === 'ec') caution('Ediciones del Censo Económico con clasificaciones NAICS distintas.');
  if (fa === 'bps' && fb === 'bps') out.why.push('Registros administrativos anuales (incluye imputación de municipios que no informan).');
  if (fa === 'acs1' && fb === 'acs1' && Math.abs(a.year - b.year) === 1) out.why.push('Años contiguos: parte de los meses de referencia coinciden.');
  if (DOLAR_ACS.has(ind)) {
    if (adjust) out.why.push('Dólares ajustados por inflación con el R-CPI-U-RS al año más reciente de la comparación.');
    else caution('Dólares nominales: sin ajuste por inflación la diferencia mezcla cambio real e inflación.');
  }
  if (['cbp_payroll_annual','cbp_payroll_quarter1','ec_sales','ec_payroll','bps_valuation'].some(k => ind.startsWith(k))) caution('Dólares nominales (sin ajuste por inflación).');
  if (level === 'barrio' && Math.min(a.year, b.year) < 2010) caution('Barrios de 1990 o 2000: se comparan por código GEOID; sus límites pueden diferir de los actuales.');
  if (level === 'municipio' && Math.min(a.year, b.year) < 1980) caution('Antes de 1980 había 76 municipios: Barceloneta, Canóvanas, Florida y Loíza quedan fuera de las diferencias.');
  if (ind === 'pop_density' || ind === 'housing_density') out.why.push(level === 'barrio' ? 'Densidad calculada con el área de tierra oficial de la edición cartográfica de cada periodo.' : 'Densidad calculada con el área de tierra oficial actual (edición cartográfica 2025).');
  return out;
}

/* ---------- Diferencia y prueba de significancia ---------- */
function change(a, b, geo, ind, target) {
  const A = adjusted(a, geo, ind, target), B = adjusted(b, geo, ind, target);
  if (!Number.isFinite(A.v) || !Number.isFinite(B.v)) return null;
  const pct = isPct(ind);
  const diff = B.v - A.v;
  const rel = !pct && A.v !== 0 ? 100 * diff / Math.abs(A.v) : null;
  let z = null, sig = null, test = 'sin prueba';
  const sa = sampled(fam(a)), sb = sampled(fam(b));
  if (sa || sb) {
    const ea = sa ? A.m : 0, eb = sb ? B.m : 0;  // los recuentos censales tienen error estándar cero
    if (ea != null && eb != null) {
      const se = Math.sqrt((ea / Z90)**2 + (eb / Z90)**2);
      if (se > 0) { z = diff / se; sig = Math.abs(z) > Z90; test = sig ? 'significativa' : 'no significativa'; }
      else test = 'sin error muestral';
    }
  } else test = 'sin margen de error publicado';
  const moeDiff = (sa || sb) && A.m != null && B.m != null ? Math.sqrt((sa ? A.m : 0)**2 + (sb ? B.m : 0)**2) : null;
  return {A, B, diff, rel, z, sig, test, moeDiff};
}
const isPct = ind => (DERIVED[ind]?.unit || INDS.get(ind)?.unit) === '%';

/* ---------- Formato ---------- */
function unitOf(ind) { return DERIVED[ind]?.unit || INDS.get(ind)?.unit || ''; }
function labelOf(ind) { return DERIVED[ind]?.label || INDS.get(ind)?.label || ind; }
function fmt(v, ind) {
  if (!Number.isFinite(v)) return '—';
  const u = unitOf(ind);
  if (u === '%') return nf1.format(v) + ' %';
  if (u === 'USD') return '$' + nf0.format(v);
  if (/miles de USD/.test(u)) return '$' + nf0.format(v) + ' mil';
  if (u === 'años') return nf1.format(v);
  if (/km²/.test(u)) return nf1.format(v);
  return nf0.format(v);
}
function fmtDiff(c, ind) {
  if (!c) return '—';
  const u = unitOf(ind);
  const mag = Math.abs(c.diff);
  const body = u === '%' ? nf1.format(mag) + ' pp' : u === 'USD' ? '$' + nf0.format(mag) : u === 'años' || /km²/.test(u) ? nf1.format(mag) : nf0.format(mag);
  const zero = /^[$]?0([.,]0)?( pp)?$/.test(body);
  return (zero ? '' : c.diff > 0 ? '+' : '−') + body;
}
const fmtRel = c => { if (!c || !Number.isFinite(c.rel)) return ''; const t = nf1.format(Math.abs(c.rel)); return (t === '0.0' ? '' : c.rel > 0 ? '+' : '−') + t + ' %'; };
const geoName = id => { if (id === '72') return 'Puerto Rico'; const g = GEO.get(id); if (g) return g.name; for (const v of [2010, 2020, 2024, 2025]) { const n = BARRIOS[v]?._name?.get(id); if (n) return n; } return id; };
const muniName = id => id.length === 10 ? GEO.get(id.slice(0, 5))?.name || '' : '';

/* ---------- Selección de geografías ---------- */
function geos(level, parent, pubs) {
  const len = {pr:2, municipio:5, barrio:10}[level];
  const set = new Set();
  for (const d of pubs) for (const g of Object.keys(d.rows)) if (g.length === len && (!parent || level !== 'barrio' || g.startsWith(parent))) set.add(g);
  return [...set].sort((a, b) => collator.compare(geoName(a), geoName(b)) || collator.compare(muniName(a), muniName(b)));
}
function pubsAvailable(level, inds) {
  const len = {pr:2, municipio:5, barrio:10}[level];
  return DS.filter(d => Object.keys(d.rows).some(g => g.length === len) && (!inds.length || inds.some(i => hasInd(d, i))));
}
const sortPubs = list => list.slice().sort((a, b) => a.year - b.year || collator.compare(fam(a), fam(b)));
function pairsOf(pubs) {
  const s = sortPubs(pubs), out = [];
  for (let i = 1; i < s.length; i++) out.push([s[i - 1], s[i]]);
  if (s.length > 2) out.push([s[0], s[s.length - 1]]);
  return out;
}
const targetYear = pubs => { const y = pubs.filter(d => fam(d).startsWith('acs')).map(d => d.year); return y.length ? Math.max(...y) : null; };

/* =================== TABLAS =================== */
function indOptions(pubs, mapOnly) {
  const ids = new Set();
  for (const d of pubs) { for (const v of d.variables) ids.add(v.id); for (const k of Object.keys(DERIVED)) if (hasInd(d, k)) ids.add(k); }
  let list = [...ids].filter(i => !mapOnly || mappable(i));
  return list.sort((a, b) => collator.compare(labelOf(a), labelOf(b)));
}
function mappable(ind) {
  const u = unitOf(ind);
  return u === '%' || u === 'años' || /km²/.test(u) || MEDIANAS.has(ind);
}
function pubPicker(el, pubs, chosen, max, onChange) {
  const groups = new Map(['acs5','acs1','dec','pep','cre','cbp','bps','ec'].map(f => [f, []]));
  for (const d of sortPubs(pubs)) { const f = fam(d); if (!groups.has(f)) groups.set(f, []); groups.get(f).push(d); }
  el.innerHTML = [...groups].filter(([, list]) => list.length).map(([f, list]) => '<fieldset><legend>' + esc(FAM[f]) + '</legend>' + list.map(d =>
    '<label><input type="checkbox" value="' + esc(d.id) + '"' + (chosen.includes(d.id) ? ' checked' : '') + (!chosen.includes(d.id) && chosen.length >= max ? ' disabled' : '') + '> ' + esc(f === 'pep' ? 'v' + pepVint(d) + ' · ' + d.year : d.period) + '</label>').join('') + '</fieldset>').join('') || '<p class="empty">No hay publicaciones con datos para esta geografía.</p>';
  el.onchange = e => { const id = e.target.value; if (!id) return; const s = new Set(chosen); e.target.checked ? s.add(id) : s.delete(id); onChange([...s]); };
}
function renderTablaControls() {
  const t = st.t;
  const pubs = pubsAvailable(t.level, []);
  t.pubs = t.pubs.filter(id => pubs.some(d => d.id === id));
  pubPicker($('cmp-pubs'), pubs, t.pubs, LIMITES.tablaPublicaciones, ids => { t.pubs = ids; t.page = 0; renderTablaControls(); });
  const chosen = t.pubs.map(id => byId.get(id));
  const inds = indOptions(chosen.length ? chosen : [], false);
  t.inds = t.inds.filter(i => inds.includes(i));
  $('cmp-inds').innerHTML = chosen.length ? inds.map(i => '<label><input type="checkbox" value="' + esc(i) + '"' + (t.inds.includes(i) ? ' checked' : '') + (!t.inds.includes(i) && t.inds.length >= LIMITES.tablaIndicadores ? ' disabled' : '') + '> ' + esc(labelOf(i)) + (DERIVED[i] ? ' <small>derivado</small>' : '') + '</label>').join('') : '<p class="empty">Elige primero las publicaciones.</p>';
  $('cmp-inds').onchange = e => { const id = e.target.value; const s = new Set(t.inds); e.target.checked ? s.add(id) : s.delete(id); t.inds = [...s]; if (!t.inds.includes(t.active)) t.active = t.inds[0] || ''; renderTablaControls(); };
  if (!t.inds.includes(t.active)) t.active = t.inds[0] || '';
  $('cmp-count').textContent = t.pubs.length + ' de ' + LIMITES.tablaPublicaciones + ' publicaciones · ' + t.inds.length + ' de ' + LIMITES.tablaIndicadores + ' indicadores';
  renderTabla();
}
function coherencia(pubs, inds, level, adjust) {
  const rows = [];
  for (const ind of inds) for (const [a, b] of pairsOf(pubs)) rows.push({ind, a, b, ...rule(a, b, ind, level, adjust)});
  return rows;
}
function cohHTML(rows) {
  if (!rows.length) return '';
  const tag = {ok:'<b class="coh ok">Válida</b>', cautela:'<b class="coh warn">Con cautela</b>', no:'<b class="coh no">No recomendada</b>'};
  const n = {ok:0, cautela:0, no:0}; rows.forEach(r => n[r.lvl]++);
  const resumen = rows.length + ' comparaciones evaluadas: ' + n.ok + ' válidas · ' + n.cautela + ' con cautela · ' + n.no + ' no recomendadas';
  const lista = '<ul class="coh-list">' + rows.map(r => '<li>' + tag[r.lvl] + ' <span>' + esc(labelOf(r.ind)) + ': ' + esc(pubLabel(r.a)) + ' → ' + esc(pubLabel(r.b)) + '</span>' + (r.why.length ? '<small>' + r.why.map(esc).join(' ') + '</small>' : '') + '</li>').join('') + '</ul>';
  return rows.length <= 3 ? lista : '<details class="coh-box"' + (n.no || n.cautela ? ' open' : '') + '><summary>' + esc(resumen) + '</summary>' + lista + '</details>';
}
function tablaData() {
  const t = st.t;
  const pubs = sortPubs(t.pubs.map(id => byId.get(id)));
  const target = t.adjust ? targetYear(pubs) : null;
  const ids = geos(t.level, t.parent, pubs);
  return {pubs, target, ids, pairs: pairsOf(pubs)};
}
function renderTabla() {
  const t = st.t, box = $('cmp-table');
  if (t.pubs.length < 2 || !t.inds.length) {
    $('cmp-coh').innerHTML = ''; $('cmp-tabs').innerHTML = '';
    box.innerHTML = '<p class="empty">Elige entre 2 y ' + LIMITES.tablaPublicaciones + ' publicaciones y entre 1 y ' + LIMITES.tablaIndicadores + ' indicadores.</p>';
    $('cmp-dl-csv').disabled = $('cmp-dl-xlsx').disabled = true; $('cmp-tests').textContent = ''; return;
  }
  const {pubs, target, ids, pairs} = tablaData();
  const coh = coherencia(pubs, t.inds, t.level, t.adjust);
  $('cmp-coh').innerHTML = cohHTML(coh);
  $('cmp-tabs').innerHTML = t.inds.map(i => '<button type="button" class="btn small ' + (i === t.active ? 'accent' : 'neutral') + '" data-ind="' + esc(i) + '">' + esc(labelOf(i)) + '</button>').join('');
  const ind = t.active;
  const okPairs = pairs.map(([a, b]) => ({a, b, r: rule(a, b, ind, t.level, t.adjust)}));
  const q = t.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = ids.filter(g => !q || (geoName(g) + ' ' + muniName(g) + ' ' + g).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
  const size = 25, pages = Math.max(1, Math.ceil(list.length / size));
  t.page = Math.min(t.page, pages - 1);
  const head = '<tr><th>Geografía</th>' + (t.level === 'barrio' ? '<th>Municipio</th>' : '') + pubs.map(d => '<th>' + esc(pubLabel(d)) + (target && DOLAR_ACS.has(ind) && fam(d).startsWith('acs') ? '<br><small>dólares de ' + target + '</small>' : '') + '</th>').join('') +
    okPairs.map(p => '<th class="chg">' + esc(p.a.year + '→' + p.b.year) + (p.r.lvl === 'cautela' ? ' ⚠' : '') + '</th>').join('') + '</tr>';
  let tests = 0, signif = 0;
  for (const g of ids) for (const p of okPairs) if (p.r.lvl !== 'no' && !geoExclusion(p.a, p.b, g)) { const c = change(p.a, p.b, g, ind, target); if (c?.sig != null) { tests++; if (c.sig) signif++; } }
  const body = list.slice(t.page * size, (t.page + 1) * size).map(g => '<tr><td>' + esc(geoName(g)) + '<small class="gid">' + esc(g) + '</small></td>' + (t.level === 'barrio' ? '<td>' + esc(muniName(g)) + '</td>' : '') +
    pubs.map(d => { const r = adjusted(d, g, ind, target); return '<td>' + (hasInd(d, ind) ? esc(fmt(r.v, ind)) + (r.m != null && Number.isFinite(r.v) && sampled(fam(d)) ? (r.m === 0 ? '<small>total controlado</small>' : '<small>± ' + esc(fmt(r.m, ind).replace(' %', '')) + '</small>') : '') : '<span class="na">no publicado</span>') + '</td>'; }).join('') +
    okPairs.map(p => {
      if (p.r.lvl === 'no') return '<td class="chg na" title="' + esc(p.r.why.join(' ')) + '">no comparable</td>';
      const ex = geoExclusion(p.a, p.b, g); if (ex) return '<td class="chg na" title="' + esc(ex) + '">límites distintos</td>';
      const c = change(p.a, p.b, g, ind, target);
      if (!c) return '<td class="chg na">—</td>';
      const cls = c.sig === true ? ' sig' : c.sig === false ? ' nosig' : '';
      return '<td class="chg' + cls + '" title="' + esc(c.test + (c.z != null ? ' · Z = ' + nf2.format(c.z) : '')) + '">' + esc(fmtDiff(c, ind)) + (fmtRel(c) ? '<small>' + esc(fmtRel(c)) + '</small>' : '') + (c.sig === true ? '<small>significativa</small>' : c.sig === false ? '<small>no significativa</small>' : '') + '</td>';
    }).join('') + '</tr>').join('');
  box.innerHTML = '<div class="table-scroll"><table class="cmp"><thead>' + head + '</thead><tbody>' + (body || '<tr><td colspan="99" class="empty">Sin resultados.</td></tr>') + '</tbody></table></div>' +
    '<div class="pagination"><span>' + (list.length ? (t.page * size + 1) + '–' + Math.min((t.page + 1) * size, list.length) + ' de ' + list.length : '0') + ' geografías</span><div><button class="btn small neutral" data-pg="-1"' + (t.page ? '' : ' disabled') + '>Anterior</button><button class="btn small neutral" data-pg="1"' + (t.page < pages - 1 ? '' : ' disabled') + '>Siguiente</button></div></div>';
  $('cmp-tests').textContent = tests ? 'Pruebas de diferencia al 90 % para este indicador: ' + nf0.format(tests) + ' · significativas: ' + nf0.format(signif) + ' · esperables por azar si no hubiera cambios: unas ' + nf0.format(Math.round(tests * 0.1)) + '. Interpreta los cambios aislados con prudencia.' : 'Este indicador no tiene margen de error publicado: las diferencias son aritméticas, sin prueba de significancia.';
  $('cmp-dl-csv').disabled = $('cmp-dl-xlsx').disabled = false;
}
function tablaExport() {
  const t = st.t;
  const {pubs, target, ids, pairs} = tablaData();
  const valores = [['GEOID','Geografía','Municipio','Indicador','Unidad','Producto','Periodo','Valor publicado','Margen de error (90 %)','Valor comparado','Margen comparado','Ajuste','Fuente oficial']];
  const cambios = [['GEOID','Geografía','Municipio','Indicador','Desde','Hasta','Coherencia','Motivo','Diferencia','Margen de error de la diferencia (90 %)','Cambio relativo (%)','Z','Resultado (90 %)']];
  for (const ind of t.inds) {
    for (const g of ids) {
      for (const d of pubs) {
        if (!hasInd(d, ind)) continue;
        const r0 = value(d, g, ind), r = adjusted(d, g, ind, target);
        valores.push([g, geoName(g), muniName(g), labelOf(ind), unitOf(ind), FAM[fam(d)], pubLabel(d), r0.v ?? '', r0.m ?? '', r.v ?? '', r.m ?? '', r.k ? 'Dólares de ' + target + ' (R-CPI-U-RS, factor ' + r.k.toFixed(6) + ')' : '', d.sourceUrl || '']);
      }
      for (const [a, b] of pairs) {
        const rr = rule(a, b, ind, t.level, t.adjust);
        const ex = rr.lvl === 'no' ? '' : geoExclusion(a, b, g);
        const c = rr.lvl === 'no' || ex ? null : change(a, b, g, ind, target);
        cambios.push([g, geoName(g), muniName(g), labelOf(ind), pubLabel(a), pubLabel(b), ex ? 'No comparable' : {ok:'Válida', cautela:'Con cautela', no:'No recomendada'}[rr.lvl], ex || rr.why.join(' '), c?.diff ?? '', c?.moeDiff ?? '', c?.rel ?? '', c?.z ?? '', c ? c.test : '']);
      }
    }
  }
  const coh = [['Indicador','Desde','Hasta','Coherencia','Motivos']].concat(coherencia(pubs, t.inds, t.level, t.adjust).map(r => [labelOf(r.ind), pubLabel(r.a), pubLabel(r.b), {ok:'Válida', cautela:'Con cautela', no:'No recomendada'}[r.lvl], r.why.join(' ')]));
  const name = 'Comparacion_Censo_PR_' + t.level + '_' + pubs.map(d => d.id).join('_').slice(0, 80);
  return {valores, cambios, coh, name};
}
function criteriosRows() {
  return [['Criterio','Detalle','Fuente'],
    ['1 año frente a 5 años','No se comparan entre sí; solo 1 año con 1 año y 5 años con 5 años.','https://www.census.gov/programs-surveys/acs/guidance/comparing-acs-data.html'],
    ['Periodos solapados de 5 años','No se comparan; se usan periodos que no se solapan (p. ej., 2015–2019 y 2020–2024).','https://www.census.gov/content/dam/Census/library/publications/2020/acs/acs_general_handbook_2020_ch04.pdf'],
    ['Censo Decenal y ACS','Solo características básicas; para totales de población rige el Censo.','https://www.census.gov/programs-surveys/acs/guidance/comparing-acs-data.html'],
    ['Prueba de significancia','Z = (B − A) / √(EE_A² + EE_B²), EE = MOE / 1.645; significativa si |Z| > 1.645 (90 %). Recuentos censales y totales controlados: EE = 0.','https://www2.census.gov/programs-surveys/acs/tech_docs/statistical_testing/2025_Instructions_for_Stat_Testing_ACS.pdf'],
    ['Proporciones derivadas','MOE(p) = √(MOE_X² − p²·MOE_Y²) / Y; si el radicando es negativo, fórmula de razón.','https://www.census.gov/content/dam/Census/library/publications/2018/acs/acs_general_handbook_2018_ch08.pdf'],
    ['Inflación','Dólares de la ACS ajustados con el R-CPI-U-RS al año final del periodo más reciente.','https://www.census.gov/content/dam/Census/library/publications/2020/acs/acs_general_handbook_2020_ch10.pdf'],
    ['Estimados de población','Solo dentro de la misma edición (vintage).','https://www.census.gov/programs-surveys/popest.html'],
    ['County Business Patterns','Con cautela: el Census Bureau no recomienda usarlo como serie de tiempo.','https://www.census.gov/programs-surveys/cbp/about/faqs.html'],
    ['Resiliencia comunitaria','Con cautela: la metodología cambió entre ediciones.','https://www2.census.gov/programs-surveys/demo/technical-documentation/community-resilience/2023/pr/cre_pr_techdoc_2023.pdf'],
    ['Límites geográficos','Municipios antes de 1980 (Canóvanas, Florida, Loíza, Barceloneta) y barrios con cambio de área de tierra > 2 % entre ediciones cartográficas quedan fuera de las diferencias.','https://www.census.gov/geographies/reference-files/2020/geo/state-local-geo-guides-2020/puerto-rico.html'],
    ['Límites de análisis','Tablas: 2–6 publicaciones y 1–4 indicadores; cambios entre periodos consecutivos y del primero al último. Mapas: 1 indicador; municipios hasta 4 periodos y barrios hasta 2, más un mapa de cambio.','Criterio del Observatorio'],
    ['Clases de mapas','Cortes comunes a todos los paneles (cuantiles combinados, 5 clases).','https://doi.org/10.1111/1467-8306.00310']];
}
function saveBlob(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); }
const toCSV = rows => '﻿' + rows.map(r => r.map(k => '"' + String(k ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');

/* =================== MAPAS =================== */
const SEQ = ['#d5eee5','#a5dccd','#65c0aa','#289d88','#146857'];
const DIV = ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e']; // BrBG, apto para daltonismo
const NODATA = 'url(#nd)', NOCOMP = 'url(#nc)', NOSIG = '#eeeeee';
let EXTENT = null, LEG = [], LEGNOTE = '';
function extentOf(gj) {
  let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
  for (const f of gj.features) for (const ring of rings(f)) for (const [x, y] of ring) { if (x < l) l = x; if (x > r) r = x; if (y < b) b = y; if (y > t) t = y; }
  return {l, r, b, t};
}
const rings = f => f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
const KX = 100 * Math.cos(18.2 * Math.PI / 180);
function pathsOf(gj) {
  if (gj._d) return gj._d;
  const {l, t} = EXTENT;
  gj._d = new Map(gj.features.map(f => [f.properties.geoid, rings(f).map(r => r.map(([x, y], i) => (i ? 'L' : 'M') + ((x - l) * KX).toFixed(2) + ' ' + ((t - y) * 100).toFixed(2)).join('') + 'Z').join('')]));
  return gj._d;
}
function quantileBreaks(vals, k) {
  const s = vals.slice().sort((a, b) => a - b); if (!s.length) return [];
  const out = []; for (let i = 1; i < k; i++) { const p = (s.length - 1) * i / k, lo = Math.floor(p); out.push(s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo)); }
  return [...new Set(out.map(v => +v.toPrecision(6)))];
}
function equalBreaks(vals, k) { const mn = Math.min(...vals), mx = Math.max(...vals); return Array.from({length:k - 1}, (_, i) => mn + (mx - mn) * (i + 1) / k); }
const classOf = (v, br) => { let i = 0; while (i < br.length && v > br[i]) i++; return i; };
function panelSVG(gj, fill, title, w, opts = {}) {
  const P = pathsOf(gj), {l, r, b, t} = EXTENT;
  const W = (r - l) * KX, H = (t - b) * 100, pad = 4;
  const ps = gj.features.filter(f => !opts.parent || f.properties.geoid.startsWith(opts.parent)).map(f => { const id = f.properties.geoid; const [c, tip] = fill(id); return '<path d="' + P.get(id) + '" fill="' + c + '" fill-rule="evenodd"><title>' + esc(tip) + '</title></path>'; }).join('');
  const sb = 20 / (111.32 * Math.cos(18.2 * Math.PI / 180)) * KX; // 20 km
  return '<svg class="cmp-map" viewBox="' + (-pad) + ' ' + (-pad - 12) + ' ' + (W + 2 * pad) + ' ' + (H + 2 * pad + 32) + '" role="img" aria-label="' + esc(title) + '"' + (w ? ' width="' + w + '"' : '') + '>' +
    '<text x="0" y="-4" class="pt">' + esc(title) + '</text><g class="geo">' + ps + '</g>' +
    '<g class="sb" transform="translate(' + (W - sb - 2) + ',' + (H + 10) + ')"><path d="M0 0H' + sb.toFixed(2) + '" stroke="#425f62" stroke-width="1.2"/><path d="M0 -2V2M' + sb.toFixed(2) + ' -2V2" stroke="#425f62" stroke-width="1"/><text x="' + (sb / 2).toFixed(2) + '" y="9" text-anchor="middle">20 km</text></g></svg>';
}
const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
  '<pattern id="nd" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#f4f4f4"/><path d="M0 0V5" stroke="#bdbdbd" stroke-width="1.2"/></pattern>' +
  '<pattern id="nc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="6" height="6" fill="#dcdcdc"/><path d="M0 0V6" stroke="#8d8d8d" stroke-width="1.4"/></pattern></defs></svg>';
async function barrioGeo(v) {
  if (BARRIOS[v]) return BARRIOS[v];
  const file = {2010:'barrios-2010.geojson', 2020:'barrios-2020.geojson', 2024:'barrios-2024.geojson', 2025:'barrios.geojson'}[v] || 'barrios.geojson';
  const gj = await getJSON(file);
  gj._land = new Map(gj.features.map(f => [f.properties.geoid, f.properties.land_m2]));
  gj._name = new Map(gj.features.map(f => [f.properties.geoid, f.properties.name]));
  BARRIOS[v] = gj; return gj;
}
async function ensureBarrios() { await Promise.all([2010, 2020, 2024, 2025].map(barrioGeo)); }

function renderMapaControls() {
  const m = st.m;
  const pubs = pubsAvailable(m.level, []);
  m.pubs = m.pubs.filter(id => pubs.some(d => d.id === id));
  const max = m.level === 'barrio' ? LIMITES.mapaBarrios : LIMITES.mapaMunicipios;
  if (m.pubs.length > max) m.pubs = m.pubs.slice(0, max);
  pubPicker($('map-pubs'), pubs, m.pubs, max, ids => { m.pubs = ids; renderMapaControls(); });
  const chosen = m.pubs.map(id => byId.get(id));
  const inds = indOptions(chosen, true).filter(i => chosen.every(d => hasInd(d, i)));
  if (!inds.includes(m.ind)) m.ind = inds[0] || '';
  $('map-ind').innerHTML = inds.length ? inds.map(i => '<option value="' + esc(i) + '"' + (i === m.ind ? ' selected' : '') + '>' + esc(labelOf(i)) + '</option>').join('') : '<option value="">Sin indicadores comunes</option>';
  $('map-ind').disabled = !inds.length;
  $('map-count').textContent = m.pubs.length + ' de ' + max + ' periodos' + (m.pubs.length >= 2 ? ' + mapa de cambio' : '');
  renderMapa();
}
async function renderMapa() {
  const m = st.m, out = $('map-panels');
  const pubs = sortPubs(m.pubs.map(id => byId.get(id)));
  if (!pubs.length || !m.ind) { out.innerHTML = '<p class="empty">Elige un indicador y de 1 a ' + (m.level === 'barrio' ? LIMITES.mapaBarrios : LIMITES.mapaMunicipios) + ' periodos.</p>'; $('map-legend2').innerHTML = ''; $('map-note').innerHTML = ''; $('map-coh').innerHTML = ''; $('map-dl-svg').disabled = $('map-dl-png').disabled = true; return; }
  if (m.level === 'barrio') { out.innerHTML = '<p class="empty">Cargando cartografía de barrios…</p>'; await ensureBarrios(); }
  const ind = m.ind, target = targetYear(pubs);
  const pairs = []; for (let i = 0; i < pubs.length; i++) for (let j = i + 1; j < pubs.length; j++) pairs.push([pubs[i], pubs[j]]);
  const coh = pairs.map(([a, b]) => ({ind, a, b, ...rule(a, b, ind, m.level, true)}));
  $('map-coh').innerHTML = pubs.length > 1 ? cohHTML(coh) : '';
  if (coh.some(r => r.lvl === 'no')) { out.innerHTML = '<p class="notice">Esta combinación incluye comparaciones no recomendadas. Cambia los periodos para dibujar mapas comparables.</p>'; $('map-legend2').innerHTML = ''; $('map-note').innerHTML = ''; $('map-dl-svg').disabled = $('map-dl-png').disabled = true; return; }
  const gjOf = d => m.level === 'barrio' ? BARRIOS[barrioVintage(d)] : MUNI;
  // Cortes comunes a todos los paneles (cuantiles combinados): permiten comparar colores entre periodos.
  const pooled = [];
  for (const d of pubs) for (const f of gjOf(d).features) { const g = f.properties.geoid; if (m.parent && !g.startsWith(m.parent)) continue; const r = adjusted(d, g, ind, target); if (Number.isFinite(r.v)) pooled.push(r.v); }
  const br = !pooled.length ? [] : m.breaks === 'equal' ? equalBreaks(pooled, 5) : quantileBreaks(pooled, 5);
  const panels = pubs.map(d => panelSVG(gjOf(d), g => { const r = adjusted(d, g, ind, target); return Number.isFinite(r.v) ? [SEQ[classOf(r.v, br)], geoName(g) + (g.length === 10 ? ' (' + muniName(g) + ')' : '') + ': ' + fmt(r.v, ind) + (r.m != null && sampled(fam(d)) ? ' ± ' + fmt(r.m, ind) : '')] : [NODATA, geoName(g) + ': sin dato']; }, pubLabel(d) + (target && DOLAR_ACS.has(ind) && fam(d).startsWith('acs') ? ' · dólares de ' + target : ''), null, {parent:m.parent}));
  let changeSVG = '', changeLegend = '', CHG = null, CHGNOTE = '';
  if (m.change && pubs.length >= 2) {
    const a = pubs[0], b = pubs[pubs.length - 1], gj = gjOf(b), pct = isPct(ind);
    const vals = new Map(); let ns = 0, nc = 0, sgn = 0;
    for (const f of gj.features) { const g = f.properties.geoid; if (m.parent && !g.startsWith(m.parent)) continue; const ex = geoExclusion(a, b, g); if (ex) { vals.set(g, {ex}); nc++; continue; } const c = change(a, b, g, ind, target); if (!c) continue; const v = pct ? c.diff : c.rel; if (!Number.isFinite(v)) continue; vals.set(g, {v, c}); if (c.sig === false) ns++; if (c.sig === true) sgn++; }
    const mags = [...vals.values()].filter(x => Number.isFinite(x.v) && x.c.sig !== false).map(x => Math.abs(x.v)).sort((p, q) => p - q);
    const q1 = mags.length ? mags[Math.floor(mags.length / 3)] : 0, q2 = mags.length ? mags[Math.floor(2 * mags.length / 3)] : 0;
    const dbr = [-q2, -q1, 0, q1, q2];
    const unitTxt = pct ? ' pp' : ' %';
    changeSVG = panelSVG(gj, g => { const x = vals.get(g); if (!x) return [NODATA, geoName(g) + ': sin dato']; if (x.ex) return [NOCOMP, geoName(g) + ': ' + x.ex]; const tip = geoName(g) + ': ' + (x.v > 0 ? '+' : '') + nf1.format(x.v) + unitTxt + (x.c.sig === false ? ' (no significativa al 90 %)' : x.c.sig ? ' (significativa al 90 %)' : ''); if (x.c.sig === false) return [NOSIG, tip]; return [DIV[classOf(x.v, dbr)], tip]; },
      'Cambio ' + a.year + '→' + b.year + (pct ? ' (puntos porcentuales)' : ' (%)'), null, {parent:m.parent});
    const lab = (x) => nf1.format(x) + unitTxt;
    const citems = [[DIV[0], 'menos de −' + lab(q2)], [DIV[1], '−' + lab(q2) + ' a −' + lab(q1)], [DIV[2], '−' + lab(q1) + ' a 0'], [DIV[3], '0 a ' + lab(q1)], [DIV[4], lab(q1) + ' a ' + lab(q2)], [DIV[5], 'más de ' + lab(q2)]];
    if (ns) citems.push([NOSIG, 'Cambio no significativo al 90 % (' + ns + ')']);
    if (nc) citems.push([NOCOMP, 'No comparable por cambio de límites (' + nc + ')']);
    CHG = {t: 'Cambio ' + pubLabel(a) + ' → ' + pubLabel(b) + (pct ? ' (puntos porcentuales)' : ' (%)'), items: citems};
    const sw = c => c === NOCOMP ? '<b class="swatch hatch-nc"></b>' : c === NODATA ? '<b class="swatch hatch-nd"></b>' : '<b class="swatch" style="background:' + c + '"></b>';
    changeLegend = '<div class="lg"><strong>' + esc(CHG.t) + '</strong>' + citems.map(([c, t]) => '<span>' + sw(c) + esc(t) + '</span>').join('') + '</div>';
    if (sgn + ns) { CHGNOTE = 'Pruebas al 90 %: ' + nf0.format(sgn + ns) + ' · significativas: ' + nf0.format(sgn) + ' · esperables por azar: unas ' + nf0.format(Math.round((sgn + ns) * .1)) + '.'; changeLegend += '<p class="map-source">' + esc(CHGNOTE) + '</p>'; }
  }
  out.innerHTML = DEFS + '<div class="cmp-grid n' + (pubs.length + (changeSVG ? 1 : 0)) + '">' + panels.map(s => '<figure>' + s + '</figure>').join('') + (changeSVG ? '<figure class="chg">' + changeSVG + '</figure>' : '') + '</div>';
  const items = br.length ? SEQ.slice(0, br.length + 1).map((c, i) => [c, i === 0 ? 'hasta ' + fmt(br[0], ind) : i === br.length ? 'más de ' + fmt(br[br.length - 1], ind) : fmt(br[i - 1], ind) + ' a ' + fmt(br[i], ind)]) : [];
  LEG = [{t: labelOf(ind), items: items.concat([[NODATA, 'Sin dato']])}];
  if (changeLegend) LEG.push(CHG);
  LEGNOTE = CHGNOTE;
  $('map-legend2').innerHTML = '<div class="lg"><strong>' + esc(labelOf(ind)) + '</strong>' + items.map(([c, t]) => '<span><b class="swatch" style="background:' + c + '"></b>' + esc(t) + '</span>').join('') + '<span><b class="swatch hatch-nd"></b>Sin dato</span></div>' + changeLegend;
  $('map-note').innerHTML = 'Clases ' + (m.breaks === 'equal' ? 'de intervalos iguales' : 'por cuantiles') + ' calculadas con los valores de todos los paneles, para que un mismo color signifique lo mismo en cada periodo. ' +
    (m.level === 'barrio' ? 'Cada panel usa la edición cartográfica de su periodo; el mapa de cambio usa la del periodo más reciente. ' : '') +
    'Proyección equirrectangular ajustada a 18.2° N; escala gráfica aproximada. Fuente: U.S. Census Bureau, ' + pubs.map(pubLabel).join('; ') + '; límites cartográficos del Census Bureau.';
  $('map-dl-svg').disabled = $('map-dl-png').disabled = false;
}
function composeSVG() {
  const figs = [...document.querySelectorAll('#map-panels figure svg')];
  if (!figs.length) return null;
  const cols = figs.length > 1 ? 2 : 1, cw = 620;
  const vb = figs[0].getAttribute('viewBox').split(' ').map(Number);
  const ch = Math.round((cw - 20) * vb[3] / vb[2]) + 14, rows = Math.ceil(figs.length / cols);
  const wrapText = (t, n) => { const out = []; let line = ''; for (const w of t.split(' ')) { if ((line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; } if (line) out.push(line); return out; };
  const W = cols * cw;
  let y = 76 + rows * ch + 10, body = '';
  for (const g of LEG) {
    body += '<text x="20" y="' + y + '" font-size="13" font-weight="700" fill="#173239">' + esc(g.t) + '</text>'; y += 10;
    let x = 20;
    for (const [c, t] of g.items) {
      const wTxt = 26 + t.length * 6.4;
      if (x + wTxt > W - 20) { x = 20; y += 20; }
      body += '<rect x="' + x + '" y="' + y + '" width="16" height="11" rx="2" fill="' + c + '" stroke="#42655a40"/><text x="' + (x + 21) + '" y="' + (y + 10) + '" font-size="11.5" fill="#355458">' + esc(t) + '</text>';
      x += wTxt;
    }
    y += 34;
  }
  const notes = [LEGNOTE, $('map-note').innerText].filter(Boolean).flatMap(t => wrapText(t, Math.floor(W / 6.2)));
  for (const t of notes) { body += '<text x="20" y="' + y + '" font-size="10.5" fill="#5b6f74">' + esc(t) + '</text>'; y += 15; }
  let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + (y + 12) + '" font-family="Inter,Segoe UI,system-ui,sans-serif"><rect width="100%" height="100%" fill="#fff"/>' + $('map-panels').querySelector('defs').outerHTML +
    '<text x="20" y="34" font-size="20" font-weight="700" fill="#173239">' + esc(labelOf(st.m.ind)) + '</text><text x="20" y="56" font-size="12" fill="#5b6f74">Observatorio Censal de Puerto Rico · ' + esc(st.m.level === 'barrio' ? 'Barrios y barrios-pueblo' : 'Municipios') + (st.m.parent ? ' de ' + esc(geoName(st.m.parent)) : '') + '</text>';
  figs.forEach((svg, i) => {
    const x = (i % cols) * cw + 10, yy = 70 + Math.floor(i / cols) * ch;
    s += '<svg x="' + x + '" y="' + yy + '" width="' + (cw - 20) + '" height="' + (ch - 8) + '" viewBox="' + svg.getAttribute('viewBox') + '"><style>.pt{font-size:7px;font-weight:700;fill:#173239}.sb text{font-size:5px;fill:#425f62}.geo path{stroke:#ffffff;stroke-width:.25}</style>' + svg.innerHTML + '</svg>';
  });
  return s + body + '</svg>';
}

/* =================== Arranque =================== */
export async function initComparar() {
  const [obs, geos, meta, muni] = await Promise.all([getJSON('observations.json'), getJSON('geografias.json'), getJSON('metadatos.json'), getJSON('municipios.geojson')]);
  // dec-pl-AAAA y dec-sf1-AAAA repiten, con los códigos crudos del Census Bureau, las mismas cifras de dec-AAAA:
  // sirven de verificación en el catálogo, pero en las comparaciones aparecerían como periodos duplicados.
  DS = obs.datasets.filter(d => !/^dec-(pl|sf1)-\d{4}$/.test(d.id)).map(d => ({...d, _idx: new Map(d.variables.map((v, i) => [v.id, i]))}));
  byId = new Map(DS.map(d => [d.id, d]));
  for (const d of DS) for (const v of d.variables) if (!INDS.has(v.id)) INDS.set(v.id, v);
  const list = Array.isArray(geos) ? geos : geos.geographies;
  GEO = new Map(list.map(g => [g.geoid, g]));
  META = meta; MUNI = muni; EXTENT = extentOf(muni);
  const munis = list.filter(g => g.geoid.length === 5).sort((a, b) => collator.compare(a.name, b.name));
  for (const id of ['cmp-parent', 'map-parent']) $(id).innerHTML = '<option value="">Todos los municipios</option>' + munis.map(g => '<option value="' + g.geoid + '">' + esc(g.name) + '</option>').join('');
  // Selección inicial ilustrativa: periodos de 5 años que no se solapan.
  st.t.pubs = ['acs5-2014', 'acs5-2019', 'acs5-2024'].filter(id => byId.has(id));
  st.t.inds = ['poverty_rate', 'household_income'];
  st.m.pubs = ['acs5-2019', 'acs5-2024'].filter(id => byId.has(id)); st.m.ind = 'poverty_rate';
  $('cmp-level').onchange = e => { st.t.level = e.target.value; st.t.page = 0; $('cmp-parent-label').hidden = st.t.level !== 'barrio'; if (st.t.level === 'barrio') ensureBarrios().then(renderTablaControls); else renderTablaControls(); };
  $('cmp-parent').onchange = e => { st.t.parent = e.target.value; st.t.page = 0; renderTabla(); };
  $('cmp-adjust').onchange = e => { st.t.adjust = e.target.checked; renderTabla(); };
  $('cmp-search').oninput = e => { st.t.q = e.target.value.trim(); st.t.page = 0; renderTabla(); };
  $('cmp-tabs').onclick = e => { const i = e.target.closest('[data-ind]')?.dataset.ind; if (i) { st.t.active = i; st.t.page = 0; renderTabla(); } };
  $('cmp-table').onclick = e => { const p = e.target.closest('[data-pg]')?.dataset.pg; if (p) { st.t.page += +p; renderTabla(); } };
  $('cmp-dl-csv').onclick = () => { const x = tablaExport(); saveBlob(new Blob([toCSV(x.cambios)], {type:'text/csv;charset=utf-8'}), x.name + '_cambios.csv'); saveBlob(new Blob([toCSV(x.valores)], {type:'text/csv;charset=utf-8'}), x.name + '_valores.csv'); };
  $('cmp-dl-xlsx').onclick = async () => { const x = tablaExport(); const {workbook} = await import('./xlsx.js' + qs); saveBlob(workbook([['Valores', x.valores], ['Cambios', x.cambios], ['Coherencia', x.coh], ['Criterios', criteriosRows()]]), x.name + '.xlsx'); };
  $('map-level').onchange = e => { st.m.level = e.target.value; $('map-parent-label').hidden = st.m.level !== 'barrio'; renderMapaControls(); };
  $('map-parent').onchange = e => { st.m.parent = e.target.value; renderMapa(); };
  $('map-ind').onchange = e => { st.m.ind = e.target.value; renderMapa(); };
  $('map-breaks').onchange = e => { st.m.breaks = e.target.value; renderMapa(); };
  $('map-change').onchange = e => { st.m.change = e.target.checked; renderMapa(); };
  $('map-dl-svg').onclick = () => { const s = composeSVG(); if (s) saveBlob(new Blob([s], {type:'image/svg+xml'}), 'Mapa_Censo_PR_' + st.m.ind + '.svg'); };
  $('map-dl-png').onclick = () => {
    const s = composeSVG(); if (!s) return;
    const img = new Image(); const url = URL.createObjectURL(new Blob([s], {type:'image/svg+xml'}));
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; const x = c.getContext('2d'); x.scale(2, 2); x.drawImage(img, 0, 0); URL.revokeObjectURL(url); c.toBlob(b => saveBlob(b, 'Mapa_Censo_PR_' + st.m.ind + '.png'), 'image/png'); };
    img.src = url;
  };
  $('cmp-criteria').innerHTML = criteriosRows().slice(1).map(([a, b, c]) => '<li><strong>' + esc(a) + '.</strong> ' + esc(b) + (c.startsWith('http') ? ' <a href="' + esc(c) + '" target="_blank" rel="noopener">Fuente ↗</a>' : '') + '</li>').join('');
  renderTablaControls(); renderMapaControls();
}
