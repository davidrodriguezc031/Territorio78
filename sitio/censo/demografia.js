/* Observatorio Censal PR · Análisis demográfico
   Componentes del cambio (PEP), migración neta municipal por supervivencia, estructura por edad y crecimiento. */

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf0 = new Intl.NumberFormat('es-PR', {maximumFractionDigits:0});
const nf1 = new Intl.NumberFormat('es-PR', {maximumFractionDigits:1, minimumFractionDigits:1});
const nf2 = new Intl.NumberFormat('es-PR', {maximumFractionDigits:2, minimumFractionDigits:2});
const sg = (v, f = nf0) => (v > 0 ? '+' : v < 0 ? '−' : '') + f.format(Math.abs(v));
const qs = new URL(import.meta.url).search;
const collator = new Intl.Collator('es-PR', {sensitivity:'base'});
const getJSON = async p => { const r = await fetch('./data/' + p + qs); if (!r.ok) throw Error(r.status + ' ' + p); return r.json(); };

let D = null, GJ = null, EXT = null;
let S = null;
const st = {sel:[], selLabel:'', tab:'componentes', muni:'72127', ind:'dep_vejez', anio:'', ordenM:'tasa', ordenE:'valor'};
const SEQ = ['#d5eee5','#a5dccd','#65c0aa','#289d88','#146857'];
const DIV = ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e'];
const C = {nac:'#2a9d8f', def:'#b5651d', mig:'#3d6fb0', tot:'#173239'};

const INDICES = {
  dep_total:{label:'Índice de dependencia total', unit:'por 100 de 15–64 años', f:'((0–14) + (65+)) / (15–64) × 100'},
  dep_juvenil:{label:'Índice de dependencia juvenil', unit:'por 100 de 15–64 años', f:'(0–14) / (15–64) × 100'},
  dep_vejez:{label:'Índice de dependencia de vejez', unit:'por 100 de 15–64 años', f:'(65+) / (15–64) × 100'},
  envejecimiento:{label:'Índice de envejecimiento', unit:'personas de 65+ por cada 100 de 0–14', f:'(65+) / (0–14) × 100'},
  masculinidad:{label:'Razón de masculinidad', unit:'hombres por cada 100 mujeres', f:'Hombres / Mujeres × 100'},
  pct_65:{label:'Población de 65 años o más', unit:'% de la población', f:'(65+) / Población × 100'},
  pct_0_14:{label:'Población de 0 a 14 años', unit:'% de la población', f:'(0–14) / Población × 100'},
  edad_mediana:{label:'Edad mediana', unit:'años', f:'Edad que divide la población en dos mitades (calculada por el Census Bureau con edades simples)'}
};

/* ---------- Mapa municipal ---------- */
const KX = 100 * Math.cos(18.2 * Math.PI / 180);
const rings = f => f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
function paths() {
  if (GJ._d) return GJ._d;
  let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
  for (const f of GJ.features) for (const ring of rings(f)) for (const [x, y] of ring) { l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); }
  EXT = {W:(r - l) * KX, H:(t - b) * 100, l, t};
  GJ._d = GJ.features.map(f => [f.properties.geoid, rings(f).map(rg => rg.map(([x, y], i) => (i ? 'L' : 'M') + ((x - l) * KX).toFixed(2) + ' ' + ((t - y) * 100).toFixed(2)).join('') + 'Z').join('')]);
  return GJ._d;
}
const classOf = (v, br) => { let i = 0; while (i < br.length && v > br[i]) i++; return i; };
function mapa(values, br, colors, tip, aria) {
  const P = paths(), sel = st.sel;
  const caja = sel.length && S ? S.cajaSeleccion(GJ, sel, EXT) : null;
  const vb = caja || {x:-4, y:-4, w:EXT.W + 8, h:EXT.H + 8};
  const fs = vb.w * 0.034, bot = fs * 3.2;
  const sc = S ? S.escala(vb.w) : {km:20, len:20 / (111.32 * Math.cos(18.2 * Math.PI / 180)) * KX};
  const sx = vb.x + vb.w - sc.len - fs * .3, sy = vb.y + vb.h + fs * 1.2;
  return '<svg class="cmp-map" viewBox="' + vb.x.toFixed(2) + ' ' + vb.y.toFixed(2) + ' ' + vb.w.toFixed(2) + ' ' + (vb.h + bot).toFixed(2) + '" role="img" aria-label="' + esc(aria) + '"><g class="geo">' +
    P.map(([g, d]) => {
      if (sel.length && !sel.includes(g)) return caja ? '<path d="' + d + '" class="ctx" fill="#eef1f0"><title>' + esc(D.municipios[g]?.nombre) + ' (fuera de la selección)</title></path>' : '';
      const v = values.get(g); const fill = Number.isFinite(v) ? colors[classOf(v, br)] : '#eeeeee'; return '<path d="' + d + '" fill="' + fill + '" data-geo="' + g + '" fill-rule="evenodd"><title>' + esc(tip(g, v)) + '</title></path>';
    }).join('') +
    '</g><rect x="' + vb.x.toFixed(2) + '" y="' + (vb.y + vb.h).toFixed(2) + '" width="' + vb.w.toFixed(2) + '" height="' + bot.toFixed(2) + '" fill="#ffffff"/><g class="sb"><path d="M' + sx.toFixed(2) + ' ' + sy.toFixed(2) + 'H' + (sx + sc.len).toFixed(2) + 'M' + sx.toFixed(2) + ' ' + (sy - fs * .3).toFixed(2) + 'V' + (sy + fs * .3).toFixed(2) + 'M' + (sx + sc.len).toFixed(2) + ' ' + (sy - fs * .3).toFixed(2) + 'V' + (sy + fs * .3).toFixed(2) + '" stroke="#425f62" stroke-width="' + (fs * .14).toFixed(2) + '" fill="none"/><text x="' + (sx + sc.len / 2).toFixed(2) + '" y="' + (sy + fs * 1.25).toFixed(2) + '" text-anchor="middle" style="font-size:' + (fs * .72).toFixed(2) + 'px">' + sc.km + ' km</text></g></svg>';
}
function leyenda(title, br, colors, fmt) {
  const items = colors.slice(0, br.length + 1).map((c, i) => [c, i === 0 ? 'hasta ' + fmt(br[0]) : i === br.length ? 'más de ' + fmt(br[br.length - 1]) : fmt(br[i - 1]) + ' a ' + fmt(br[i])]);
  return '<div class="lg"><strong>' + esc(title) + '</strong>' + items.map(([c, t]) => '<span><b class="swatch" style="background:' + c + '"></b>' + esc(t) + '</span>').join('') + '</div>';
}
function cuantiles(vals, k) { const s = vals.filter(Number.isFinite).sort((a, b) => a - b); const o = []; for (let i = 1; i < k; i++) { const p = (s.length - 1) * i / k, lo = Math.floor(p); o.push(+(s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo)).toPrecision(4)); } return [...new Set(o)]; }
const munis = (todos) => Object.entries(D.municipios).filter(([g]) => todos || !st.sel.length || st.sel.includes(g)).sort((a, b) => collator.compare(a[1].nombre, b[1].nombre));
const hayGrupo = () => st.sel.length >= 2;
const nombreGrupo = () => 'Selección: ' + st.selLabel;
/* Agregado de la selección: suma de los municipios (recuentos); las tasas e índices se recalculan con las sumas. */
function grupoMig() {
  const ids = st.sel, y2 = String(D.vintage); let nm = 0, h = 0, m = 0, a = 0, b = 0; const edad = Array(17).fill(0);
  for (const g of ids) { const x = D.municipios[g]; nm += x.migracion.neta; h += x.migracion.hombres; m += x.migracion.mujeres; a += x.anios['2020'].pob; b += x.anios[y2].pob; x.migracion.por_edad.forEach((v, i) => edad[i] += v); }
  return {nombre:nombreGrupo(), a:{pob:a}, b:{pob:b}, migracion:{neta:nm, hombres:h, mujeres:m, por_edad:edad, periodo:D.municipios[ids[0]].migracion.periodo, tasa_anual_por_mil:1000 * nm / ((D.vintage - 2020) * (a + b) / 2)}};
}
function sumaGrupos(list) { const t = {gh:Array(18).fill(0), gm:Array(18).fill(0), h:0, m:0, pob:0}; for (const a of list) { a.gh.forEach((v, i) => t.gh[i] += v); a.gm.forEach((v, i) => t.gm[i] += v); t.h += a.h; t.m += a.m; t.pob += a.pob; } return t; }
function indicesDe(t) { const g = t.gh.map((v, i) => v + t.gm[i]); const j = g[0] + g[1] + g[2], ad = g.slice(3, 13).reduce((p, q) => p + q, 0), my = g.slice(13).reduce((p, q) => p + q, 0); return {dep_total:100 * (j + my) / ad, dep_juvenil:100 * j / ad, dep_vejez:100 * my / ad, envejecimiento:100 * my / j, masculinidad:100 * t.h / t.m, pct_65:100 * my / t.pob, pct_0_14:100 * j / t.pob}; }

/* ---------- 1. Componentes del cambio (Puerto Rico) ---------- */
function renderComponentes() {
  const p = D.pr, v = D.validacion, n = p.anios.length;
  const i0 = 1; // periodos jul.–jun. completos (2020–21 en adelante)
  const sum = k => p[k].slice(i0).reduce((a, b) => a + b, 0);
  const cambio = p.poblacion[n - 1] - p.poblacion[0];
  $('dm-kpis').innerHTML = [
    [sg(cambio), 'cambio de población, 1 jul. 2020 – 1 jul. ' + D.vintage],
    [nf0.format(sum('nacimientos')), 'nacimientos'],
    [nf0.format(sum('defunciones')), 'defunciones'],
    [sg(sum('crecimiento_natural')), 'crecimiento natural (B − D)'],
    [sg(sum('migracion_neta')), 'migración neta']
  ].map(([a, b]) => '<div><strong>' + esc(a) + '</strong><small>' + esc(b) + '</small></div>').join('');
  // gráfica de barras por año (jul.–jun.)
  const yrs = p.anios.slice(i0), W = 640, H = 260, L = 56, B = 30, T = 14;
  const vals = yrs.flatMap((_, j) => [p.nacimientos[j + i0], -p.defunciones[j + i0], p.migracion_neta[j + i0], p.cambio[j + i0]]);
  const mx = Math.max(...vals.map(Math.abs)) * 1.08;
  const y = v => T + (H - T - B) / 2 - v / mx * (H - T - B) / 2;
  const gw = (W - L - 10) / yrs.length, bw = gw / 5;
  let g = '';
  const step = mx < 60000 ? 10000 : mx < 120000 ? 20000 : 50000;
  for (let t = -Math.floor(mx / step) * step; t < mx; t += step) g += '<line x1="' + L + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '" class="' + (t ? 'gl' : 'zl') + '"/><text x="' + (L - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end">' + (t ? sg(t / 1000) + ' mil' : '0') + '</text>';
  const pts = [];
  yrs.forEach((yy, j) => {
    const x0 = L + j * gw + bw * .6, k = j + i0;
    [[p.nacimientos[k], C.nac, 'Nacimientos'], [-p.defunciones[k], C.def, 'Defunciones'], [p.migracion_neta[k], C.mig, 'Migración neta']].forEach(([v, c, lb], q) => {
      g += '<rect x="' + (x0 + q * bw * 1.1) + '" y="' + Math.min(y(v), y(0)) + '" width="' + bw + '" height="' + Math.abs(y(v) - y(0)) + '" fill="' + c + '" rx="1.5"><title>' + esc(lb + ' ' + (yy - 1) + '–' + String(yy).slice(2) + ': ' + sg(v)) + '</title></rect>';
    });
    pts.push([x0 + bw * 1.6, y(p.cambio[k]), p.cambio[k], yy]);
    g += '<text x="' + (x0 + bw * 1.6) + '" y="' + (H - 10) + '" text-anchor="middle">' + (yy - 1) + '–' + String(yy).slice(2) + '</text>';
  });
  g += '<polyline points="' + pts.map(q => q[0] + ',' + q[1]).join(' ') + '" fill="none" stroke="' + C.tot + '" stroke-width="2"/>' + pts.map(q => '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4" fill="' + C.tot + '"><title>Cambio total ' + (q[3] - 1) + '–' + String(q[3]).slice(2) + ': ' + sg(q[2]) + '</title></circle>').join('');
  $('dm-chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dm-svg" role="img" aria-label="Componentes del cambio de población de Puerto Rico por año">' + g + '</svg>' +
    '<div class="lg"><span><b class="swatch" style="background:' + C.nac + '"></b>Nacimientos</span><span><b class="swatch" style="background:' + C.def + '"></b>Defunciones (negativo)</span><span><b class="swatch" style="background:' + C.mig + '"></b>Migración neta</span><span><b class="swatch" style="background:' + C.tot + ';border-radius:50%"></b>Cambio total</span></div>';
  const lab = (k) => k === 0 ? '1 abr. – 30 jun. 2020' : (p.anios[k] - 1) + '–' + String(p.anios[k]).slice(2);
  $('dm-table').innerHTML = '<div class="table-scroll"><table class="cmp"><thead><tr><th>Periodo (1 jul. – 30 jun.)</th><th>Población al final</th><th>Nacimientos</th><th>Defunciones</th><th>Crecimiento natural</th><th>Migración neta</th><th>Residual</th><th>Cambio total</th><th>Natalidad ‰</th><th>Mortalidad ‰</th><th>Migración neta ‰</th></tr></thead><tbody>' +
    p.anios.map((yy, k) => '<tr><td>' + lab(k) + '</td><td>' + nf0.format(p.poblacion[k]) + '</td><td>' + nf0.format(p.nacimientos[k]) + '</td><td>' + nf0.format(p.defunciones[k]) + '</td><td>' + sg(p.crecimiento_natural[k]) + '</td><td>' + sg(p.migracion_neta[k]) + '</td><td>' + sg(p.residual[k] || 0) + '</td><td>' + sg(p.cambio[k]) + '</td>' +
      ['nacimientos', 'defunciones', 'migracion_neta'].map(t => '<td>' + (p.tasas_por_mil[t][k] == null ? '—' : nf2.format(p.tasas_por_mil[t][k])) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  const cierre = p.cierre.every(x => x === 0);
  $('dm-check').innerHTML = (cierre ? '✓ La ecuación compensadora cierra en todos los periodos: cambio = (nacimientos − defunciones) + migración neta + residual.' : '⚠ La ecuación no cierra en algún periodo; revisa el residual.') +
    ' Las tasas calculadas coinciden con las publicadas por el Census Bureau (p. ej., migración neta ' + (p.anios[n - 1] - 1) + '–' + String(p.anios[n - 1]).slice(2) + ': ' + sg(p.tasas_por_mil.migracion_neta[n - 1], nf2) + ' ‰ calculada; ' + sg(p.tasas_oficiales.migracion_neta[n - 1], nf2) + ' ‰ oficial). En Puerto Rico la migración neta del PEP es migración internacional neta, que incluye los movimientos con los Estados Unidos.';
}

/* ---------- 2. Migración neta municipal ---------- */
function renderMigracion() {
  const vals = new Map(Object.entries(D.municipios).map(([g, m]) => [g, m.migracion?.tasa_anual_por_mil]));
  const br = [-10, -5, 0, 5, 10];
  $('dm-mig-map').innerHTML = mapa(vals, br, DIV, (g, v) => D.municipios[g]?.nombre + ': ' + (Number.isFinite(v) ? sg(v, nf1) + ' por 1,000 al año (' + sg(D.municipios[g].migracion.neta) + ' personas)' : 'sin dato'), 'Tasa anual de migración neta por municipio');
  $('dm-mig-legend').innerHTML = leyenda('Migración neta, ' + D.municipios['72127'].migracion.periodo + ' (por 1,000 habitantes al año)', br, DIV, x => sg(x, nf0));
  const list = munis().map(([g, m]) => ({g, ...m, a:m.anios['2020'], b:m.anios[String(D.vintage)]}));
  const key = {tasa:x => x.migracion.tasa_anual_por_mil, neta:x => x.migracion.neta, nombre:null}[st.ordenM];
  if (key) list.sort((p, q) => key(p) - key(q));
  const gr = hayGrupo() ? [{g:'SEL', ...grupoMig()}] : [];
  $('dm-mig-table').innerHTML = '<div class="table-scroll tall"><table class="cmp"><thead><tr><th>Municipio</th><th>Población 2020</th><th>Población ' + D.vintage + '</th><th>Cambio</th><th>Migración neta (5+)</th><th>Hombres</th><th>Mujeres</th><th>Tasa anual ‰</th></tr></thead><tbody>' +
    gr.concat(list).map(x => '<tr data-geo="' + x.g + '"' + (x.g === st.muni ? ' class="sel"' : '') + '><td><button type="button" class="linkish' + (x.g === 'SEL' ? ' grp' : '') + '" data-geo="' + x.g + '">' + esc(x.nombre) + '</button></td><td>' + nf0.format(x.a.pob) + '</td><td>' + nf0.format(x.b.pob) + '</td><td>' + sg(x.b.pob - x.a.pob) + '</td><td>' + sg(x.migracion.neta) + '</td><td>' + sg(x.migracion.hombres) + '</td><td>' + sg(x.migracion.mujeres) + '</td><td class="' + (x.migracion.tasa_anual_por_mil < 0 ? 'neg' : 'pos') + '">' + sg(x.migracion.tasa_anual_por_mil, nf1) + '</td></tr>').join('') + '</tbody></table></div>';
  renderPerfil();
  const v = D.validacion, c = D.supervivencia.calibracion;
  $('dm-mig-val').innerHTML = '<strong>Validación con la cifra oficial.</strong> La suma de los 78 municipios da ' + sg(v.suma_municipios_5_mas) + ' personas de 5 años o más (' + sg(v.hombres) + ' hombres, ' + sg(v.mujeres) + ' mujeres). La migración neta oficial del PEP para Puerto Rico en el mismo periodo es ' + sg(v.pep_migracion_neta_oficial) + ' para todas las edades; la estimación municipal cubre el ' + nf0.format(100 * v.suma_municipios_5_mas / v.pep_migracion_neta_oficial) + ' % (la diferencia corresponde sobre todo a migrantes menores de 5 años, que este método no capta). ' +
    '<br><strong>Calibración de la mortalidad.</strong> Con la tabla de vida de la ONU se esperarían ' + nf0.format(c.defunciones_esperadas_onu) + ' defunciones; el PEP registra ' + nf0.format(c.defunciones_pep) + ' (de ellas, unas ' + nf0.format(c.defunciones_estimadas_de_nacidos_en_el_periodo) + ' de nacidos durante el periodo). Las probabilidades de morir se ajustaron con un factor k = ' + nf2.format(c.factor_k) + ' para que coincidan.';
}
function renderPerfil() {
  const m = st.muni === 'SEL' && hayGrupo() ? grupoMig() : D.municipios[st.muni]; if (!m) return;
  $('dm-mig-muni').value = st.muni;
  const e = m.migracion.por_edad, ages = D.grupos_edad.slice(1);
  const mx = Math.max(...e.map(Math.abs), 1), W = 520, rowH = 17, L = 52, mid = L + (W - L - 10) / 2, half = (W - L - 20) / 2;
  let g = '<line x1="' + mid + '" x2="' + mid + '" y1="0" y2="' + (rowH * ages.length) + '" class="zl"/>';
  ages.forEach((a, i) => {
    const v = e[i], w = Math.abs(v) / mx * half, y = i * rowH + 2;
    const caution = i === ages.length - 1;
    g += '<text x="' + (L - 6) + '" y="' + (y + 11) + '" text-anchor="end">' + a + '</text><rect x="' + (v < 0 ? mid - w : mid) + '" y="' + y + '" width="' + Math.max(w, .5) + '" height="' + (rowH - 4) + '" fill="' + (v < 0 ? C.def : C.nac) + '"' + (caution ? ' fill-opacity=".45"' : '') + ' rx="1.5"><title>' + a + ': ' + sg(v) + (caution ? ' (interpretar con cautela)' : '') + '</title></rect>' + (() => { const out = v < 0 ? mid - w - 4 > L + 24 : mid + w + 40 < W; const x = v < 0 ? (out ? mid - w - 4 : mid - w + 4) : (out ? mid + w + 4 : mid + w - 4); const anchor = (v < 0) === out ? 'end' : 'start'; return '<text x="' + x + '" y="' + (y + 11) + '" text-anchor="' + anchor + '" class="vl"' + (out ? '' : ' style="fill:#fff"') + '>' + sg(v) + '</text>'; })();
  });
  $('dm-mig-perfil').innerHTML = '<h4>' + esc(m.nombre) + ': migración neta por edad, ' + esc(m.migracion.periodo) + '</h4><svg viewBox="0 0 ' + W + ' ' + (rowH * ages.length + 4) + '" class="dm-svg" role="img" aria-label="Migración neta por grupo de edad en ' + esc(m.nombre) + '">' + g + '</svg>' +
    '<p class="map-source">Edad al final del periodo. Salidas en marrón, entradas en verde. El grupo 85+ aparece atenuado: allí el resultado es sensible a las diferencias de mortalidad entre la tabla de vida y los estimados del Census Bureau.</p>';
  for (const tr of document.querySelectorAll('#dm-mig-table tr[data-geo]')) tr.classList.toggle('sel', tr.dataset.geo === st.muni);
}

/* ---------- 3. Estructura por edad ---------- */
function indVal(m, y, ind) { const a = m.anios[y]; return ind === 'edad_mediana' ? a.edad_mediana : a.ind[ind]; }
function renderEstructura() {
  const y = st.anio || String(D.vintage), ind = st.ind, I = INDICES[ind];
  const all = []; for (const [, m] of munis()) for (const yy of Object.keys(m.anios)) all.push(indVal(m, yy, ind));
  const br = cuantiles(all, 5); // cortes comunes a todos los años (2020–2025)
  const vals = new Map(Object.entries(D.municipios).map(([g, m]) => [g, indVal(m, y, ind)]));
  $('dm-est-map').innerHTML = mapa(vals, br, SEQ, (g, v) => D.municipios[g]?.nombre + ': ' + (Number.isFinite(v) ? nf1.format(v) : 'sin dato'), I.label + ' ' + y);
  $('dm-est-legend').innerHTML = leyenda(I.label + ', ' + y + ' (' + I.unit + ')', br, SEQ, x => nf1.format(x)) + '<p class="map-source">Fórmula: ' + esc(I.f) + '. Cortes por cuantiles calculados con los valores de 2020 a ' + D.vintage + ', para comparar años con la misma leyenda.</p>';
  const list = munis().map(([g, m]) => ({g, n:m.nombre, a:indVal(m, '2020', ind), b:indVal(m, y, ind)}));
  if (st.ordenE === 'valor') list.sort((p, q) => q.b - p.b);
  const pr = prIndice(ind, y), pr0 = prIndice(ind, '2020');
  $('dm-est-table').innerHTML = '<div class="table-scroll tall"><table class="cmp"><thead><tr><th>Municipio</th><th>2020</th><th>' + y + '</th><th>Cambio</th></tr></thead><tbody><tr class="pr"><td><strong>Puerto Rico</strong>' + (ind === 'edad_mediana' ? ' <small>(aprox., interpolada en grupos de 5 años)</small>' : '') + '</td><td>' + nf1.format(pr0) + '</td><td>' + nf1.format(pr) + '</td><td>' + sg(pr - pr0, nf1) + '</td></tr>' +
    (hayGrupo() ? (() => { const a = prIndice(ind, '2020', st.sel), b = prIndice(ind, y, st.sel); return '<tr class="selrow" data-geo="SEL"><td><button type="button" class="linkish grp" data-geo="SEL">' + esc(nombreGrupo()) + '</button>' + (ind === 'edad_mediana' ? ' <small>(aprox.)</small>' : '') + '</td><td>' + nf1.format(a) + '</td><td>' + nf1.format(b) + '</td><td>' + sg(b - a, nf1) + '</td></tr>'; })() : '') +
    list.map(x => '<tr data-geo="' + x.g + '"' + (x.g === st.muni ? ' class="sel"' : '') + '><td><button type="button" class="linkish" data-geo="' + x.g + '">' + esc(x.n) + '</button></td><td>' + nf1.format(x.a) + '</td><td>' + nf1.format(x.b) + '</td><td>' + sg(x.b - x.a, nf1) + '</td></tr>').join('') + '</tbody></table></div>';
  renderPiramide();
}
function prTot(y, ids) { return sumaGrupos((ids || Object.keys(D.municipios)).map(g => D.municipios[g].anios[y])); }
function prIndice(ind, y, ids) {
  if (ind === 'edad_mediana') { // mediana interpolada en grupos de 5 años
    const t = prTot(y, ids), g = t.gh.map((v, i) => v + t.gm[i]), half = t.pob / 2; let acc = 0;
    for (let i = 0; i < 18; i++) { if (acc + g[i] >= half) return i * 5 + 5 * (half - acc) / g[i]; acc += g[i]; }
  }
  return indicesDe(prTot(y, ids))[ind];
}
function piramideSVG(A, B, yA, yB, nombre, nota) {
  const pa = A.h + A.m, pb = B.h + B.m;
  const pct = (v, tot) => 100 * v / tot;
  const mx = Math.max(...B.gh.map(v => pct(v, pb)), ...B.gm.map(v => pct(v, pb)), ...A.gh.map(v => pct(v, pa)), ...A.gm.map(v => pct(v, pa)));
  const W = 520, rowH = 15, mid = W / 2, half = mid - 44, ages = D.grupos_edad;
  let g = '';
  ages.forEach((a, i) => {
    const yy = (ages.length - 1 - i) * rowH + 2;
    const bh = pct(B.gh[i], pb) / mx * half, bm = pct(B.gm[i], pb) / mx * half, ah = pct(A.gh[i], pa) / mx * half, am = pct(A.gm[i], pa) / mx * half;
    g += '<rect x="' + (mid - 18 - bh) + '" y="' + yy + '" width="' + bh + '" height="' + (rowH - 3) + '" fill="#3d6fb0" fill-opacity=".75"><title>Hombres ' + a + ' (' + yB + '): ' + nf1.format(pct(B.gh[i], pb)) + ' %</title></rect>' +
      '<rect x="' + (mid + 18) + '" y="' + yy + '" width="' + bm + '" height="' + (rowH - 3) + '" fill="#c0587e" fill-opacity=".75"><title>Mujeres ' + a + ' (' + yB + '): ' + nf1.format(pct(B.gm[i], pb)) + ' %</title></rect>' +
      '<rect x="' + (mid - 18 - ah) + '" y="' + yy + '" width="' + ah + '" height="' + (rowH - 3) + '" fill="none" stroke="#173239" stroke-width="1"/><rect x="' + (mid + 18) + '" y="' + yy + '" width="' + am + '" height="' + (rowH - 3) + '" fill="none" stroke="#173239" stroke-width="1"/>' +
      '<text x="' + mid + '" y="' + (yy + 10) + '" text-anchor="middle">' + a + '</text>';
  });
  return '<h4>Pirámide de población: ' + esc(nombre) + '</h4><svg viewBox="0 0 ' + W + ' ' + (rowH * ages.length + 16) + '" class="dm-svg" role="img" aria-label="Pirámide de población">' + g + '<text x="' + (mid - 24) + '" y="' + (rowH * ages.length + 13) + '" text-anchor="end">Hombres</text><text x="' + (mid + 24) + '" y="' + (rowH * ages.length + 13) + '">Mujeres</text></svg>' +
    '<p class="map-source">Barras: ' + yB + ' (% de la población total). Contorno: ' + yA + '. ' + nota + '</p>';
}
function renderPiramide() {
  const y = st.anio || String(D.vintage);
  if (st.muni === 'SEL' && hayGrupo()) { $('dm-piramide').innerHTML = piramideSVG(prTot('2020', st.sel), prTot(y, st.sel), '2020', y, nombreGrupo(), 'Suma de los municipios seleccionados. Fuente: U.S. Census Bureau, PEP V' + D.vintage + '.'); return; }
  const m = st.muni === '72' || st.muni === 'SEL' ? null : D.municipios[st.muni];
  $('dm-piramide').innerHTML = piramideSVG(m ? m.anios['2020'] : prTot('2020'), m ? m.anios[y] : prTot(y), '2020', y, m ? m.nombre : 'Puerto Rico', 'Fuente: U.S. Census Bureau, PEP V' + D.vintage + ', población por edad y sexo.');
}

/* ---------- 5. Proyección por cohortes ---------- */
const ESC = {tendencia:'Tendencia 2020–2025 (Hamilton–Perry)', sin_migracion:'Sin migración (solo nacimientos y defunciones)'};
const atipico = m => Math.abs(m.migracion?.tasa_anual_por_mil ?? 0) >= 10;
function renderProyeccion() {
  const P = D.proyeccion_pr; if (!P || !P.tendencia) { $('dm-pane-proyeccion').innerHTML = '<p class="notice">La proyección se genera con la próxima actualización.</p>'; return; }
  const base = P.base, ys = Object.keys(P.tendencia).sort(), esc0 = st.esc || 'tendencia', y = st.pa || ys.at(-1);
  const wpp = P.referencias?.onu_wpp2024?.poblacion, idb = P.referencias?.census_idb?.poblacion;
  const impl = (ref, yy) => ref && ref[base.anio] ? Math.round(base.pob * ref[yy] / ref[base.anio]) : null;
  const pctc = (a, b) => 100 * (b - a) / a;
  $('dm-pr-kpis').innerHTML = [[nf0.format(base.pob), 'población ' + base.anio + ' (PEP)']].concat(ys.flatMap(yy => [[nf0.format(P.tendencia[yy].pob), yy + ' · tendencia (' + sg(pctc(base.pob, P.tendencia[yy].pob), nf1) + ' %)'], [nf0.format(P.sin_migracion[yy].pob), yy + ' · sin migración (' + sg(pctc(base.pob, P.sin_migracion[yy].pob), nf1) + ' %)']]))
    .map(([a, b]) => '<div><strong>' + esc(a) + '</strong><small>' + esc(b) + '</small></div>').join('');
  // gráfica de líneas: serie PEP 2020–2025 y escenarios
  const serie = D.pr.anios.map((yy, k) => [yy, D.pr.poblacion[k]]);
  const lines = {pep:serie, tendencia:[[base.anio, base.pob]].concat(ys.map(yy => [+yy, P.tendencia[yy].pob])), sin:[[base.anio, base.pob]].concat(ys.map(yy => [+yy, P.sin_migracion[yy].pob]))};
  if (wpp) lines.wpp = [[base.anio, base.pob]].concat(ys.map(yy => [+yy, impl(wpp, yy)]));
  if (idb) lines.idb = [[base.anio, base.pob]].concat(ys.map(yy => [+yy, impl(idb, yy)]));
  const all = Object.values(lines).flat().map(q => q[1]); const lo = Math.min(...all) * .985, hi = Math.max(...all) * 1.005;
  const W = 640, H = 250, L = 64, R = 150, T = 12, B = 26, x0 = 2020, x1 = +ys.at(-1);
  const X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Yv = v => T + (hi - v) / (hi - lo) * (H - T - B);
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Yv(v) + '" y2="' + Yv(v) + '" class="gl"/><text x="' + (L - 6) + '" y="' + (Yv(v) + 3) + '" text-anchor="end">' + nf1.format(v / 1e6) + ' M</text>'; }
  for (let v = x0; v <= x1; v += 5) g += '<text x="' + X(v) + '" y="' + (H - 8) + '" text-anchor="middle">' + v + '</text>';
  const style = {pep:['#173239', ''], tendencia:['#b5651d', ''], sin:['#3d6fb0', '5 4'], wpp:['#7a7a7a', '2 3'], idb:['#2a9d8f', '2 3']};
  const name = {pep:'PEP (estimados oficiales)', tendencia:'Tendencia 2020–2025', sin:'Sin migración', wpp:'ONU WPP 2024 (ritmo aplicado a la base PEP)', idb:'Census Bureau IDB (ritmo aplicado a la base PEP)'};
  let ly = T + 6;
  for (const [k, pts] of Object.entries(lines)) {
    const [c, dash] = style[k];
    g += '<polyline points="' + pts.map(q => X(q[0]) + ',' + Yv(q[1])).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>' + pts.slice(k === 'pep' ? 0 : 1).map(q => '<circle cx="' + X(q[0]) + '" cy="' + Yv(q[1]) + '" r="3" fill="' + c + '"><title>' + esc(name[k] + ' ' + q[0] + ': ' + nf0.format(q[1])) + '</title></circle>').join('');
    g += '<line x1="' + (W - R + 12) + '" x2="' + (W - R + 32) + '" y1="' + ly + '" y2="' + ly + '" stroke="' + c + '" stroke-width="2"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/><text x="' + (W - R + 36) + '" y="' + (ly + 3) + '" style="font-size:9px">' + esc(name[k].replace(/ \(.*\)/, '')) + '</text>';
    ly += 15;
  }
  $('dm-pr-chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dm-svg" role="img" aria-label="Población de Puerto Rico: estimados y proyecciones">' + g + '</svg>';
  const refRows = [['Tendencia 2020–2025 (Hamilton–Perry)', ys.map(yy => P.tendencia[yy].pob)], ['Sin migración', ys.map(yy => P.sin_migracion[yy].pob)]];
  if (wpp) refRows.push(['ONU WPP 2024, ritmo aplicado a la base PEP ' + base.anio, ys.map(yy => impl(wpp, yy))], ['ONU WPP 2024, cifra publicada (otra base: ' + nf0.format(wpp[base.anio]) + ' en ' + base.anio + ')', ys.map(yy => wpp[yy])]);
  if (idb) refRows.push(['Census Bureau IDB, ritmo aplicado a la base PEP ' + base.anio, ys.map(yy => impl(idb, yy))], ['Census Bureau IDB, cifra publicada (otra base: ' + nf0.format(idb[base.anio]) + ' en ' + base.anio + ')', ys.map(yy => idb[yy])]);
  $('dm-pr-ref').innerHTML = '<div class="table-scroll"><table class="cmp"><thead><tr><th>Escenario o referencia</th>' + ys.map(yy => '<th>' + yy + '</th>').join('') + '<th>Cambio ' + base.anio + '–' + ys.at(-1) + '</th></tr></thead><tbody>' +
    refRows.map(([n, v]) => '<tr><td>' + esc(n) + '</td>' + v.map(x => '<td>' + nf0.format(x) + '</td>').join('') + '<td>' + (/publicada/.test(n) ? sg(pctc(n.includes('WPP') ? wpp[base.anio] : idb[base.anio], v.at(-1)), nf1) : sg(pctc(base.pob, v.at(-1)), nf1)) + ' %</td></tr>').join('') + '</tbody></table></div>' +
    (idb ? '' : '<p class="map-source">La comparación con la proyección del Census Bureau (International Database) se añadirá automáticamente cuando el repositorio tenga la clave gratuita CENSUS_API_KEY.</p>');
  // mapa y tabla municipal
  const vals = new Map(Object.entries(D.municipios).map(([g2, m]) => [g2, m.proy ? pctc(m.anios[String(base.anio)].pob, m.proy[esc0][y].pob) : null]));
  const br = [-12, -8, -4, 0, 4];
  const cols = ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#80cdc1', '#01665e'];
  $('dm-p-map').innerHTML = mapa(vals, br, cols, (g2, v) => D.municipios[g2].nombre + ': ' + (Number.isFinite(v) ? sg(v, nf1) + ' % entre ' + base.anio + ' y ' + y : 'sin dato'), 'Cambio proyectado de población ' + base.anio + '–' + y);
  $('dm-p-legend').innerHTML = leyenda('Cambio de población ' + base.anio + '–' + y + ', ' + ESC[esc0] + ' (%)', br, cols, x => sg(x, nf0) + ' %');
  const list = munis().map(([g2, m]) => ({g:g2, n:m.nombre, b:m.anios[String(base.anio)].pob, p:m.proy, at:atipico(m)})).sort((p, q) => pctc(p.b, p.p[esc0][y].pob) - pctc(q.b, q.p[esc0][y].pob));
  $('dm-p-table').innerHTML = '<div class="table-scroll tall"><table class="cmp"><thead><tr><th>Municipio</th><th>' + base.anio + '</th>' + ys.map(yy => '<th>' + yy + '</th>').join('') + '<th>Cambio ' + base.anio + '–' + y + '</th><th>65+ en ' + y + '</th><th>Dependencia de vejez ' + y + '</th></tr></thead><tbody>' +
    '<tr class="pr"><td><strong>Puerto Rico</strong></td><td>' + nf0.format(base.pob) + '</td>' + ys.map(yy => '<td>' + nf0.format(P[esc0][yy].pob) + '</td>').join('') + '<td>' + sg(pctc(base.pob, P[esc0][y].pob), nf1) + ' %</td><td>' + nf1.format(P[esc0][y].ind.pct_65) + ' %</td><td>' + nf1.format(P[esc0][y].ind.dep_vejez) + '</td></tr>' +
    (hayGrupo() ? (() => { const b0 = prTot(String(base.anio), st.sel).pob, z = ys.map(yy => sumaGrupos(st.sel.map(g => D.municipios[g].proy[esc0][yy]))), zy = sumaGrupos(st.sel.map(g => D.municipios[g].proy[esc0][y])), iy = indicesDe(zy); return '<tr class="selrow" data-geo="SEL"><td><button type="button" class="linkish grp" data-geo="SEL">' + esc(nombreGrupo()) + '</button></td><td>' + nf0.format(b0) + '</td>' + z.map(q => '<td>' + nf0.format(q.pob) + '</td>').join('') + '<td>' + sg(pctc(b0, zy.pob), nf1) + ' %</td><td>' + nf1.format(iy.pct_65) + ' %</td><td>' + nf1.format(iy.dep_vejez) + '</td></tr>'; })() : '') +
    list.map(x => '<tr data-geo="' + x.g + '"' + (x.g === st.muni ? ' class="sel"' : '') + '><td><button type="button" class="linkish" data-geo="' + x.g + '">' + esc(x.n) + '</button>' + (x.at ? ' <span class="flag" title="Migración 2020–2025 de ±10 por mil o más al año: la tendencia puede no repetirse">base atípica</span>' : '') + '</td><td>' + nf0.format(x.b) + '</td>' + ys.map(yy => '<td>' + nf0.format(x.p[esc0][yy].pob) + '</td>').join('') + '<td class="' + (x.p[esc0][y].pob < x.b ? 'neg' : 'pos') + '">' + sg(pctc(x.b, x.p[esc0][y].pob), nf1) + ' %</td><td>' + nf1.format(x.p[esc0][y].ind.pct_65) + ' %</td><td>' + nf1.format(x.p[esc0][y].ind.dep_vejez) + '</td></tr>').join('') + '</tbody></table></div>';
  renderPiramideP();
}
function renderPiramideP() {
  const P = D.proyeccion_pr, esc0 = st.esc || 'tendencia', y = st.pa || Object.keys(P.tendencia).sort().at(-1), b = String(P.base.anio);
  if (st.muni === 'SEL' && hayGrupo()) { $('dm-p-muni').value = 'SEL'; $('dm-p-piramide').innerHTML = piramideSVG(prTot(b, st.sel), sumaGrupos(st.sel.map(g => D.municipios[g].proy[esc0][y])), b, y + ' (proyectado)', nombreGrupo() + ' · ' + ESC[esc0], 'Suma de las proyecciones municipales; no es una cifra oficial.'); return; }
  const m = st.muni === '72' || st.muni === 'SEL' ? null : D.municipios[st.muni];
  $('dm-p-muni').value = m ? st.muni : '72';
  $('dm-p-piramide').innerHTML = piramideSVG(m ? m.anios[b] : prTot(b), m ? m.proy[esc0][y] : P[esc0][y], b, y + ' (proyectado)', (m ? m.nombre : 'Puerto Rico') + ' · ' + ESC[esc0], 'Proyección del Observatorio; no es una cifra oficial.');
  for (const tr of document.querySelectorAll('#dm-p-table tr[data-geo]')) tr.classList.toggle('sel', tr.dataset.geo === st.muni);
}

/* ---------- 4. Crecimiento ---------- */
function renderCrecimiento() {
  const vals = new Map(Object.entries(D.municipios).map(([g, m]) => [g, m.crecimiento.r_anual_pct]));
  const br = [-1.5, -1, -0.5, 0, 0.5];
  const cols = ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#80cdc1', '#01665e'];
  $('dm-cre-map').innerHTML = mapa(vals, br, cols, (g, v) => D.municipios[g].nombre + ': ' + sg(v, nf2) + ' % anual', 'Tasa de crecimiento exponencial anual');
  $('dm-cre-legend').innerHTML = leyenda('Tasa de crecimiento exponencial anual, 2020–' + D.vintage + ' (%)', br, cols, x => sg(x, nf1) + ' %');
  const t0 = prTot('2020').pob, t1 = prTot(String(D.vintage)).pob, rpr = 100 * Math.log(t1 / t0) / (D.vintage - 2020);
  const list = munis().map(([g, m]) => ({g, n:m.nombre, r:m.crecimiento.r_anual_pct, t:m.crecimiento.anios_mitad_o_doble, a:m.anios['2020'].pob, b:m.anios[String(D.vintage)].pob})).sort((p, q) => p.r - q.r);
  $('dm-cre-table').innerHTML = '<div class="table-scroll tall"><table class="cmp"><thead><tr><th>Municipio</th><th>Población 2020</th><th>Población ' + D.vintage + '</th><th>r anual (%)</th><th>Años para reducirse a la mitad o duplicarse</th></tr></thead><tbody><tr class="pr"><td><strong>Puerto Rico</strong></td><td>' + nf0.format(t0) + '</td><td>' + nf0.format(t1) + '</td><td>' + sg(rpr, nf2) + '</td><td>' + nf0.format(Math.log(2) / Math.abs(rpr / 100)) + (rpr < 0 ? ' (mitad)' : ' (doble)') + '</td></tr>' +
    (hayGrupo() ? (() => { const a = prTot('2020', st.sel).pob, b = prTot(String(D.vintage), st.sel).pob, r = 100 * Math.log(b / a) / (D.vintage - 2020); return '<tr class="selrow"><td><strong>' + esc(nombreGrupo()) + '</strong></td><td>' + nf0.format(a) + '</td><td>' + nf0.format(b) + '</td><td>' + sg(r, nf2) + '</td><td>' + (r ? nf0.format(Math.log(2) / Math.abs(r / 100)) + (r < 0 ? ' (mitad)' : ' (doble)') : '—') + '</td></tr>'; })() : '') +
    list.map(x => '<tr><td>' + esc(x.n) + '</td><td>' + nf0.format(x.a) + '</td><td>' + nf0.format(x.b) + '</td><td class="' + (x.r < 0 ? 'neg' : 'pos') + '">' + sg(x.r, nf2) + '</td><td>' + (x.t ? nf0.format(x.t) + (x.r < 0 ? ' (mitad)' : ' (doble)') : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<p class="map-source">Los años para reducirse a la mitad o duplicarse suponen que la tasa del periodo se mantiene constante; es una medida de intensidad, no una proyección.</p>';
}

/* ---------- Descargas ---------- */
async function descargar() {
  const {workbook} = await import('./xlsx.js' + qs);
  const p = D.pr, ages = D.grupos_edad.slice(1);
  const comp = [['Periodo', 'Población al 1 de julio final', 'Nacimientos', 'Defunciones', 'Crecimiento natural', 'Migración neta', 'Residual', 'Cambio total', 'Tasa de natalidad (‰)', 'Tasa de mortalidad (‰)', 'Tasa de migración neta (‰)', 'Tasa oficial de migración neta (‰)']]
    .concat(p.anios.map((y, k) => [k ? (y - 1) + '–' + y : 'abr.–jun. 2020', p.poblacion[k], p.nacimientos[k], p.defunciones[k], p.crecimiento_natural[k], p.migracion_neta[k], p.residual[k] || 0, p.cambio[k], p.tasas_por_mil.nacimientos[k] ?? '', p.tasas_por_mil.defunciones[k] ?? '', p.tasas_por_mil.migracion_neta[k] ?? '', p.tasas_oficiales.migracion_neta[k] ?? '']));
  const mig = [['GEOID', 'Municipio', 'Periodo', 'Población 2020', 'Población ' + D.vintage, 'Migración neta 5+', 'Hombres', 'Mujeres', 'Tasa anual por 1,000'].concat(ages.map(a => 'Edad ' + a))]
    .concat(munis().map(([g, m]) => [g, m.nombre, m.migracion.periodo, m.anios['2020'].pob, m.anios[String(D.vintage)].pob, m.migracion.neta, m.migracion.hombres, m.migracion.mujeres, m.migracion.tasa_anual_por_mil].concat(m.migracion.por_edad)));
  const est = [['GEOID', 'Municipio', 'Año', 'Población', 'Hombres', 'Mujeres', 'Edad mediana'].concat(Object.keys(INDICES).filter(k => k !== 'edad_mediana').map(k => INDICES[k].label))];
  for (const [g, m] of munis()) for (const [y, a] of Object.entries(m.anios)) est.push([g, m.nombre, +y, a.pob, a.h, a.m, a.edad_mediana].concat(Object.keys(INDICES).filter(k => k !== 'edad_mediana').map(k => a.ind[k])));
  const cre = [['GEOID', 'Municipio', 'Periodo', 'r anual (%)', 'Años para mitad/doble']].concat(munis().map(([g, m]) => [g, m.nombre, m.crecimiento.periodo, m.crecimiento.r_anual_pct, m.crecimiento.anios_mitad_o_doble ?? '']));
  const c = D.supervivencia.calibracion;
  const sup = [['Grupo al inicio', 'Grupo al final', 'S ONU hombres', 'S ONU mujeres', 'S ajustada hombres', 'S ajustada mujeres']]
    .concat(D.supervivencia.hombres.map((v, i) => [D.grupos_edad[i] + (i === 16 ? ' y 85+' : ''), D.grupos_edad[i + 1], D.supervivencia.onu_hombres[i], D.supervivencia.onu_mujeres[i], v, D.supervivencia.mujeres[i]]))
    .concat([[], ['Defunciones esperadas (ONU)', c.defunciones_esperadas_onu], ['Defunciones PEP', c.defunciones_pep], ['Defunciones estimadas de nacidos en el periodo', c.defunciones_estimadas_de_nacidos_en_el_periodo], ['Factor k', c.factor_k], ['Nota', c.nota]]);
  const form = [['Análisis', 'Fórmula', 'Fuente']].concat(FORMULAS.map(f => [f[0], f[1], f[2]]));
  const fu = [['Fuente', 'URL']].concat([['Componentes del cambio (PEP)', D.fuentes.componentes], ['Población por edad y sexo (PEP)', D.fuentes.edad_sexo], ['Tabla de vida de Puerto Rico (ONU, WPP 2024), años ' + D.fuentes.tabla_vida_anios.join(', '), D.fuentes.tabla_vida]]);
  const PJ = D.proyeccion_pr, pys = PJ?.tendencia ? Object.keys(PJ.tendencia).sort() : [];
  const proy = [['GEOID', 'Municipio', 'Escenario', 'Año', 'Población', 'Hombres', 'Mujeres', '% 65+', 'Dependencia de vejez'].concat(D.grupos_edad.map(a => 'H ' + a)).concat(D.grupos_edad.map(a => 'M ' + a))];
  for (const e of ['tendencia', 'sin_migracion']) for (const yy of pys) {
    proy.push(['72', 'Puerto Rico', ESC[e], +yy, PJ[e][yy].pob, PJ[e][yy].h, PJ[e][yy].m, PJ[e][yy].ind.pct_65, PJ[e][yy].ind.dep_vejez].concat(PJ[e][yy].gh, PJ[e][yy].gm));
    for (const [g, m] of munis()) if (m.proy) { const z = m.proy[e][yy]; proy.push([g, m.nombre, ESC[e], +yy, z.pob, z.h, z.m, z.ind.pct_65, z.ind.dep_vejez].concat(z.gh, z.gm)); }
  }
  const ccr = [['GEOID', 'Municipio', 'Razón niños/mujeres 15–44 (H)', 'Razón niños/mujeres 15–44 (M)'].concat(D.grupos_edad.slice(1).map(a => 'CCR H ' + a)).concat(D.grupos_edad.slice(1).map(a => 'CCR M ' + a))]
    .concat(munis().filter(([, m]) => m.proy).map(([g, m]) => [g, m.nombre, m.proy.cwr.h, m.proy.cwr.m].concat(m.proy.ccr.h, m.proy.ccr.m)));
  const blob = workbook([['Componentes PR', comp], ['Migración municipal', mig], ['Proyección', proy], ['Razones de cohorte', ccr], ['Estructura por edad', est], ['Crecimiento', cre], ['Supervivencia', sup], ['Fórmulas', form], ['Fuentes', fu]]);
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = 'Analisis_demografico_PR_V' + D.vintage + '.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}

/* ---------- Fórmulas y fuentes ---------- */
const FORMULAS = [
  ['Ecuación compensadora', 'P(t+1) − P(t) = (B − D) + M + residual', 'U.S. Census Bureau, metodología PEP V2025'],
  ['Tasas brutas por 1,000', 'Tasa = Componente / [(P(t) + P(t+1)) / 2] × 1,000', 'U.S. Census Bureau, NST-EST2025-ALLDATA (definición de tasas)'],
  ['Migración neta por supervivencia', 'M(x+5) = P(x+5, t+5) − S(x) · P(x, t);  S(x) = ₅L(x+5) / ₅L(x);  grupo abierto: S = T(85) / T(80)', 'Naciones Unidas, Manual VI (1970); Siegel y Swanson (2004)'],
  ['Calibración de la supervivencia', 'S*(x) = 1 − k · [1 − S(x)];  k = (D_PEP − D_nacidos) / D_esperadas', 'Criterio del Observatorio: hace la estimación coherente con las defunciones oficiales'],
  ['Tasa anual de migración neta', 'm = M / (t · P̄) × 1,000;  P̄ = (P_inicio + P_final) / 2', 'Siegel y Swanson (2004)'],
  ['Crecimiento exponencial', 'r = ln(P₂ / P₁) / t;  años para duplicarse o reducirse a la mitad = ln 2 / |r|', 'Preston, Heuveline y Guillot (2001)'],
  ['Proyección Hamilton–Perry', 'P(x+5, t+5) = CCR(x+5) · P(x, t);  CCR(x) = P(x, 2025) / P(x−5, 2020);  CCR(85+) = P(85+, 2025) / [P(80–84) + P(85+)](2020)', 'Hamilton y Perry (1962); Swanson, Schlottmann y Schmidt (2010)'],
  ['Nacimientos proyectados (0–4)', 'P(0–4, t+5) = [P(0–4, 2025) / M(15–44, 2025)] · M(15–44, t+5)', 'Razón niños/mujeres; Smith, Tayman y Swanson (2013)'],
  ['Escenario sin migración', 'P(x+5, t+5) = S*(x) · P(x, t), con S* calibrada y la misma razón niños/mujeres', 'Criterio del Observatorio (componentes sin migración)'],
  ['Dependencia total', '[(0–14) + (65+)] / (15–64) × 100', 'Naciones Unidas, World Population Prospects'],
  ['Dependencia juvenil y de vejez', '(0–14) / (15–64) × 100;  (65+) / (15–64) × 100', 'Naciones Unidas, World Population Prospects'],
  ['Índice de envejecimiento', '(65+) / (0–14) × 100', 'Siegel y Swanson (2004)'],
  ['Razón de masculinidad', 'Hombres / Mujeres × 100', 'Siegel y Swanson (2004)']
];


/* ---------- Exportar a PDF y JPEG ---------- */
const VENDOR = {h2c:'./vendor/html2canvas.min.js', pdf:'./vendor/jspdf.umd.min.js'};
const cargar = src => new Promise((ok, err) => {
  if (document.querySelector('script[data-src="' + src + '"]')) return ok();
  const sc = document.createElement('script'); sc.src = src + qs; sc.dataset.src = src; sc.onload = ok; sc.onerror = () => err(new Error('No se pudo cargar ' + src)); document.head.appendChild(sc);
});
const PANES = ['componentes', 'migracion', 'estructura', 'crecimiento', 'proyeccion', 'formulas'];
const tabLabel = id => document.querySelector('[data-dm="' + id + '"]')?.textContent.trim() || id;
function seleccion(pane) {
  return [...pane.querySelectorAll('.cmp-controls select, .card-head select, .dm-card .cmp-row select')].map(sl => (sl.closest('label')?.firstChild?.textContent || '').trim() + ': ' + (sl.selectedOptions[0]?.text || '')).filter(t => !t.startsWith(':')).join(' · ');
}
/* html2canvas dibuja los SVG sin la hoja de estilos: se copian los estilos calculados a cada elemento. */
function fijarEstilosSVG(root) {
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'opacity', 'font-size', 'font-family', 'font-weight'];
  for (const svg of root.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect(); svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
    for (const el of svg.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      el.setAttribute('style', props.map(k => k + ':' + cs.getPropertyValue(k)).join(';'));
    }
  }
}
function armar(ids) {
  const wrap = document.createElement('div'); wrap.className = 'dm-export';
  const fecha = new Intl.DateTimeFormat('es-PR', {dateStyle:'long'}).format(new Date());
  wrap.innerHTML = '<header class="dm-ex-head"><div><b>Observatorio Censal de Puerto Rico</b><span>Análisis demográfico · ' + esc(ids.length > 1 ? 'Informe completo' : tabLabel(ids[0])) + (st.sel.length ? ' · ' + esc(st.selLabel) : '') + '</span></div><small>Territorio 78 · ' + esc(fecha) + '</small></header>';
  for (const id of ids) {
    const pane = $('dm-pane-' + id), sel = seleccion(pane);
    const sec = document.createElement('section'); sec.className = 'dm-ex-sec' + (wrap.querySelector('.dm-ex-sec') ? ' brk' : '');
    sec.innerHTML = '<h2>' + esc(tabLabel(id)) + '</h2>' + (sel ? '<p class="dm-ex-sel">' + esc(sel) + '</p>' : '');
    const c = pane.cloneNode(true); c.hidden = false; c.removeAttribute('id');
    c.querySelectorAll('.cmp-controls, .cmp-row, button.btn, .exports').forEach(x => x.remove());
    c.querySelectorAll('button.linkish').forEach(b => b.replaceWith(document.createTextNode(b.textContent)));
    c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
    sec.append(c); wrap.append(sec);
  }
  const f = document.createElement('footer'); f.className = 'dm-ex-foot';
  f.innerHTML = 'Fuentes: U.S. Census Bureau, Population Estimates Program V' + D.vintage + ' (componentes del cambio y población por edad y sexo); Naciones Unidas, World Population Prospects 2024 (tabla de vida de Puerto Rico). Migración neta municipal y proyecciones: estimaciones del Observatorio, no cifras oficiales. Calculado el ' + esc(D.generado.slice(0, 10)) + '.';
  wrap.append(f);
  document.body.append(wrap);
  fijarEstilosSVG(wrap);
  return wrap;
}
async function capturar(ids) {
  await cargar(VENDOR.h2c);
  const wrap = armar(ids);
  try {
    const base = wrap.getBoundingClientRect().top;
    const cortes = [...wrap.querySelectorAll('.dm-ex-sec.brk, article, .dm-kpis, .notice, .dm-val, tr, .lg, .formula, .recs > div, li, footer')].map(e => [e.getBoundingClientRect().top - base, e.matches('.dm-ex-sec.brk')]);
    const canvas = await window.html2canvas(wrap, {scale:2, backgroundColor:'#ffffff', logging:false, windowWidth:1180, useCORS:true});
    return {canvas, cortes:cortes.map(([y, forzar]) => [y * 2, forzar])};
  } finally { wrap.remove(); }
}
function guardar(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
async function exportar(tipo, todo) {
  const btns = document.querySelectorAll('[data-export]'); btns.forEach(b => b.disabled = true);
  const aviso = $('dm-ex-status'); aviso.textContent = 'Preparando ' + (tipo === 'pdf' ? 'el PDF' : 'la imagen') + '…';
  try {
    const actual = PANES.find(id => !$('dm-pane-' + id).hidden) || 'componentes';
    const ids = todo ? PANES : [actual];
    const nombre = 'Analisis_demografico_PR_' + (todo ? 'informe' : actual) + (st.sel.length ? '_seleccion' + st.sel.length : '') + '_V' + D.vintage;
    const {canvas, cortes} = await capturar(ids);
    if (tipo === 'jpeg') {
      await new Promise(ok => canvas.toBlob(b => { guardar(b, nombre + '.jpg'); ok(); }, 'image/jpeg', 0.92));
    } else {
      await cargar(VENDOR.pdf);
      const {jsPDF} = window.jspdf;
      const doc = new jsPDF({unit:'pt', format:'letter', orientation:'portrait', compress:true});
      const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 32, IW = PW - 2 * M, IH = PH - 2 * M - 16;
      const k = IW / canvas.width, alto = IH / k; // píxeles del lienzo por página
      const pages = []; let y0 = 0;
      while (y0 < canvas.height - 4) {
        let y1 = Math.min(y0 + alto, canvas.height);
        if (y1 < canvas.height) {
          const forz = cortes.filter(([y, f]) => f && y > y0 + 40 && y < y1).map(([y]) => y);
          const libres = cortes.filter(([y]) => y > y0 + alto * .45 && y <= y1).map(([y]) => y);
          y1 = forz.length ? Math.min(...forz) : libres.length ? Math.max(...libres) : y1;
        }
        pages.push([y0, y1]); y0 = y1;
      }
      pages.forEach(([a, b], i) => {
        if (i) doc.addPage();
        const part = document.createElement('canvas'); part.width = canvas.width; part.height = Math.ceil(b - a);
        const cx = part.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, part.width, part.height); cx.drawImage(canvas, 0, a, canvas.width, b - a, 0, 0, canvas.width, b - a);
        doc.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', M, M, IW, (b - a) * k);
        doc.setFontSize(8); doc.setTextColor(110);
        doc.text('Observatorio Censal de Puerto Rico · Territorio 78', M, PH - 18);
        doc.text('Página ' + (i + 1) + ' de ' + pages.length, PW - M, PH - 18, {align:'right'});
      });
      doc.setProperties({title:'Análisis demográfico de Puerto Rico', subject:'Observatorio Censal de Puerto Rico', author:'Plan. David J. Rodríguez Castro, MP, PPL', creator:'Territorio 78'});
      guardar(doc.output('blob'), nombre + '.pdf');
    }
    aviso.textContent = '';
  } catch (e) { console.error(e); aviso.textContent = 'No se pudo generar el archivo: ' + e.message; }
  finally { btns.forEach(b => b.disabled = false); }
}

export async function initDemografia() {
  try { [D, GJ] = await Promise.all([getJSON('demografia.json'), getJSON('municipios.geojson')]); }
  catch (e) { $('dm-root').innerHTML = '<p class="notice">El análisis demográfico se genera con la actualización diaria; todavía no está disponible.</p>'; return; }
  $('dm-meta').textContent = 'Edición del PEP: V' + D.vintage + ' · tabla de vida ONU WPP 2024 (' + D.fuentes.tabla_vida_anios[0] + '–' + D.fuentes.tabla_vida_anios.at(-1) + ') · calculado el ' + D.generado.slice(0, 10);
  S = await import('./seleccion.js' + qs);
  const AF = await S.cargarAF(qs);
  const opts = munis(true).map(([g, m]) => '<option value="' + g + '">' + esc(m.nombre) + '</option>').join('');
  const opcionesSel = () => { const base = (hayGrupo() ? '<option value="SEL">' + esc(nombreGrupo()) + '</option>' : '') + munis().map(([g, m]) => '<option value="' + g + '">' + esc(m.nombre) + '</option>').join(''); $('dm-mig-muni').innerHTML = base; $('dm-est-muni').innerHTML = '<option value="72">Puerto Rico</option>' + base; if ($('dm-p-muni')) $('dm-p-muni').innerHTML = '<option value="72">Puerto Rico</option>' + base; };
  S.muniPicker($('dm-sel'), {munis:munis(true).map(([g, m]) => ({geoid:g, name:m.nombre})), areas:AF.areas || {}, onChange:(ids, lab) => {
    st.sel = ids; st.selLabel = lab;
    if (hayGrupo()) st.muni = 'SEL'; else if (ids.length === 1) st.muni = ids[0]; else if (st.muni === 'SEL') st.muni = '72127';
    opcionesSel(); $('dm-est-muni').value = st.muni;
    renderMigracion(); renderEstructura(); renderCrecimiento(); renderProyeccion();
  }});
  $('dm-mig-muni').innerHTML = opts;
  $('dm-est-muni').innerHTML = '<option value="72">Puerto Rico</option>' + opts;
  $('dm-est-ind').innerHTML = Object.entries(INDICES).map(([k, v]) => '<option value="' + k + '"' + (k === st.ind ? ' selected' : '') + '>' + esc(v.label) + '</option>').join('');
  const years = Object.keys(D.municipios['72127'].anios).sort();
  st.anio = years.at(-1);
  $('dm-est-anio').innerHTML = years.map(y => '<option' + (y === st.anio ? ' selected' : '') + '>' + y + '</option>').join('');
  $('dm-formulas').innerHTML = FORMULAS.map(([a, b, c]) => '<div class="formula"><h4>' + esc(a) + '</h4><code>' + esc(b) + '</code><small>' + esc(c) + '</small></div>').join('');
  const tabs = document.querySelectorAll('[data-dm]');
  for (const b of tabs) b.addEventListener('click', () => {
    for (const x of tabs) { const on = x === b; x.classList.toggle('accent', on); x.classList.toggle('neutral', !on); x.setAttribute('aria-selected', on); }
    for (const id of ['componentes', 'migracion', 'estructura', 'crecimiento', 'proyeccion', 'formulas']) $('dm-pane-' + id).hidden = b.dataset.dm !== id;
  });
  const pick = e => { const g = e.target.closest('[data-geo]')?.dataset.geo; if (g && (D.municipios[g] || g === 'SEL')) { st.muni = g; return true; } };
  $('dm-mig-map').onclick = e => { if (pick(e)) renderPerfil(); };
  $('dm-mig-table').onclick = e => { if (pick(e)) renderPerfil(); };
  $('dm-mig-muni').onchange = e => { st.muni = e.target.value; renderPerfil(); };
  $('dm-mig-orden').onchange = e => { st.ordenM = e.target.value; renderMigracion(); };
  $('dm-est-ind').onchange = e => { st.ind = e.target.value; renderEstructura(); };
  $('dm-est-anio').onchange = e => { st.anio = e.target.value; renderEstructura(); };
  $('dm-est-muni').onchange = e => { st.muni = e.target.value; renderPiramide(); };
  $('dm-est-map').onclick = e => { if (pick(e)) { $('dm-est-muni').value = st.muni; renderPiramide(); } };
  $('dm-est-table').onclick = e => { if (pick(e)) { $('dm-est-muni').value = st.muni; renderPiramide(); } };
  $('dm-dl').onclick = descargar;
  for (const b of document.querySelectorAll('[data-export]')) b.onclick = () => exportar(b.dataset.export, b.dataset.todo === '1');
  if (D.proyeccion_pr?.tendencia) {
    const pys = Object.keys(D.proyeccion_pr.tendencia).sort(); st.pa = pys.at(-1); st.esc = 'tendencia';
    $('dm-p-anio').innerHTML = pys.map(y => '<option' + (y === st.pa ? ' selected' : '') + '>' + y + '</option>').join('');
    $('dm-p-muni').innerHTML = '<option value="72">Puerto Rico</option>' + opts;
    $('dm-p-esc').onchange = e => { st.esc = e.target.value; renderProyeccion(); };
    $('dm-p-anio').onchange = e => { st.pa = e.target.value; renderProyeccion(); };
    $('dm-p-muni').onchange = e => { st.muni = e.target.value; renderPiramideP(); };
    const pk = e => { const g = e.target.closest('[data-geo]')?.dataset.geo; if (g && (D.municipios[g] || g === 'SEL')) { st.muni = g; renderPiramideP(); } };
    $('dm-p-map').onclick = pk; $('dm-p-table').onclick = pk;
  }
  $('dm-est-muni').value = st.muni;
  renderComponentes(); renderMigracion(); renderEstructura(); renderCrecimiento(); renderProyeccion();
}
