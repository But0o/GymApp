'use strict';

const KEY = 'gym.v1';
const VERSION = '1.0';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);

const EJERCICIOS = [
  'Press de banca', 'Press inclinado con barra', 'Press inclinado con mancuernas', 'Aperturas con mancuernas', 'Cruce de poleas', 'Fondos',
  'Press militar', 'Press con mancuernas sentado', 'Elevaciones laterales', 'Pájaros', 'Face pull',
  'Dominadas', 'Jalón al pecho', 'Remo con barra', 'Remo con mancuerna', 'Remo en polea baja', 'Peso muerto', 'Pullover en polea',
  'Curl de bíceps con barra', 'Curl con mancuernas', 'Curl martillo', 'Curl en banco Scott',
  'Extensión de tríceps en polea', 'Press francés', 'Extensión de tríceps sobre la cabeza',
  'Sentadilla', 'Sentadilla búlgara', 'Prensa', 'Peso muerto rumano', 'Hip thrust', 'Extensión de cuádriceps', 'Curl femoral', 'Zancadas', 'Gemelos de pie', 'Gemelos sentado',
  'Abdominales en polea', 'Elevación de piernas', 'Plancha'
];

const ex = (name, sets, reps) => ({ name, sets, reps });

function defaults() {
  return {
    routines: [
      { id: uid(), name: 'Empuje', exercises: [ex('Press de banca', 4, 8), ex('Press militar', 3, 10), ex('Press inclinado con mancuernas', 3, 10), ex('Elevaciones laterales', 3, 12), ex('Extensión de tríceps en polea', 3, 12)] },
      { id: uid(), name: 'Tirón', exercises: [ex('Dominadas', 4, 8), ex('Remo con barra', 4, 8), ex('Jalón al pecho', 3, 10), ex('Remo en polea baja', 3, 12), ex('Curl de bíceps con barra', 3, 12)] },
      { id: uid(), name: 'Piernas', exercises: [ex('Sentadilla', 4, 8), ex('Peso muerto rumano', 3, 10), ex('Prensa', 3, 12), ex('Curl femoral', 3, 12), ex('Gemelos de pie', 4, 15)] }
    ],
    sessions: [],
    active: null,
    settings: { rest: 90, unit: 'kg' }
  };
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.routines)) return Object.assign(defaults(), d);
  } catch {}
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
}

let S = load();
let tab = 'entrenar';
let sub = null; // id de rutina / sesión / nombre de ejercicio abierto

// ---------- utilidades ----------
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtNum = n => (Math.round(n * 10) / 10).toLocaleString('es-AR');
const unit = () => S.settings.unit;
const mmss = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtDate = t => new Date(t).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const e1rm = (w, r) => r <= 0 ? 0 : (r === 1 ? w : w * (1 + r / 30));
const volume = exs => exs.reduce((a, e) => a + e.sets.reduce((b, s) => b + num(s.w) * num(s.r), 0), 0);
const setCount = exs => exs.reduce((a, e) => a + e.sets.length, 0);

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// Última vez que se hizo un ejercicio (sets completados)
function lastSets(name) {
  const key = name.trim().toLowerCase();
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const e = S.sessions[i].exercises.find(x => x.name.trim().toLowerCase() === key);
    if (e && e.sets.length) return e.sets;
  }
  return null;
}
function bestOf(name) {
  const key = name.trim().toLowerCase();
  let w = 0, rm = 0;
  for (const s of S.sessions) for (const e of s.exercises) {
    if (e.name.trim().toLowerCase() !== key) continue;
    for (const x of e.sets) { w = Math.max(w, num(x.w)); rm = Math.max(rm, e1rm(num(x.w), num(x.r))); }
  }
  return { w, rm };
}

// ---------- sonido ----------
let audio;
function unlockAudio() {
  if (audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    const b = audio.createBuffer(1, 1, 22050), src = audio.createBufferSource();
    src.buffer = b; src.connect(audio.destination); src.start(0);
  } catch {}
}
function beep() {
  if (!audio) return;
  try {
    audio.resume();
    [0, .25, .5].forEach((d, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(.0001, audio.currentTime + d);
      g.gain.exponentialRampToValueAtTime(.4, audio.currentTime + d + .02);
      g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + d + .2);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + d); o.stop(audio.currentTime + d + .22);
    });
  } catch {}
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ---------- entrenamiento ----------
function startWorkout(routine) {
  const exercises = (routine ? routine.exercises : []).map(r => {
    const prev = lastSets(r.name);
    return {
      name: r.name,
      sets: Array.from({ length: r.sets || 3 }, (_, i) => {
        const p = prev && (prev[i] || prev[prev.length - 1]);
        return { w: p ? p.w : '', r: r.reps || (p ? p.r : ''), done: false };
      })
    };
  });
  S.active = { id: uid(), routine: routine ? routine.name : 'Entrenamiento libre', start: Date.now(), exercises, restEnd: null };
  save(); render();
}

function finishWorkout() {
  const a = S.active;
  const exercises = a.exercises
    .map(e => ({ name: e.name, sets: e.sets.filter(s => s.done).map(s => ({ w: num(s.w), r: num(s.r) })) }))
    .filter(e => e.sets.length);
  if (!exercises.length) {
    if (!confirm('No marcaste ninguna serie como hecha. ¿Descartar el entrenamiento?')) return;
    S.active = null; save(); render(); return;
  }
  if (!confirm('¿Terminar el entrenamiento?')) return;
  const prs = exercises.filter(e => {
    const b = bestOf(e.name);
    return e.sets.some(s => s.w > b.w && b.w > 0);
  }).map(e => e.name);
  const session = { id: a.id, routine: a.routine, start: a.start, end: Date.now(), exercises, prs };
  S.sessions.push(session);
  S.active = null;
  save();
  tab = 'historial'; sub = session.id;
  render();
  toast(prs.length ? `¡Nuevo récord en ${prs.length} ejercicio${prs.length > 1 ? 's' : ''}!` : '¡Buen entrenamiento!');
}

function startRest() {
  S.active.restEnd = Date.now() + S.settings.rest * 1000;
  S.active.restBeeped = false;
  save(); tick();
}

// ---------- vistas ----------
const TITLES = { entrenar: 'Entrenar', rutinas: 'Rutinas', historial: 'Historial', progreso: 'Progreso', ajustes: 'Ajustes' };

function cleanRoutines() {
  for (const r of S.routines) r.exercises = r.exercises.filter(e => e.name.trim());
}

function render() {
  if (!(tab === 'rutinas' && sub)) cleanRoutines();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#title').textContent = tab === 'entrenar' && S.active ? S.active.routine : TITLES[tab];
  const v = $('#view');
  v.innerHTML = ({ entrenar: viewTrain, rutinas: viewRoutines, historial: viewHistory, progreso: viewProgress, ajustes: viewSettings })[tab]();
  tick();
}

function viewTrain() {
  if (!S.active) {
    const weekAgo = Date.now() - 7 * 864e5;
    const week = S.sessions.filter(s => s.start > weekAgo);
    const last = S.sessions[S.sessions.length - 1];
    return `
      <div class="stats">
        <div class="stat"><b>${week.length}</b><span>esta semana</span></div>
        <div class="stat"><b>${S.sessions.length}</b><span>en total</span></div>
        <div class="stat"><b>${last ? Math.max(0, Math.floor((Date.now() - last.start) / 864e5)) : '–'}</b><span>días desde el último</span></div>
      </div>
      <h2>Empezar</h2>
      ${S.routines.map(r => `
        <button class="btn" data-act="start" data-id="${r.id}">${esc(r.name)}
          <small>${r.exercises.length} ejercicios · ${esc(r.exercises.map(e => e.name).slice(0, 3).join(', '))}${r.exercises.length > 3 ? '…' : ''}</small>
        </button>`).join('')}
      <button class="btn center" data-act="start">+ Entrenamiento libre</button>
      ${last ? `<h2>Último</h2><div class="card"><b>${esc(last.routine)}</b><br><small class="muted">${fmtDate(last.start)} · ${mmss((last.end - last.start) / 1000)} · ${setCount(last.exercises)} series</small></div>` : ''}
    `;
  }
  const a = S.active;
  return `
    ${a.exercises.map((e, ei) => {
      const prev = lastSets(e.name);
      return `
      <div class="card">
        <div class="row between">
          <div class="grow"><p class="ex-title">${esc(e.name)}</p></div>
          <button class="icon-btn" data-act="ex-del" data-ei="${ei}" aria-label="Quitar ejercicio">×</button>
        </div>
        <table class="sets">
          <tr><th>#</th><th>Anterior</th><th>${unit()}</th><th>Reps</th><th></th></tr>
          ${e.sets.map((s, si) => {
            const p = prev && prev[si];
            return `
            <tr class="${s.done ? 'done' : ''}">
              <td>${si + 1}</td>
              <td class="prev">${p ? `${fmtNum(p.w)}×${p.r}` : '–'}</td>
              <td><input inputmode="decimal" data-f="w" data-ei="${ei}" data-si="${si}" value="${esc(s.w)}" placeholder="${p ? fmtNum(p.w) : '0'}"></td>
              <td><input inputmode="numeric" data-f="r" data-ei="${ei}" data-si="${si}" value="${esc(s.r)}" placeholder="${p ? p.r : '0'}"></td>
              <td><button class="check" data-act="set-done" data-ei="${ei}" data-si="${si}">✓</button></td>
            </tr>`;
          }).join('')}
        </table>
        <div class="btns">
          <button class="add-set" data-act="set-add" data-ei="${ei}">+ Serie</button>
          ${e.sets.length > 1 ? `<button class="add-set" data-act="set-del" data-ei="${ei}">− Serie</button>` : ''}
        </div>
      </div>`;
    }).join('')}
    <div class="card">
      <div class="row">
        <input id="new-ex" list="ejercicios" placeholder="Agregar ejercicio…" class="grow">
        <button class="chip on" data-act="ex-add">Agregar</button>
      </div>
    </div>
    <button class="btn primary" data-act="finish">Terminar entrenamiento</button>
    <button class="btn danger" data-act="discard">Descartar</button>
  `;
}

function viewRoutines() {
  if (sub) {
    const r = S.routines.find(x => x.id === sub);
    if (!r) { sub = null; return viewRoutines(); }
    return `
      <button class="back" data-act="back">‹ Rutinas</button>
      <h2>Nombre</h2>
      <input data-rf="name" value="${esc(r.name)}">
      <h2>Ejercicios</h2>
      <div class="edit-labels"><span>Ejercicio</span><span>Series</span><span>Reps</span><span></span></div>
      ${r.exercises.map((e, i) => `
        <div class="edit-ex">
          <input list="ejercicios" data-rf="ex-name" data-i="${i}" value="${esc(e.name)}">
          <input type="number" inputmode="numeric" data-rf="ex-sets" data-i="${i}" value="${e.sets}">
          <input type="number" inputmode="numeric" data-rf="ex-reps" data-i="${i}" value="${e.reps}">
          <div class="mv">
            <button class="icon-btn" data-act="r-up" data-i="${i}" aria-label="Subir">↑</button>
            <button class="icon-btn" data-act="r-del" data-i="${i}" aria-label="Borrar">×</button>
          </div>
        </div>`).join('')}
      <button class="add-set" data-act="r-add">+ Ejercicio</button>
      <div style="height:16px"></div>
      <button class="btn primary" data-act="start" data-id="${r.id}">Empezar esta rutina</button>
      <button class="btn danger" data-act="r-remove">Borrar rutina</button>
    `;
  }
  return `
    ${S.routines.map(r => `
      <button class="btn list-item" data-act="r-open" data-id="${r.id}">
        <div class="grow"><b>${esc(r.name)}</b><small>${r.exercises.length} ejercicios</small></div><span class="chev">›</span>
      </button>`).join('') || '<p class="empty">No tenés rutinas todavía.</p>'}
    <button class="btn center" data-act="r-new">+ Nueva rutina</button>
  `;
}

function viewHistory() {
  if (sub) {
    const s = S.sessions.find(x => x.id === sub);
    if (!s) { sub = null; return viewHistory(); }
    return `
      <button class="back" data-act="back">‹ Historial</button>
      <div class="card"><b>${esc(s.routine)}</b><br><small class="muted">${new Date(s.start).toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })}</small></div>
      <div class="stats">
        <div class="stat"><b>${mmss((s.end - s.start) / 1000)}</b><span>duración</span></div>
        <div class="stat"><b>${setCount(s.exercises)}</b><span>series</span></div>
        <div class="stat"><b>${fmtNum(volume(s.exercises))}</b><span>${unit()} totales</span></div>
      </div>
      ${s.exercises.map(e => `
        <div class="card">
          <div class="row between"><b>${esc(e.name)}</b>${(s.prs || []).includes(e.name) ? '<span class="pr">RÉCORD</span>' : ''}</div>
          <small class="muted">${e.sets.map(x => `${fmtNum(x.w)} ${unit()} × ${x.r}`).join(' · ')}</small>
        </div>`).join('')}
      <button class="btn danger" data-act="s-del">Borrar entrenamiento</button>
    `;
  }
  if (!S.sessions.length) return '<p class="empty">Todavía no terminaste ningún entrenamiento.<br>Cuando termines uno aparece acá.</p>';
  return S.sessions.slice().reverse().map(s => `
    <button class="btn list-item" data-act="s-open" data-id="${s.id}">
      <div class="grow"><b>${esc(s.routine)}${s.prs && s.prs.length ? ' <span class="pr">★ RÉCORD</span>' : ''}</b>
        <small>${fmtDate(s.start)} · ${mmss((s.end - s.start) / 1000)} · ${setCount(s.exercises)} series · ${fmtNum(volume(s.exercises))} ${unit()}</small></div>
      <span class="chev">›</span>
    </button>`).join('');
}

function chart(points) {
  const W = 320, H = 160, P = 28;
  if (points.length < 2) return '<p class="muted">Hacé este ejercicio al menos dos veces para ver el gráfico.</p>';
  const ys = points.map(p => p.y), min = Math.min(...ys), max = Math.max(...ys);
  const lo = min === max ? min - 1 : min, hi = min === max ? max + 1 : max;
  const x = i => P + i * (W - P - 8) / (points.length - 1);
  const y = v => H - 18 - (v - lo) / (hi - lo) * (H - 34);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <line class="grid" x1="${P}" x2="${W}" y1="${y(hi)}" y2="${y(hi)}"/><line class="grid" x1="${P}" x2="${W}" y1="${y(lo)}" y2="${y(lo)}"/>
    <text x="0" y="${y(hi) + 4}">${fmtNum(hi)}</text><text x="0" y="${y(lo) + 4}">${fmtNum(lo)}</text>
    <polyline class="ln" points="${pts}"/>
    ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.y)}" r="3.5"/>`).join('')}
    <text x="${P}" y="${H - 2}">${fmtDate(points[0].t)}</text>
    <text x="${W}" y="${H - 2}" text-anchor="end">${fmtDate(points[points.length - 1].t)}</text>
  </svg>`;
}

function viewProgress() {
  const map = new Map();
  for (const s of S.sessions) for (const e of s.exercises) {
    const k = e.name.trim();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ t: s.start, sets: e.sets });
  }
  if (sub) {
    const hist = map.get(sub) || [];
    const b = bestOf(sub);
    return `
      <button class="back" data-act="back">‹ Progreso</button>
      <h2>${esc(sub)}</h2>
      <div class="stats">
        <div class="stat"><b>${fmtNum(b.w)}</b><span>mejor ${unit()}</span></div>
        <div class="stat"><b>${fmtNum(b.rm)}</b><span>1RM estimado</span></div>
        <div class="stat"><b>${hist.length}</b><span>veces</span></div>
      </div>
      <h2>Peso máximo por día</h2>
      <div class="card">${chart(hist.map(h => ({ t: h.t, y: Math.max(...h.sets.map(s => num(s.w))) })))}</div>
      <h2>Últimas veces</h2>
      ${hist.slice(-10).reverse().map(h => `<div class="card"><b>${fmtDate(h.t)}</b><br><small class="muted">${h.sets.map(x => `${fmtNum(x.w)}×${x.r}`).join(' · ')}</small></div>`).join('')}
    `;
  }
  if (!map.size) return '<p class="empty">Cuando registres entrenamientos vas a ver tu progreso por ejercicio acá.</p>';
  return [...map.keys()].sort((a, b) => a.localeCompare(b, 'es')).map(k => {
    const b = bestOf(k);
    return `<button class="btn list-item" data-act="p-open" data-name="${esc(k)}">
      <div class="grow"><b>${esc(k)}</b><small>Mejor: ${fmtNum(b.w)} ${unit()} · 1RM est. ${fmtNum(b.rm)} ${unit()}</small></div><span class="chev">›</span>
    </button>`;
  }).join('');
}

function viewSettings() {
  const rests = [45, 60, 90, 120, 150, 180, 240, 300];
  return `
    <h2>Descanso entre series</h2>
    <div class="row" style="flex-wrap:wrap">${rests.map(r => `<button class="chip ${S.settings.rest === r ? 'on' : ''}" data-act="set-rest" data-v="${r}">${mmss(r)}</button>`).join('')}</div>
    <h2>Unidad</h2>
    <div class="row">${['kg', 'lb'].map(u => `<button class="chip ${unit() === u ? 'on' : ''}" data-act="set-unit" data-v="${u}">${u}</button>`).join('')}</div>
    <h2>Copia de seguridad</h2>
    <p class="muted" style="margin-top:0">Todo se guarda en tu iPhone. Exportá una copia de vez en cuando por si borrás la app.</p>
    <button class="btn center" data-act="export">Exportar copia</button>
    <button class="btn center" data-act="import">Importar copia</button>
    <h2>Peligro</h2>
    <button class="btn danger" data-act="wipe">Borrar todos los datos</button>
    <p class="muted" style="text-align:center;margin-top:24px"><small>Gym v${VERSION} · funciona sin internet</small></p>
  `;
}

// ---------- eventos ----------
document.addEventListener('click', e => {
  unlockAudio();
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; sub = null; render(); scrollTo(0, 0); return; }
  const act = t.dataset.act, ei = +t.dataset.ei, si = +t.dataset.si, i = +t.dataset.i;
  const a = S.active;
  const r = S.routines.find(x => x.id === sub);

  switch (act) {
    case 'start': {
      if (a && !confirm('Ya tenés un entrenamiento en curso. ¿Reemplazarlo?')) return;
      tab = 'entrenar'; sub = null;
      startWorkout(S.routines.find(x => x.id === t.dataset.id));
      scrollTo(0, 0); return;
    }
    case 'set-done': {
      const s = a.exercises[ei].sets[si];
      s.done = !s.done;
      if (s.done) {
        if (s.w === '' && a.exercises[ei].sets[si - 1]) s.w = a.exercises[ei].sets[si - 1].w;
        startRest();
      }
      save(); render(); return;
    }
    case 'set-add': {
      const sets = a.exercises[ei].sets, last = sets[sets.length - 1];
      sets.push({ w: last ? last.w : '', r: last ? last.r : '', done: false });
      save(); render(); return;
    }
    case 'set-del': a.exercises[ei].sets.pop(); save(); render(); return;
    case 'ex-del':
      if (!confirm(`¿Quitar ${a.exercises[ei].name}?`)) return;
      a.exercises.splice(ei, 1); save(); render(); return;
    case 'ex-add': {
      const name = $('#new-ex').value.trim();
      if (!name) return;
      const prev = lastSets(name);
      a.exercises.push({ name, sets: Array.from({ length: 3 }, (_, k) => { const p = prev && (prev[k] || prev[prev.length - 1]); return { w: p ? p.w : '', r: p ? p.r : '', done: false }; }) });
      save(); render(); return;
    }
    case 'finish': finishWorkout(); return;
    case 'discard':
      if (!confirm('¿Descartar este entrenamiento? No se guarda nada.')) return;
      S.active = null; save(); render(); return;
    case 'rest-add': if (a && a.restEnd) { a.restEnd = Math.max(Date.now(), a.restEnd) + +t.dataset.v * 1000; a.restBeeped = false; save(); tick(); } return;
    case 'rest-skip': if (a) { a.restEnd = null; save(); tick(); } return;

    case 'back': sub = null; render(); return;
    case 'r-open': sub = t.dataset.id; render(); scrollTo(0, 0); return;
    case 'r-new': {
      const nr = { id: uid(), name: 'Nueva rutina', exercises: [ex('', 3, 10)] };
      S.routines.push(nr); save(); sub = nr.id; render(); return;
    }
    case 'r-add': r.exercises.push(ex('', 3, 10)); save(); render(); return;
    case 'r-del': r.exercises.splice(i, 1); save(); render(); return;
    case 'r-up': if (i > 0) { [r.exercises[i - 1], r.exercises[i]] = [r.exercises[i], r.exercises[i - 1]]; save(); render(); } return;
    case 'r-remove':
      if (!confirm(`¿Borrar la rutina "${r.name}"?`)) return;
      S.routines = S.routines.filter(x => x.id !== sub); sub = null; save(); render(); return;

    case 's-open': sub = t.dataset.id; render(); scrollTo(0, 0); return;
    case 's-del':
      if (!confirm('¿Borrar este entrenamiento del historial?')) return;
      S.sessions = S.sessions.filter(x => x.id !== sub); sub = null; save(); render(); return;
    case 'p-open': sub = t.dataset.name; render(); scrollTo(0, 0); return;

    case 'set-rest': S.settings.rest = +t.dataset.v; save(); render(); return;
    case 'set-unit': S.settings.unit = t.dataset.v; save(); render(); return;
    case 'export': exportData(); return;
    case 'import': $('#import-file').click(); return;
    case 'wipe':
      if (!confirm('Esto borra rutinas, historial y todo. ¿Seguro?')) return;
      if (!confirm('Última confirmación: ¿borrar todo?')) return;
      S = defaults(); save(); render(); toast('Datos borrados'); return;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f && S.active) {
    S.active.exercises[+t.dataset.ei].sets[+t.dataset.si][t.dataset.f] = t.value;
    save(); return;
  }
  const r = S.routines.find(x => x.id === sub);
  if (t.dataset.rf && r) {
    const i = +t.dataset.i;
    if (t.dataset.rf === 'name') r.name = t.value;
    if (t.dataset.rf === 'ex-name') r.exercises[i].name = t.value;
    if (t.dataset.rf === 'ex-sets') r.exercises[i].sets = Math.max(1, parseInt(t.value) || 1);
    if (t.dataset.rf === 'ex-reps') r.exercises[i].reps = Math.max(1, parseInt(t.value) || 1);
    save();
  }
});

// Al salir de la edición de rutina se limpian ejercicios sin nombre
document.addEventListener('change', e => {
  if (e.target.dataset.rf === 'name' && !e.target.value.trim()) {
    const r = S.routines.find(x => x.id === sub);
    if (r) { r.name = 'Rutina'; save(); render(); }
  }
});

// ---------- copia de seguridad ----------
async function exportData() {
  const data = JSON.stringify({ app: 'gym', version: 1, exported: new Date().toISOString(), routines: S.routines, sessions: S.sessions, settings: S.settings }, null, 1);
  const name = `gym-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Copia Gym' });
      return;
    }
  } catch (err) { if (err.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.routines) || !Array.isArray(d.sessions)) throw new Error();
    if (!confirm(`La copia tiene ${d.routines.length} rutinas y ${d.sessions.length} entrenamientos. Esto reemplaza lo que tenés ahora. ¿Importar?`)) return;
    S = Object.assign(defaults(), { routines: d.routines, sessions: d.sessions, settings: Object.assign(defaults().settings, d.settings), active: null });
    save(); render(); toast('Copia importada');
  } catch { alert('Ese archivo no es una copia válida de Gym.'); }
});

// ---------- reloj y descanso ----------
function tick() {
  const a = S.active;
  $('#clock').textContent = a ? mmss((Date.now() - a.start) / 1000) : '';
  const bar = $('#rest');
  const show = !!(a && a.restEnd && tab === 'entrenar');
  bar.hidden = !show;
  document.body.classList.toggle('resting', show);
  if (!show) return;
  const left = (a.restEnd - Date.now()) / 1000;
  if (left > 0) {
    bar.classList.remove('done');
    $('#rest-time').textContent = mmss(Math.ceil(left));
  } else {
    $('#rest-time').textContent = '¡Dale!';
    bar.classList.add('done');
    if (!a.restBeeped) { a.restBeeped = true; save(); beep(); }
    if (left < -8) { a.restEnd = null; save(); tick(); }
  }
}
setInterval(tick, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

$('#ejercicios').innerHTML = EJERCICIOS.map(n => `<option value="${esc(n)}">`).join('');
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
