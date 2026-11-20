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
const st = {tab:'componentes', muni:'72127', ind:'dep_vejez', anio:'', ordenM:'tasa', ordenE:'valor'};
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
  EXT = {W:(r - l) * KX, H:(t - b) * 100};
  GJ._d = GJ.features.map(f => [f.properties.geoid, rings(f).map(rg => rg.map(([x, y], i) => (i ? 'L' : 'M') + ((x - l) * KX).toFixed(2) + ' ' + ((t - y) * 100).toFixed(2)).join('') + 'Z').join('')]);
  return GJ._d;
}
const classOf = (v, br) => { let i = 0; while (i < br.length && v > br[i]) i++; return i; };
function mapa(values, br, colors, tip, aria) {
  const P = paths();
  const sb = 20 / (111.32 * Math.cos(18.2 * Math.PI / 180)) * KX;
  return '<svg class="cmp-map" viewBox="-4 -4 ' + (EXT.W + 8) + ' ' + (EXT.H + 30) + '" role="img" aria-label="' + esc(aria) + '"><g class="geo">' +
    P.map(([g, d]) => { const v = values.get(g); const fill = Number.isFinite(v) ? colors[classOf(v, br)] : '#eeeeee'; return '<path d="' + d + '" fill="' + fill + '" data-geo="' + g + '" fill-rule="evenodd"><title>' + esc(tip(g, v)) + '</title></path>'; }).join('') +
    '</g><g class="sb" transform="translate(' + (EXT.W - sb - 2) + ',' + (EXT.H + 10) + ')"><path d="M0 0H' + sb.toFixed(2) + 'M0 -2V2M' + sb.toFixed(2) + ' -2V2" stroke="#425f62" stroke-width="1" fill="none"/><text x="' + (sb / 2).toFixed(2) + '" y="9" text-anchor="middle">20 km</text></g></svg>';
}
function leyenda(title, br, colors, fmt) {
  const items = colors.slice(0, br.length + 1).map((c, i) => [c, i === 0 ? 'hasta ' + fmt(br[0]) : i === br.length ? 'más de ' + fmt(br[br.length - 1]) : fmt(br[i - 1]) + ' a ' + fmt(br[i])]);
  return '<div class="lg"><strong>' + esc(title) + '</strong>' + items.map(([c, t]) => '<span><b class="swatch" style="background:' + c + '"></b>' + esc(t) + '</span>').join('') + '</div>';
}
function cuantiles(vals, k) { const s = vals.filter(Number.isFinite).sort((a, b) => a - b); const o = []; for (let i = 1; i < k; i++) { const p = (s.length - 1) * i / k, lo = Math.floor(p); o.push(+(s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo)).toPrecision(4)); } return [...new Set(o)]; }
const munis = () => Object.entries(D.municipios).sort((a, b) => collator.compare(a[1].nombre, b[1].nombre));

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
  $('dm-mig-table').innerHTML = '<div class="table-scroll tall"><table class="cmp"><thead><tr><th>Municipio</th><th>Población 2020</th><th>Población ' + D.vintage + '</th><th>Cambio</th><th>Migración neta (5+)</th><th>Hombres</th><th>Mujeres</th><th>Tasa anual ‰</th></tr></thead><tbody>' +
    list.map(x => '<tr data-geo="' + x.g + '"' + (x.g === st.muni ? ' class="sel"' : '') + '><td><button type="button" class="linkish" data-geo="' + x.g + '">' + esc(x.nombre) + '</button></td><td>' + nf0.format(x.a.pob) + '</td><td>' + nf0.format(x.b.pob) + '</td><td>' + sg(x.b.pob - x.a.pob) + '</td><td>' + sg(x.migracion.neta) + '</td><td>' + sg(x.migracion.hombres) + '</td><td>' + sg(x.migracion.mujeres) + '</td><td class="' + (x.migracion.tasa_anual_por_mil < 0 ? 'neg' : 'pos') + '">' + sg(x.migracion.tasa_anual_por_mil, nf1) + '</td></tr>').join('') + '</tbody></table></div>';
  renderPerfil();
  const v = D.validacion, c = D.supervivencia.calibracion;
  $('dm-mig-val').innerHTML = '<strong>Validación con la cifra oficial.</strong> La suma de los 78 municipios da ' + sg(v.suma_municipios_5_mas) + ' personas de 5 años o más (' + sg(v.hombres) + ' hombres, ' + sg(v.mujeres) + ' mujeres). La migración neta oficial del PEP para Puerto Rico en el mismo periodo es ' + sg(v.pep_migracion_neta_oficial) + ' para todas las edades; la estimación municipal cubre el ' + nf0.format(100 * v.suma_municipios_5_mas / v.pep_migracion_neta_oficial) + ' % (la diferencia corresponde sobre todo a migrantes menores de 5 años, que este método no capta). ' +
    '<br><strong>Calibración de la mortalidad.</strong> Con la tabla de vida de la ONU se esperarían ' + nf0.format(c.defunciones_esperadas_onu) + ' defunciones; el PEP registra ' + nf0.format(c.defunciones_pep) + ' (de ellas, unas ' + nf0.format(c.defunciones_estimadas_de_nacidos_en_el_periodo) + ' de nacidos durante el periodo). Las probabilidades de morir se ajustaron con un factor k = ' + nf2.format(c.factor_k) + ' para que coincidan.';
}
function renderPerfil() {
  const m = D.municipios[st.muni]; if (!m) return;
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
  const all = []; for (const m of Object.values(D.municipios)) for (const yy of Object.keys(m.anios)) all.push(indVal(m, yy, ind));
  const br = cuantiles(all, 5); // cortes comunes a todos los años (2020–2025)
  const vals = new Map(Object.entries(D.municipios).map(([g, m]) => [g, indVal(m, y, ind)]));
  $('dm-est-map').innerHTML = mapa(vals, br, SEQ, (g, v) => D.municipios[g]?.nombre + ': ' + (Number.isFinite(v) ? nf1.format(v) : 'sin dato'), I.label + ' ' + y);
  $('dm-est-legend').innerHTML = leyenda(I.label + ', ' + y + ' (' + I.unit + ')', br, SEQ, x => nf1.format(x)) + '<p class="map-source">Fórmula: ' + esc(I.f) + '. Cortes por cuantiles calculados con los valores de 2020 a ' + D.vintage + ', para comparar años con la misma leyenda.</p>';
  const list = munis().map(([g, m]) => ({g, n:m.nombre, a:indVal(m, '2020', ind), b:indVal(m, y, ind)}));
  if (st.ordenE === 'valor') list.sort((p, q) => q.b - p.b);
  const pr = prIndice(ind, y), pr0 = prIndice(ind, '2020');
  $('dm-est-table').innerHTML = '<div class="table-scroll tall"><table class="cmp"><thead><tr><th>Municipio</th><th>2020</th><th>' + y + '</th><th>Cambio</th></tr></thead><tbody><tr class="pr"><td><strong>Puerto Rico</strong>' + (ind === 'edad_mediana' ? ' <small>(aprox., interpolada en grupos de 5 años)</small>' : '') + '</td><td>' + nf1.format(pr0) + '</td><td>' + nf1.format(pr) + '</td><td>' + sg(pr - pr0, nf1) + '</td></tr>' +
    list.map(x => '<tr data-geo="' + x.g + '"' + (x.g === st.muni ? ' class="sel"' : '') + '><td><button type="button" class="linkish" data-geo="' + x.g + '">' + esc(x.n) + '</button></td><td>' + nf1.format(x.a) + '</td><td>' + nf1.format(x.b) + '</td><td>' + sg(x.b - x.a, nf1) + '</td></tr>').join('') + '</tbody></table></div>';
  renderPiramide();
}
function prTot(y) { const t = {gh:Array(18).fill(0), gm:Array(18).fill(0), h:0, m:0, pob:0}; for (const m of Object.values(D.municipios)) { const a = m.anios[y]; a.gh.forEach((v, i) => t.gh[i] += v); a.gm.forEach((v, i) => t.gm[i] += v); t.h += a.h; t.m += a.m; t.pob += a.pob; } return t; }
function prIndice(ind, y) {
  if (ind === 'edad_mediana') { // mediana interpolada en grupos de 5 años
    const t = prTot(y), g = t.gh.map((v, i) => v + t.gm[i]), half = t.pob / 2; let acc = 0;
    for (let i = 0; i < 18; i++) { if (acc + g[i] >= half) return i * 5 + 5 * (half - acc) / g[i]; acc += g[i]; }
  }
  const t = prTot(y), g = t.gh.map((v, i) => v + t.gm[i]);
  const j = g[0] + g[1] + g[2], ad = g.slice(3, 13).reduce((a, b) => a + b, 0), my = g.slice(13).reduce((a, b) => a + b, 0);
  return {dep_total:100 * (j + my) / ad, dep_juvenil:100 * j / ad, dep_vejez:100 * my / ad, envejecimiento:100 * my / j, masculinidad:100 * t.h / t.m, pct_65:100 * my / t.pob, pct_0_14:100 * j / t.pob}[ind];
}
function renderPiramide() {
  const m = st.muni === '72' ? null : D.municipios[st.muni];
  const y = st.anio || String(D.vintage);
  const A = m ? m.anios['2020'] : prTot('2020'), B = m ? m.anios[y] : prTot(y);
  const pa = A.h + A.m, pb = B.h + B.m;
  const pct = (v, tot) => 100 * v / tot;
  const mx = Math.max(...B.gh.map(v => pct(v, pb)), ...B.gm.map(v => pct(v, pb)), ...A.gh.map(v => pct(v, pa)), ...A.gm.map(v => pct(v, pa)));
  const W = 520, rowH = 15, mid = W / 2, half = mid - 44, ages = D.grupos_edad;
  let g = '';
  ages.forEach((a, i) => {
    const yy = (ages.length - 1 - i) * rowH + 2;
    const bh = pct(B.gh[i], pb) / mx * half, bm = pct(B.gm[i], pb) / mx * half, ah = pct(A.gh[i], pa) / mx * half, am = pct(A.gm[i], pa) / mx * half;
    g += '<rect x="' + (mid - 18 - bh) + '" y="' + yy + '" width="' + bh + '" height="' + (rowH - 3) + '" fill="#3d6fb0" fill-opacity=".75"><title>Hombres ' + a + ' (' + y + '): ' + nf1.format(pct(B.gh[i], pb)) + ' %</title></rect>' +
      '<rect x="' + (mid + 18) + '" y="' + yy + '" width="' + bm + '" height="' + (rowH - 3) + '" fill="#c0587e" fill-opacity=".75"><title>Mujeres ' + a + ' (' + y + '): ' + nf1.format(pct(B.gm[i], pb)) + ' %</title></rect>' +
      '<rect x="' + (mid - 18 - ah) + '" y="' + yy + '" width="' + ah + '" height="' + (rowH - 3) + '" fill="none" stroke="#173239" stroke-width="1"/><rect x="' + (mid + 18) + '" y="' + yy + '" width="' + am + '" height="' + (rowH - 3) + '" fill="none" stroke="#173239" stroke-width="1"/>' +
      '<text x="' + mid + '" y="' + (yy + 10) + '" text-anchor="middle">' + a + '</text>';
  });
  $('dm-piramide').innerHTML = '<h4>Pirámide de población: ' + esc(m ? m.nombre : 'Puerto Rico') + '</h4><svg viewBox="0 0 ' + W + ' ' + (rowH * ages.length + 16) + '" class="dm-svg" role="img" aria-label="Pirámide de población">' + g + '<text x="' + (mid - 24) + '" y="' + (rowH * ages.length + 13) + '" text-anchor="end">Hombres</text><text x="' + (mid + 24) + '" y="' + (rowH * ages.length + 13) + '">Mujeres</text></svg>' +
    '<p class="map-source">Barras: ' + y + ' (% de la población total). Contorno: 2020. Fuente: U.S. Census Bureau, PEP V' + D.vintage + ', población por edad y sexo.</p>';
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
  const blob = workbook([['Componentes PR', comp], ['Migración municipal', mig], ['Estructura por edad', est], ['Crecimiento', cre], ['Supervivencia', sup], ['Fórmulas', form], ['Fuentes', fu]]);
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
  ['Dependencia total', '[(0–14) + (65+)] / (15–64) × 100', 'Naciones Unidas, World Population Prospects'],
  ['Dependencia juvenil y de vejez', '(0–14) / (15–64) × 100;  (65+) / (15–64) × 100', 'Naciones Unidas, World Population Prospects'],
  ['Índice de envejecimiento', '(65+) / (0–14) × 100', 'Siegel y Swanson (2004)'],
  ['Razón de masculinidad', 'Hombres / Mujeres × 100', 'Siegel y Swanson (2004)']
];

export async function initDemografia() {
  try { [D, GJ] = await Promise.all([getJSON('demografia.json'), getJSON('municipios.geojson')]); }
  catch (e) { $('dm-root').innerHTML = '<p class="notice">El análisis demográfico se genera con la actualización diaria; todavía no está disponible.</p>'; return; }
  $('dm-meta').textContent = 'Edición del PEP: V' + D.vintage + ' · tabla de vida ONU WPP 2024 (' + D.fuentes.tabla_vida_anios[0] + '–' + D.fuentes.tabla_vida_anios.at(-1) + ') · calculado el ' + D.generado.slice(0, 10);
  const opts = munis().map(([g, m]) => '<option value="' + g + '">' + esc(m.nombre) + '</option>').join('');
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
    for (const id of ['componentes', 'migracion', 'estructura', 'crecimiento', 'formulas']) $('dm-pane-' + id).hidden = b.dataset.dm !== id;
  });
  const pick = e => { const g = e.target.closest('[data-geo]')?.dataset.geo; if (g && D.municipios[g]) { st.muni = g; return true; } };
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
  $('dm-est-muni').value = st.muni;
  renderComponentes(); renderMigracion(); renderEstructura(); renderCrecimiento();
}
