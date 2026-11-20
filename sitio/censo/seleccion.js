/* Observatorio Censal PR · Selector de varios municipios con grupos por Área Funcional (Res. JP-2014-309). */

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let AFP = null;

export function cargarAF(qs = '') {
  if (!AFP) AFP = fetch('./data/areas_funcionales.json' + qs).then(r => r.ok ? r.json() : {areas:{}}).catch(() => ({areas:{}}));
  return AFP;
}

/* Proyección equirrectangular usada en todos los mapas del Observatorio. */
export const KX = 100 * Math.cos(18.2 * Math.PI / 180);
const rings = f => f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
/* Caja (en coordenadas del mapa) de un conjunto de municipios; null = toda la isla. */
export function cajaSeleccion(muniGJ, ids, ext) {
  if (!ids || !ids.length) return null;
  const set = new Set(ids);
  let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
  for (const f of muniGJ.features) if (set.has(f.properties.geoid)) for (const ring of rings(f)) for (const [x, y] of ring) { if (x < l) l = x; if (x > r) r = x; if (y < b) b = y; if (y > t) t = y; }
  if (!Number.isFinite(l)) return null;
  const x0 = (l - ext.l) * KX, x1 = (r - ext.l) * KX, y0 = (ext.t - t) * 100, y1 = (ext.t - b) * 100;
  const w = x1 - x0, h = y1 - y0, p = Math.max(w, h) * 0.06 + 0.5;
  return {x:x0 - p, y:y0 - p, w:w + 2 * p, h:h + 2 * p};
}
/* Barra de escala: el mayor valor «redondo» que ocupe como máximo una cuarta parte del ancho. */
export function escala(vbW) {
  const unidadesPorKm = KX / (111.32 * Math.cos(18.2 * Math.PI / 180));
  const km = [1, 2, 5, 10, 20, 50].filter(k => k * unidadesPorKm <= vbW / 4).pop() || 1;
  return {km, len:km * unidadesPorKm};
}

/**
 * Crea el selector en `el`. Selección vacía = todos los municipios.
 * opts: {munis:[{geoid,name}], areas:{nombre:[geoid]}, onChange(ids, etiqueta), etiquetaTodos}
 */
export function muniPicker(el, opts) {
  const {munis, areas = {}, onChange} = opts;
  const total = munis.length;
  let sel = new Set(), nombreGrupo = '';
  el.classList.add('mp');
  el.innerHTML = '<button type="button" class="btn neutral mp-btn" aria-expanded="false" aria-haspopup="true"></button>' +
    '<div class="mp-pop" hidden role="dialog" aria-label="Elegir municipios">' +
      (Object.keys(areas).length ? '<div class="mp-af"><span>Áreas Funcionales (Res. JP-2014-309)</span><div>' + Object.keys(areas).map(a => '<button type="button" class="mp-chip" data-af="' + esc(a) + '">' + esc(a) + ' <small>' + areas[a].length + '</small></button>').join('') + '</div></div>' : '') +
      '<div class="mp-tools"><input type="search" placeholder="Buscar municipio…" aria-label="Buscar municipio"><button type="button" class="btn small neutral" data-all>Toda la isla</button><button type="button" class="btn small accent" data-ok>Aplicar</button></div>' +
      '<div class="mp-grid">' + munis.map(m => '<label data-n="' + esc(norm(m.name)) + '"><input type="checkbox" value="' + esc(m.geoid) + '"> ' + esc(m.name) + '</label>').join('') + '</div>' +
      '<p class="mp-note">Marca uno o varios municipios, o elige un Área Funcional y añade o quita municipios. Caguas forma parte de las Áreas Funcionales de San Juan y de Caguas.</p>' +
    '</div>';
  const btn = el.querySelector('.mp-btn'), pop = el.querySelector('.mp-pop'), grid = el.querySelector('.mp-grid');
  const etiqueta = () => {
    if (!sel.size || sel.size === total) return 'Todos los municipios (' + total + ')';
    if (nombreGrupo) return 'Área Funcional de ' + nombreGrupo + ' (' + sel.size + ')';
    const names = munis.filter(m => sel.has(m.geoid)).map(m => m.name);
    return names.length <= 3 ? names.join(', ') : names.slice(0, 2).join(', ') + ' y ' + (names.length - 2) + ' más';
  };
  const pintar = () => {
    for (const cb of grid.querySelectorAll('input')) cb.checked = sel.has(cb.value);
    for (const c of el.querySelectorAll('[data-af]')) c.classList.toggle('on', nombreGrupo === c.dataset.af);
    btn.innerHTML = '<span>' + esc(etiqueta()) + '</span> ▾';
  };
  const aplicar = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); onChange(ids(), etiqueta()); };
  const ids = () => (!sel.size || sel.size === total) ? [] : [...sel];
  btn.onclick = () => { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); if (!pop.hidden) pop.querySelector('input[type=search]').focus(); };
  grid.onchange = e => { const v = e.target.value; e.target.checked ? sel.add(v) : sel.delete(v); nombreGrupo = ''; pintar(); };
  el.querySelector('.mp-af')?.addEventListener('click', e => { const a = e.target.closest('[data-af]')?.dataset.af; if (!a) return; sel = new Set(areas[a]); nombreGrupo = a; pintar(); });
  el.querySelector('[data-all]').onclick = () => { sel = new Set(); nombreGrupo = ''; pintar(); };
  el.querySelector('[data-ok]').onclick = aplicar;
  el.querySelector('input[type=search]').oninput = e => { const q = norm(e.target.value.trim()); for (const l of grid.children) l.hidden = q && !l.dataset.n.includes(q); };
  document.addEventListener('click', e => { if (!pop.hidden && !el.contains(e.target)) aplicar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) aplicar(); });
  pintar();
  return {ids, etiqueta, set(list, grupo = '') { sel = new Set(list); nombreGrupo = grupo; pintar(); }};
}
