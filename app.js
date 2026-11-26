/* Luxo — logique de l'appli
   Tout tourne dans le téléphone. Le seul fichier chargé est lessons.json,
   gardé en copie par le service worker (sw.js) pour le mode hors ligne. */
(() => {
'use strict';

/* ================= Réglages ================= */
const MAXL = 5;                         // cœurs par jour
const INT = [1, 2, 4, 7, 15];           // répétition espacée : jours avant la prochaine révision, par niveau 1→5
const LSK = 'luxo_v1';                  // clé de sauvegarde sur le téléphone (inchangée : ta progression v1 est gardée)
const RANKS = [[0, 'Touriste'], [300, 'Frontalier'], [800, 'Habitué de la ligne'], [1600, 'Voisin'], [2800, 'Copain du bistrot'], [4500, 'Presque Lëtzebuerger'], [7000, 'Lëtzebuerger d\'honneur']];
let P, G = {}, LESSONS = [], IDX = {}, REG = {};

/* ================= Outils ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => dstr(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const frDate = d => d.split('-').reverse().join('/');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const soft = s => String(s).replace(/[’`´]/g, "'").replace(/[.!?,;:¿¡«»"()]/g, ' ').replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
const loose = s => strip(soft(s).toLowerCase()).replace(/œ/g, 'oe');
const words = s => soft(s).split(' ').filter(Boolean);
const plural = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9; let p = Array.from({length: n + 1}, (_, j) => j); for (let i = 1; i <= m; i++) { const q = [i]; for (let j = 1; j <= n; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q; } return p[n]; }
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', 3400); }
const gram = k => { const g = G[k]; return !g ? null : typeof g === 'string' ? {titre: k, texte: g} : g; };

/* ================= Sauvegarde ================= */
const blank = () => ({v: 2, ts: 0, xp: 0, day: '', dayXp: 0, goalDay: '', streak: 0, best: 0, lives: MAXL, livesDay: '', done: {}, unlocked: 1, audit: false, srs: {}, errors: [], goal: 50, sound: true, onb: false, q: {}});
let S = blank();
try { const r = localStorage.getItem(LSK); if (r) S = migrate(JSON.parse(r)); } catch (e) {}
function migrate(o) { const s = Object.assign(blank(), o); if (!o.v || o.v < 2) { s.onb = s.onb || s.xp > 0; s.best = Math.max(s.best || 0, s.streak || 0); s.v = 2; } return s; }
function save() { S.ts = Date.now(); try { localStorage.setItem(LSK, JSON.stringify(S)); } catch (e) { toast('Sauvegarde impossible : pense à exporter ta progression.'); } }
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
function daily() {
  const t = today();
  if (S.livesDay !== t) { S.lives = MAXL; S.livesDay = t; }
  if (S.day !== t) { S.day = t; S.dayXp = 0; }
  if (!S.q || S.q.day !== t) S.q = {day: t, les: 0, combo: 0, claimed: false};
}

/* ================= Progression ================= */
function level(xp = S.xp) { let i = 0; while (i < RANKS.length - 1 && xp >= RANKS[i + 1][0]) i++; const cur = RANKS[i][0], nx = RANKS[i + 1] ? RANKS[i + 1][0] : null; return {n: i + 1, title: RANKS[i][1], cur, nx, p: nx ? (xp - cur) / (nx - cur) : 1}; }
function gainXp(n) {
  if (!n) return; daily(); const before = level().n;
  S.xp += n; S.dayXp += n;
  if (S.dayXp >= S.goal && S.goalDay !== today()) { S.streak = S.goalDay === addDays(-1) ? S.streak + 1 : 1; S.best = Math.max(S.best, S.streak); S.goalDay = today(); toast('Objectif du jour atteint ! Série : ' + plural(S.streak, 'jour')); }
  const after = level(); if (after.n > before) { setTimeout(() => { toast('Niveau ' + after.n + ' : ' + after.title + ' !'); confetti(); }, 400); }
}
const streakShown = () => (S.goalDay === today() || S.goalDay === addDays(-1)) ? S.streak : 0;
function srsHit(it, r, given) {
  const o = S.srs[it.key] || {b: 0, d: today(), n: 0, e: 0}; o.n++;
  if (r === 'ok') { o.b = Math.min(5, o.b + 1); o.d = addDays(INT[o.b - 1]); }
  else if (r === 'al') { o.b = Math.max(1, o.b); o.d = addDays(1); }
  else { o.b = 1; o.d = today(); o.e++; S.errors.unshift({k: it.key, d: today(), g: String(given || '').slice(0, 80)}); S.errors = S.errors.slice(0, 100); }
  S.srs[it.key] = o;
}
const dueKeys = () => Object.keys(S.srs).filter(k => IDX[k] && S.srs[k].d <= today()).sort((a, b) => S.srs[a].b - S.srs[b].b || S.srs[a].d.localeCompare(S.srs[b].d));
const locked = L => L.idx >= S.unlocked;
const curIdx = () => LESSONS.findIndex(L => !S.done[L.id] && !locked(L));
function quests() {
  daily(); const q = S.q;
  return [
    {t: 'Gagner ' + S.goal + ' XP', v: Math.min(S.dayXp, S.goal), m: S.goal, c: '#ffc21a', i: 'XP'},
    {t: 'Finir une commune ou une révision', v: Math.min(q.les, 1), m: 1, c: '#58cc02', i: '1'},
    {t: '8 bonnes réponses d\'affilée', v: Math.min(q.combo, 8), m: 8, c: '#ff8a00', i: '×8'}
  ];
}

/* ================= Le Léiw (mascotte) ================= */
function lion(mood = 'happy', cls = '') {
  let mane = '';
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; mane += '<circle cx="' + (50 + 35 * Math.cos(a)).toFixed(1) + '" cy="' + (56 + 35 * Math.sin(a)).toFixed(1) + '" r="11"/>'; }
  const D = '#3a0c12';
  const eyes = {
    happy: '<path d="M35 53q5-6 10 0M55 53q5-6 10 0" stroke="' + D + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>',
    cheer: '<path d="M34 54q6-8 12 0M54 54q6-8 12 0" stroke="' + D + '" stroke-width="3.6" fill="none" stroke-linecap="round"/>',
    sad: '<ellipse cx="40" cy="55" rx="3.6" ry="4.6" fill="' + D + '"/><ellipse cx="60" cy="55" rx="3.6" ry="4.6" fill="' + D + '"/><path d="M34 46l10 3M66 46l-10 3" stroke="' + D + '" stroke-width="2.6" stroke-linecap="round"/>',
    think: '<ellipse cx="40" cy="53" rx="3.6" ry="4.8" fill="' + D + '"/><ellipse cx="60" cy="53" rx="3.6" ry="4.8" fill="' + D + '"/><circle cx="41.5" cy="51" r="1.4" fill="#fff"/><circle cx="61.5" cy="51" r="1.4" fill="#fff"/><path d="M54 44l11-2" stroke="' + D + '" stroke-width="2.6" stroke-linecap="round"/>',
    normal: '<ellipse cx="40" cy="54" rx="3.8" ry="5" fill="' + D + '"/><ellipse cx="60" cy="54" rx="3.8" ry="5" fill="' + D + '"/><circle cx="41.5" cy="52" r="1.5" fill="#fff"/><circle cx="61.5" cy="52" r="1.5" fill="#fff"/>'
  }[mood] || '';
  const mouth = {
    happy: '<path d="M44 69q6 6 12 0" stroke="' + D + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
    cheer: '<path d="M41 67q9 15 18 0z" fill="' + D + '"/><path d="M45 72q5 5 10 0" fill="#ff6b7a"/>',
    sad: '<path d="M44 73q6-5 12 0" stroke="' + D + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
    think: '<circle cx="53" cy="71" r="2.6" fill="' + D + '"/>',
    normal: '<path d="M45 69q5 4 10 0" stroke="' + D + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>'
  }[mood] || '';
  return '<svg class="lion ' + mood + ' ' + cls + '" viewBox="0 0 100 100" aria-hidden="true"><g class="head">' +
    '<g fill="#c4182a">' + mane + '</g><circle cx="50" cy="56" r="34" fill="#c4182a"/>' +
    '<circle cx="29" cy="33" r="9" fill="#ef3340"/><circle cx="71" cy="33" r="9" fill="#ef3340"/><circle cx="29" cy="33" r="4.5" fill="#ffb0b8"/><circle cx="71" cy="33" r="4.5" fill="#ffb0b8"/>' +
    '<ellipse cx="50" cy="58" rx="26" ry="24" fill="#ef3340"/><ellipse cx="50" cy="69" rx="13" ry="10" fill="#ffe8de"/>' +
    '<circle cx="32" cy="65" r="4.5" fill="#ff8a95" opacity=".85"/><circle cx="68" cy="65" r="4.5" fill="#ff8a95" opacity=".85"/>' +
    '<path d="M33 24L36 9l8 9 6-13 6 13 8-9 3 15z" fill="#ffc21a" stroke="#d99a00" stroke-width="1.6" stroke-linejoin="round"/><circle cx="50" cy="17" r="2.3" fill="#1f8ad6"/>' +
    eyes + '<path d="M46 61h8q-4 5-4 5z" fill="#6b1420" stroke="#6b1420" stroke-width="2" stroke-linejoin="round"/>' + mouth + '</g></svg>';
}

/* Emblème de région pour les tampons */
function emblem(reg) {
  const s = 'stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const e = {
    minett: '<path d="M30 86L42 34h16l12 52M36 62h28M40 46h20" ' + s + '/><circle cx="50" cy="24" r="10" ' + s + '/><path d="M50 24l8-6" ' + s + '/>',
    stad: '<path d="M28 86V40h8v-8h8v8h12v-8h8v8h8v46z" ' + s + '/><path d="M44 86V68a6 6 0 0 1 12 0v18" ' + s + '/><path d="M50 32V16l10 4-10 4" ' + s + '/>',
    musel: '<g fill="currentColor"><circle cx="42" cy="44" r="7"/><circle cx="58" cy="44" r="7"/><circle cx="50" cy="56" r="7"/><circle cx="36" cy="58" r="6"/><circle cx="64" cy="58" r="6"/><circle cx="43" cy="70" r="6"/><circle cx="57" cy="70" r="6"/><circle cx="50" cy="82" r="5.5"/></g><path d="M50 36V20M50 26q12-10 22-4" ' + s + '/>',
    mellerdall: '<path d="M16 84l12-34 10 8 8-26 14 20 8-10 16 42z" ' + s + '/><path d="M30 70h12M56 64h10" ' + s + '/>',
    eislek: '<path d="M30 20l-16 30h10l-12 22h36l-12-22h10zM70 28l-14 26h9l-11 20h32l-11-20h9z" ' + s + '/><path d="M30 72v14M70 74v12" ' + s + '/>',
    guttland: '<path d="M50 88V30" ' + s + '/><path d="M50 34q-12-4-12-16 12 2 12 16zM50 34q12-4 12-16-12 2-12 16zM50 52q-14-4-14-16 14 2 14 16zM50 52q14-4 14-16-14 2-14 16zM50 70q-14-4-14-16 14 2 14 16zM50 70q14-4 14-16-14 2-14 16z" ' + s + '/>',
    sauer: '<path d="M22 44h56M30 44V28h10v8h20v-8h10v16M44 44V34h12v10" ' + s + '/><path d="M14 64q9-8 18 0t18 0 18 0 18 0M14 80q9-8 18 0t18 0 18 0 18 0" ' + s + '/>'
  }[reg] || '';
  return '<svg viewBox="0 0 100 100" aria-hidden="true">' + e + '</svg>';
}

/* ================= Sons et confettis ================= */
let AC;
function sfx(k) {
  if (!S.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const t = AC.currentTime + .01;
    const N = {ok: [[660, 0], [990, .08]], ko: [[200, 0], [150, .13]], end: [[523, 0], [659, .1], [784, .2], [1046, .32]], tap: [[520, 0]], new: [[440, 0], [660, .07]]}[k] || [];
    N.forEach(([f, d]) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = k === 'ko' ? 'sawtooth' : 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(k === 'ko' ? .05 : k === 'tap' ? .04 : .13, t + d + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d + (k === 'end' ? .35 : .2)); o.connect(g); g.connect(AC.destination); o.start(t + d); o.stop(t + d + .4); });
  } catch (e) {}
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('confetti'), x = c.getContext('2d'), R = devicePixelRatio || 1, W = c.width = innerWidth * R, H = c.height = innerHeight * R;
  const cols = ['#ef3340', '#1f8ad6', '#ffc21a', '#58cc02', '#ffffff', '#8a45b8'];
  const ps = Array.from({length: 150}, () => ({x: W / 2 + (Math.random() - .5) * W * .4, y: H * .38, vx: (Math.random() - .5) * 18 * R, vy: (-Math.random() * 20 - 6) * R, r: (4 + Math.random() * 5) * R, c: cols[Math.random() * cols.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .35}));
  let f = 0;
  (function step() { x.clearRect(0, 0, W, H); ps.forEach(p => { p.vy += .55 * R; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.strokeStyle = 'rgba(0,0,0,.12)'; x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.strokeRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore(); }); if (++f < 160) requestAnimationFrame(step); else x.clearRect(0, 0, W, H); })();
}

/* ================= Génération des exercices ================= */
const lvlOf = it => (S.srs[it.key] || {}).b || 0;
function opts(it) {
  let pool = it.lecon.items.filter(x => x !== it && x.t === it.t && x.lu !== it.lu);
  if (pool.length < 3) pool = pool.concat(Object.values(IDX).filter(x => x.t === it.t && x.lecon !== it.lecon));
  return shuffle([it.lu].concat(shuffle(pool).slice(0, 3).map(x => x.lu)));
}
const gapOf = it => { const w = words(it.lu); return it.gap && w.includes(it.gap) ? it.gap : w.slice().sort((a, b) => b.length - a.length)[0]; };
function mk(type, it) {
  const w = words(it.lu), L = lvlOf(it);
  if (type === 'trad' && L < 2) type = it.t === 's' ? 'ordre' : 'qcm';   // débutant : banque de mots plutôt que saisie libre
  if (type === 'ordre' && (it.t !== 's' || w.length < 3 || w.length > 9)) type = 'qcm';
  if (type === 'trou' && (it.t !== 's' || w.length < 2)) type = L < 2 ? 'qcm' : 'trad';
  const e = {type, item: it};
  if (type === 'qcm') e.opts = opts(it);
  if (type === 'trou') {
    e.gap = gapOf(it);
    if (L < 2) { const others = shuffle(Object.values(IDX).filter(x => x.t === 's' && x !== it).flatMap(x => words(x.lu))).filter(x => x !== e.gap && x.length > 1); e.choices = shuffle([e.gap].concat([...new Set(others)].slice(0, 3))); }
  }
  if (type === 'ordre') {
    const extra = [...new Set(shuffle(Object.values(IDX).filter(x => x.t === 's' && x !== it).flatMap(x => words(x.lu))).filter(x => !w.includes(x)))].slice(0, w.length > 5 ? 2 : 3);
    e.tokens = shuffle(w.concat(extra)); e.placed = [];
  }
  return e;
}
function withIntros(ex) {
  const seen = new Set(), out = [];
  for (const e of ex) {
    const its = e.type === 'pairs' ? e.items : [e.item];
    const fresh = its.filter(it => !S.srs[it.key] && !seen.has(it.key));
    if (fresh.length) { fresh.forEach(it => seen.add(it.key)); out.push({type: 'intro', items: fresh}); }
    out.push(e);
  }
  return out;
}
function buildLesson(L) {
  const ws = L.items.filter(i => i.t === 'w'), ss = L.items.filter(i => i.t !== 'w'), ex = []; let rest = ws;
  if (ws.length >= 4) { const pick = shuffle(ws).slice(0, 4); ex.push({type: 'pairs', items: pick}); rest = ws.filter(x => !pick.includes(x)); }
  const seq = ['trad', 'qcm', 'ordre', 'trou'];
  ss.forEach((it, k) => ex.push(mk(k % 5 === 4 ? 'inv' : seq[k % 4], it)));
  shuffle(rest).forEach((it, k) => ex.push(mk(['qcm', 'trad', 'inv'][k % 3], it)));
  const first = ex.shift(); return withIntros([first].concat(shuffle(ex)).slice(0, 15));
}
const mixTypes = ['trad', 'qcm', 'inv', 'trou', 'ordre'];
const buildRev = () => dueKeys().slice(0, 15).map((k, i) => mk(mixTypes[i % 5], IDX[k]));
function buildWeak() {
  const cnt = {}; S.errors.forEach(e => { if (IDX[e.k]) cnt[e.k] = (cnt[e.k] || 0) + 1; });
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 10).map((k, i) => mk(mixTypes[i % 5], IDX[k]));
}
const buildFree = () => shuffle(Object.keys(S.srs).filter(k => IDX[k])).slice(0, 10).map((k, i) => mk(mixTypes[(i + 2) % 5], IDX[k]));
const buildAudit = () => LESSONS.map(L => { const ss = L.items.filter(i => i.t === 's'); const it = ss[1 + Math.floor(Math.random() * (ss.length - 1))] || ss[0]; return {type: 'qcm', item: it, opts: opts(it)}; });

/* ================= Correction ================= */
function grade(ans, targets) {
  if (!soft(ans)) return null;
  if (targets.some(t => soft(t) === soft(ans))) return 'ok';
  if (targets.some(t => loose(t) === loose(ans))) return 'al';
  return 'ko';
}
function gradeFr(ans, it) {
  if (!soft(ans)) return null;
  const ts = [it.fr].concat(it.afr || []).map(loose), a = loose(ans);
  if (ts.includes(a)) return 'ok'; if (ts.some(t => lev(t, a) <= 2)) return 'al'; return 'ko';
}
function eifelSlip(ans, target) {
  const a = words(ans.toLowerCase()), t = words(target.toLowerCase());
  for (let i = 0; i < Math.min(a.length, t.length); i++) if (a[i] !== t[i] && (a[i] + 'n' === t[i] || t[i] + 'n' === a[i])) return true;
  return false;
}
function why(e) {
  const it = e.item, out = [];
  if (e.type === 'pairs') { const g = gram([...new Set(e.items.map(x => x.g).filter(Boolean))][0]); if (g) out.push('<b>' + esc(g.titre) + '.</b> ' + esc(g.texte)); return out; }
  const target = e.type === 'trou' ? e.gap : it.lu;
  if (e.result === 'al' && e.type !== 'inv') out.push('Presque : vérifie les majuscules, les accents (ë, é, ä) et les espaces.');
  if (e.result !== 'ok' && e.given && e.type !== 'inv' && eifelSlip(e.given, target) && it.g !== 'eifel') { const g = gram('eifel'); out.push('<b>' + esc(g.titre) + '.</b> ' + esc(g.texte)); }
  if (it.n) out.push(esc(it.n));
  const g = gram(it.g); if (g) out.push('<b>' + esc(g.titre) + '.</b> ' + esc(g.texte));
  if (it.v) out.push('<span style="opacity:.7">Forme marquée « à vérifier » sur lod.lu.</span>');
  return out;
}

/* ================= Carte du Luxembourg ================= */
const BORDER = '73.3,15.4 83.5,19 91.3,25 94.2,31 95.1,52 102.9,70 110.6,88 122.2,106 131.9,118 145.5,124 159,127 168.7,130 168.7,142 164.8,154 151.3,169 145.5,187 139.6,205 137.7,229 122.2,223 114.5,217 99,220 87.4,232 73.9,235 62.2,232 48.7,223 37.1,211 31.3,205 42.9,190 46.8,178 42.9,160 31.3,151 19.7,133 17.7,118 21.6,109 17.7,100 25.5,82 35.2,67 42.9,52 48.7,37 62.2,19';
const RIVERS = ['166,133 162,150 150,166 144,184 138,204 136,228', '62,222 76,204 88,186 94,168 90,148 84,124 78,110', '24,100 52,106 78,110 100,102 126,110 146,124 166,131', '104,98 108,86 112,78'];
const REGIONS = {
  eislek: '0,0 200,0 200,96 118,96 96,110 60,113 0,114',
  mellerdall: '118,96 200,96 200,136 156,136 132,132 108,118 96,110',
  musel: '156,136 200,136 200,260 124,260 126,236 130,212 140,186 148,160',
  minett: '0,180 40,184 66,196 92,200 108,196 122,198 128,214 124,236 124,260 0,260',
  stad: '0,114 60,113 96,110 108,118 132,132 156,136 148,160 140,186 130,212 128,214 122,198 108,196 92,200 66,196 40,184 0,180',
  guttland: '0,114 60,113 96,110 108,118 132,132 156,136 152,147 0,147'
};
const RNAMES = [['eislek', 'ÉISLEK', 62, 62, 0], ['mellerdall', 'MËLLERDALL', 134, 108, -8], ['musel', 'MUSEL', 157, 196, -72], ['minett', 'MINETT', 64, 234, 0], ['stad', "D'STAD", 96, 170, 0], ['guttland', 'GUTTLAND', 66, 124, 0]];
function mapLabels(ci) {
  const nodes = LESSONS.map(L => ({x: L.carte[0], y: L.carte[1]})), boxes = [], out = [];
  const hit = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  nodes.forEach(n => boxes.push({x1: n.x - 8.5, x2: n.x + 8.5, y1: n.y - 8.5, y2: n.y + 10}));
  const order = LESSONS.map((L, i) => i).filter(i => i === ci || S.done[LESSONS[i].id]).sort((a, b) => (b === ci) - (a === ci));
  order.forEach(i => {
    const L = LESSONS[i], {x, y} = nodes[i], wd = L.commune.length * (i === ci ? 4.3 : 3.8) + 2;
    const c = [
      {a: 'middle', tx: x, ty: y + 17, b: {x1: x - wd / 2, x2: x + wd / 2, y1: y + 11, y2: y + 18}},
      {a: 'start', tx: x + 10, ty: y + 2.2, b: {x1: x + 9.5, x2: x + 9.5 + wd, y1: y - 3.5, y2: y + 3.5}},
      {a: 'end', tx: x - 10, ty: y + 2.2, b: {x1: x - 9.5 - wd, x2: x - 9.5, y1: y - 3.5, y2: y + 3.5}},
      {a: 'middle', tx: x, ty: y - 11, b: {x1: x - wd / 2, x2: x + wd / 2, y1: y - 17, y2: y - 10}}
    ];
    const pick = c.find(o => o.b.x1 > 6 && o.b.x2 < 180 && o.b.y2 < 252 && !boxes.some((bb, j) => j !== i && hit(o.b, bb))) || (i === ci ? c[0] : null);
    if (pick) { boxes.push(pick.b); out[i] = pick; }   // pas de place : le nom reste dans la liste sous la carte
  });
  return out;
}
function mapSvg() {
  const ci = curIdx(), labels = mapLabels(ci);
  let route = '';
  for (let i = 1; i < LESSONS.length; i++) {
    if (LESSONS[i].unite !== LESSONS[i - 1].unite) continue;   // un tracé par région, sans traverser la carte
    const a = LESSONS[i - 1].carte, b = LESSONS[i].carte, done = S.done[LESSONS[i - 1].id] && (S.done[LESSONS[i].id] || i === ci);
    route += '<line class="route' + (done ? ' done' : '') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
  }
  const regs = Object.entries(REGIONS).map(([k, p]) => '<polygon points="' + p + '" fill="' + REG[k] + '" opacity=".2"/><polygon points="' + p + '" fill="url(#tx-' + k + ')"/>').join('');
  const names = RNAMES.map(([k, t, x, y, r]) => '<text class="rname" fill="' + REG[k] + '" x="' + x + '" y="' + y + '"' + (r ? ' transform="rotate(' + r + ' ' + x + ' ' + y + ')"' : '') + '>' + t + '</text>').join('');
  const pat = (id, body, col, sz) => '<pattern id="tx-' + id + '" width="' + sz + '" height="' + sz + '" patternUnits="userSpaceOnUse">' + body.replace(/C/g, col) + '</pattern>';
  const defs = '<defs><clipPath id="lux"><polygon points="' + BORDER + '"/></clipPath>' +
    pat('minett', '<path d="M0 8L8 0" stroke="C" stroke-width="1" opacity=".5"/>', REG.minett, 8) +
    pat('musel', '<circle cx="3" cy="3" r="1.1" fill="C" opacity=".55"/><circle cx="7" cy="3" r="1.1" fill="C" opacity=".55"/>', REG.musel, 10) +
    pat('eislek', '<path d="M6 2l3 6H3z" fill="C" opacity=".45"/>', REG.eislek, 12) +
    pat('mellerdall', '<path d="M2 9l3-4 2 2 3-4 2 6z" fill="C" opacity=".35"/>', REG.mellerdall, 14) +
    pat('stad', '<circle cx="5" cy="5" r=".7" fill="C" opacity=".4"/>', REG.stad, 10) +
    pat('guttland', '<path d="M2 8q2-4 4 0M8 4q2-4 4 0" stroke="C" stroke-width=".8" fill="none" opacity=".5"/>', REG.guttland, 12) + '</defs>';
  const soon = (P.communes_a_venir || []).map(c => '<g class="soon"><circle cx="' + c.carte[0] + '" cy="' + c.carte[1] + '" r="5"/><text x="' + c.carte[0] + '" y="' + (c.carte[1] + 11) + '">' + esc(c.commune) + '</text></g>').join('');
  const nodes = LESSONS.map((L, i) => {
    const [x, y] = L.carte, d = S.done[L.id], lk = locked(L), cur = i === ci;
    const cls = d ? 'done' : cur ? 'cur' : lk ? 'lock' : 'open';
    return '<g class="c ' + cls + '" data-les="' + esc(L.id) + '" role="button" tabindex="0" aria-label="' + esc(L.commune + ', ' + L.theme) + '">' +
      (cur ? '<circle class="pulse" cx="' + x + '" cy="' + (y + 1) + '" r="10"/>' : '') +
      '<circle class="base" cx="' + x + '" cy="' + (y + 2.2) + '" r="7.6"' + (d ? ' style="fill:' + REG[L.unite.id] + ';filter:brightness(.75)"' : '') + '/>' +
      '<circle class="top" cx="' + x + '" cy="' + y + '" r="7.6"' + (d ? ' style="fill:' + REG[L.unite.id] + '"' : '') + '/>' +
      '<text class="ic" x="' + x + '" y="' + (y + .3) + '">' + (d ? '★' : i + 1) + '</text></g>';
  }).join('');
  // Noms affichés seulement pour les communes faites et la commune en cours (carte lisible), au-dessus des bulles.
  const names2 = LESSONS.map((L, i) => { const lb = labels[i]; if (!lb) return ''; return '<text class="lb' + (i === ci ? ' curlb' : '') + '" style="text-anchor:' + lb.a + '" x="' + lb.tx.toFixed(1) + '" y="' + lb.ty.toFixed(1) + '">' + esc(L.commune) + '</text>'; }).join('');
  return '<svg class="map" viewBox="4 6 178 248" role="img" aria-label="Carte du Luxembourg : tes communes">' + defs +
    '<polygon class="land" points="' + BORDER + '"/><g clip-path="url(#lux)">' + regs + names + '</g>' +
    '<polygon points="' + BORDER + '" fill="none" stroke="var(--landb)" stroke-width="1.6" stroke-linejoin="round"/>' +
    RIVERS.map(r => '<polyline class="river" points="' + r + '"/>').join('') + route + soon + nodes + '<g class="labels">' + names2 + '</g></svg>';
}

/* ================= Navigation ================= */
let tab = 'carte', guideTab = 'sons', view = 'tab', sess = null;
const app = $('app');
function stats() {
  daily(); $('sStreak').textContent = streakShown(); $('sXp').textContent = S.xp; $('sLives').textContent = S.lives;
  $('lvlBadge').textContent = level().n; $('dueDot').hidden = !dueKeys().length;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab && view === 'tab'));
}
function go(t) {
  if (t) tab = t; view = 'tab'; sess = null; document.body.classList.remove('focus'); closeSheet();
  ({carte: renderCarte, reviser: renderReviser, pass: renderPass, guide: renderGuide})[tab]();
  stats(); window.scrollTo(0, 0);
}

/* ---------- Carte ---------- */
function leiwSays() {
  const ci = curIdx(), cur = LESSONS[ci], due = dueKeys().length;
  if (!S.xp) return ['Moien ! Ech sinn de Léiw.', 'Je suis ton guide. On commence par ' + (cur ? cur.commune : 'la première commune') + ' : « Moien » veut dire bonjour !'];
  if (S.dayXp >= S.goal) return ['Gutt gemaach !', 'Objectif du jour atteint. Une commune de plus pour la route ?'];
  if (due >= 5) return [plural(due, 'mot') + ' à réviser', 'Revois-les maintenant, juste avant de les oublier : c\'est là que ça s\'ancre.'];
  if (streakShown() >= 2) return ['Série de ' + streakShown() + ' jours !', 'Continue comme ça. Prochain arrêt : ' + (cur ? cur.commune : 'les révisions') + '.'];
  return ['Moien !', cur ? 'Prochain arrêt : ' + cur.commune + ' · ' + cur.theme + '.' : 'Toutes les communes sont faites. Place aux révisions !'];
}
function renderCarte() {
  const ci = curIdx(), cur = LESSONS[ci], [h, sub] = leiwSays(), qs = quests(), allq = qs.every(q => q.v >= q.m);
  const regions = P.unites.map(u => {
    const n = u.lecons.length, nd = u.lecons.filter(L => S.done[L.id]).length;
    return '<section class="region" style="--rc:' + u.couleur + '"><div class="rhead"><span class="lv">' + esc(u.niveau) + '</span><h2>' + esc(u.nom) + '</h2><p>' + esc(u.sous_titre) + '</p><span class="rp">' + nd + '/' + n + '</span></div><div class="rlist">' +
      u.lecons.map(L => { const d = S.done[L.id], lk = locked(L), c = L.idx === ci; const cls = d ? 'done' : c ? 'cur' : lk ? 'lock' : 'open';
        return '<button class="' + cls + '" data-les="' + esc(L.id) + '"><span class="dot">' + (d ? '★' : L.idx + 1) + '</span><span class="tx"><b>' + esc(L.commune) + '</b><small>' + esc(L.theme) + '</small></span><span class="sc">' + (d ? (d.audit ? 'test' : d.score + '%') : lk ? '' : c ? 'GO' : '') + '</span></button>'; }).join('') + '</div></section>';
  }).join('');
  app.innerHTML = '<div class="wrap">' +
    '<div class="leiw">' + lion(S.dayXp >= S.goal ? 'cheer' : 'happy') + '<div class="bubble">' + esc(h) + '<small>' + esc(sub) + '</small></div></div>' +
    (cur ? '<button class="btn green w" data-les="' + esc(cur.id) + '" data-direct="1">' + (S.xp ? 'Continuer' : 'Commencer') + ' · ' + esc(cur.commune) + '</button>' : '') +
    '<section class="panel"><h3>Quêtes du jour <button class="chest" data-chest ' + (allq && !S.q.claimed ? '' : 'disabled') + '>' + (S.q.claimed ? 'Coffre ouvert' : 'Coffre +30 XP') + '</button></h3>' +
    qs.map(q => '<div class="qrow' + (q.v >= q.m ? ' done' : '') + '"><span class="ic" style="background:' + q.c + '">' + q.i + '</span><span class="tx"><b>' + esc(q.t) + '</b><div class="pbar"><i style="width:' + Math.round(q.v / q.m * 100) + '%"></i></div></span><small class="mut" style="font-weight:800">' + q.v + '/' + q.m + '</small></div>').join('') + '</section>' +
    '<section class="mapcard"><div class="maphead"><span>Ton Luxembourg</span><span>' + LESSONS.filter(L => S.done[L.id]).length + '/' + LESSONS.length + '</span></div>' + mapSvg() + '</section>' +
    regions +
    '<div class="soonreg">Bientôt : le niveau B1 (donner son avis, raconter, négocier, la vie au Luxembourg). Le Léiw prépare la suite.</div>' +
    '<p class="foot">Luxo <span id="ver"></span> · fonctionne hors ligne</p></div>';
  askVersion();
}

/* ---------- Réviser ---------- */
function renderReviser() {
  const due = dueKeys().length, seen = Object.keys(S.srs).filter(k => IDX[k]), box = [0, 0, 0, 0, 0, 0];
  seen.forEach(k => box[S.srs[k].b]++); const mx = Math.max(1, ...box.slice(1));
  const weak = new Set(S.errors.filter(e => IDX[e.k]).map(e => e.k)).size;
  app.innerHTML = '<div class="wrap"><div class="revcard"><h2>' + (due ? plural(due, 'mot') + ' à revoir' : 'Tout est à jour') + '</h2><p>' + (due ? 'Ils sont sur le point de s\'effacer de ta mémoire. 15 au maximum par séance, et +2 cœurs à la fin.' : 'Rien à revoir aujourd\'hui. Reviens demain, ou entraîne-toi librement ci-dessous.') + '</p>' +
    '<button class="btn w" data-run="rev" ' + (due ? '' : 'disabled') + '>Réviser maintenant</button></div>' +
    '<div class="trainrow"><button class="tile" data-run="weak" ' + (weak ? '' : 'disabled') + '><b>Mots fragiles</b><span>' + (weak ? plural(Math.min(weak, 10), 'mot') + ' où tu t\'es trompé' : 'Aucune erreur pour l\'instant') + '</span></button>' +
    '<button class="tile" data-run="free" ' + (seen.length >= 4 ? '' : 'disabled') + '><b>Entraînement libre</b><span>10 mots vus au hasard, sans perdre de cœur</span></button></div>' +
    '<section class="panel"><h3>Ta mémoire <span>' + plural(seen.length, 'mot') + '</span></h3><div class="boxes">' +
    [1, 2, 3, 4, 5].map(b => '<div>' + box[b] + '<i style="height:' + Math.round(box[b] / mx * 100) + '%;opacity:' + (.45 + b * .11) + '"></i><span>Niv. ' + b + '<br>J+' + INT[b - 1] + '</span></div>').join('') + '</div>' +
    '<p class="mut" style="font-size:14px;margin:6px 0 0">Chaque bonne réponse fait monter un mot d\'un niveau et espace la prochaine révision. Une erreur le renvoie au niveau 1. C\'est la répétition espacée : on revoit un mot juste avant de l\'oublier.</p></section>' +
    (S.errors.length ? '<h3 style="margin:18px 0 8px">Erreurs récentes</h3><div class="lex">' + S.errors.filter(e => IDX[e.k]).slice(0, 8).map(e => '<div><span style="text-align:left"><b>' + esc(IDX[e.k].lu) + '</b><small>' + esc(IDX[e.k].fr) + '</small></span><span><small style="color:var(--red)">' + esc(e.g || '—') + '</small>' + frDate(e.d).slice(0, 5) + '</span></div>').join('') + '</div>' : '') + '</div>';
}

/* ---------- Pass ---------- */
function renderPass() {
  const nd = LESSONS.filter(L => S.done[L.id]).length, lv = level();
  app.innerHTML = '<div class="wrap"><div class="passhead">' + lion('happy') + '<div><h1>Pass Lëtzebuerg</h1><p>' + nd + '/' + LESSONS.length + ' tampons · niveau ' + lv.n + ', ' + esc(lv.title) + '</p></div></div>' +
    P.unites.map(u => '<h3 style="margin:22px 0 0;color:' + u.couleur + '">' + esc(u.nom) + '</h3><div class="stamps">' + u.lecons.map(L => {
      const d = S.done[L.id];
      return '<button class="stamp' + (d ? '' : ' lock') + '" style="--rc:' + u.couleur + ';border:0;cursor:pointer" data-les="' + esc(L.id) + '"><div class="in"><small>' + esc(u.nom) + '</small>' + emblem(u.id) + '<b>' + esc(L.commune) + '</b><span class="val">' + (d ? frDate(d.date) : 'à débloquer') + '</span></div>' + (d ? '<span class="ink">' + (d.audit ? 'TEST' : d.score + ' %') + '</span>' : '') + '</button>';
    }).join('') + '</div>').join('') + '</div>';
}

/* ---------- Guide ---------- */
const SONS = [
  {titre: 'Les voyelles', items: [
    ['ä', '« è » ouvert, comme dans « mère ».', 'Äddi (au revoir)'], ['é', '« é » fermé, comme dans « été ».', 'Méindeg (lundi)'],
    ['ë', '« e » bref, comme dans « le ».', 'Lëtzebuerg'], ['ee', '« é » long.', 'd\'Ee (l\'œuf)'],
    ['éi', '« éï » : un é qui glisse vers i.', 'Kéis (fromage) ≈ « kéïss »'], ['ei', '« aï », comme dans « aïe ».', 'Freideg (vendredi) ≈ « fraï-dech »'],
    ['äi', '« èï ».', 'wäiss (blanc) ≈ « vèïss »'], ['ue', '« ou-e » : un ou qui glisse vers e.', 'muer (demain) ≈ « mou-er »'],
    ['ie', '« i-e » : un i qui glisse vers e.', 'd\'Wieder (le temps) ≈ « vi-eder »'], ['au', '« a-ou ».', 'd\'Auer (l\'heure) ≈ « a-ouer »'],
    ['ou', '« o-ou », proche du « o » de l\'anglais « go ».', 'Reunioun (réunion)']]},
  {titre: 'Les consonnes', items: [
    ['w', 'Se prononce « v ».', 'Waasser (eau) ≈ « vâsser »'], ['v', 'Souvent « f » dans les mots germaniques, « v » dans les mots venus du français.', 'vill (beaucoup) ≈ « fil »'],
    ['z', 'Se prononce « ts ».', 'zwee (deux) ≈ « tsvé »'], ['j', 'Se prononce « y ».', 'Jo (oui) ≈ « yo »'],
    ['s', 'En début de mot devant une voyelle : « z ».', 'd\'Sonn (le soleil) ≈ « zonn »'], ['sch', 'Comme le « ch » de « chat ».', 'Schong (chaussure)'],
    ['ch', 'Après e, i, ä, ë : un souffle doux et chuintant. Après a, o, u : raclé au fond de la gorge.', 'ech (je), Nuecht (nuit)'],
    ['-g', 'En fin de mot, le g se prononce comme un « ch » doux.', 'Dag (jour) ≈ « dach »']]},
  {titre: 'Trois réflexes', items: [
    ['-n', 'La règle du n : le -n final tombe devant la plupart des consonnes. Elle change l\'écriture, repère-la vite.', 'Gudde Moien · Gudden Owend'],
    ['1re', 'L\'accent tombe en général sur la 1re syllabe des mots germaniques.', 'LËtzebuerg, MÉIndeg'],
    ['FR', 'Les mots venus du français gardent une prononciation proche du français.', 'Merci, Rendez-vous, Formulaire']]}
];
function renderGuide() {
  const tabs = [['sons', 'Sons'], ['gram', 'Grammaire'], ['lex', 'Lexique']];
  let body = '';
  if (guideTab === 'sons') body = '<div class="leiw">' + lion('think') + '<div class="bubble">Comment ça se prononce ?<small>Des repères pour un francophone. Ce sont des approximations : pour entendre la vraie prononciation, chaque mot du dictionnaire LOD (lod.lu) a un enregistrement audio, consultable avec du réseau.</small></div></div>' +
    SONS.map(sec => '<div class="gcard"><h3>' + esc(sec.titre) + '</h3>' + sec.items.map(([l, d, ex]) => '<div class="snd"><b>' + esc(l) + '</b><p>' + esc(d) + '<br><em>' + esc(ex) + '</em></p></div>').join('') + '</div>').join('');
  else if (guideTab === 'gram') body = Object.keys(G).map(k => { const g = gram(k); return '<div class="gcard"><h3>' + esc(g.titre) + '</h3><p>' + esc(g.texte) + '</p></div>'; }).join('');
  else body = '<input class="search" id="lexq" type="search" placeholder="Chercher en français ou en luxembourgeois…" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="lex" id="lexl"></div>';
  app.innerHTML = '<div class="wrap"><div class="tabs2">' + tabs.map(([k, t]) => '<button data-gt="' + k + '" class="' + (guideTab === k ? 'on' : '') + '">' + t + '</button>').join('') + '</div>' + body + '</div>';
  if (guideTab === 'lex') { const q = $('lexq'); q.addEventListener('input', () => lexList(q.value)); lexList(''); }
}
function lexList(q) {
  const n = loose(q), all = Object.values(IDX).filter(it => !n || loose(it.lu).includes(n) || loose(it.fr).includes(n)).sort((a, b) => a.lu.localeCompare(b.lu, 'lb'));
  $('lexl').innerHTML = all.slice(0, 200).map(it => { const o = S.srs[it.key]; return '<div><span style="text-align:left"><b>' + esc(it.lu) + '</b><small>' + esc(it.lecon.commune) + (o ? ' · niveau ' + o.b : ' · nouveau') + '</small></span><span>' + esc(it.fr) + '</span></div>'; }).join('') || '<div><span>Aucun résultat.</span></div>';
}

/* ================= Feuilles du bas ================= */
function openSheet(h) { const s = $('sheet'); s.innerHTML = h; s.hidden = false; $('sheetBg').hidden = false; s.scrollTop = 0; }
function closeSheet() { $('sheet').hidden = true; $('sheetBg').hidden = true; }
function communeSheet(L) {
  const d = S.done[L.id], lk = locked(L), fresh = L.items.filter(it => !S.srs[it.key]).length, u = L.unite;
  openSheet('<div class="shead" style="color:' + u.couleur + '">' + emblem(u.id) + '<div><h2 style="color:var(--ink)">' + esc(L.commune) + '</h2><p class="sub" style="margin:2px 0 0">' + esc(L.commune_fr) + ' · ' + esc(u.nom) + '</p></div></div>' +
    '<p style="margin-top:14px;color:var(--ink);font-weight:700;font-size:17px">' + esc(L.theme) + '</p>' +
    '<span class="tag">' + L.items.length + ' mots et phrases</span>' + (fresh ? '<span class="tag" style="background:var(--redf);color:var(--red)">' + fresh + ' nouveaux</span>' : '') + (d ? '<span class="tag" style="background:var(--greenf);color:var(--greend)">' + (d.audit ? 'Validée au test' : 'Meilleur score ' + d.score + ' %') + '</span>' : '') +
    (lk ? '<p>Cette commune est encore verrouillée. Termine la précédente, ou passe le test de placement si tu as déjà des bases.</p><div class="row"><button class="btn ghost" data-close>Fermer</button>' + (!S.audit ? '<button class="btn gold" data-run="audit">Test</button>' : '') + '</div>'
        : '<div class="row"><button class="btn green" data-start="' + esc(L.id) + '">' + (d ? 'Refaire' : 'C\'est parti') + '</button></div>'));
}
function meSheet() {
  const lv = level(), nd = LESSONS.filter(L => S.done[L.id]).length, seen = Object.keys(S.srs).filter(k => IDX[k]).length;
  openSheet('<div class="shead">' + lion('happy') + '<div><h2>Niveau ' + lv.n + '</h2><p class="sub" style="margin:2px 0 0">' + esc(lv.title) + '</p></div></div>' +
    '<div class="lvl"><div class="pbar"><i style="width:' + Math.round(lv.p * 100) + '%"></i></div><p style="margin:6px 0 0;font-size:13px">' + (lv.nx ? (lv.nx - S.xp) + ' XP avant le niveau ' + (lv.n + 1) : 'Niveau maximum, félicitations !') + '</p></div>' +
    '<div class="stats"><div><b>' + S.xp + '</b><span>XP au total</span></div><div><b>' + S.best + '</b><span>record de série (jours)</span></div><div><b>' + nd + '/' + LESSONS.length + '</b><span>communes</span></div><div><b>' + seen + '</b><span>mots vus</span></div></div>' +
    '<div class="toggle">Sons <button class="sw' + (S.sound ? ' on' : '') + '" data-pn="sound" aria-label="Sons"></button></div>' +
    '<div style="padding:12px 0;border-bottom:2px solid var(--line)"><b>Objectif quotidien</b><div class="seg" style="margin-top:8px">' + [[20, 'Tranquille'], [50, 'Régulier'], [100, 'Intense']].map(([v, t]) => '<button data-goal="' + v + '" class="' + (S.goal === v ? 'on' : '') + '">' + t + '<br><small>' + v + ' XP</small></button>').join('') + '</div></div>' +
    '<p style="margin-top:14px">Ta progression est enregistrée sur ce téléphone. Exporte-la de temps en temps : c\'est ta copie de secours.</p>' +
    '<div class="row"><button class="btn" data-pn="exp">Exporter</button><button class="btn ghost" data-pn="imp">Importer</button></div>' +
    '<div class="row"><button class="btn ghost" data-pn="rst" style="color:var(--red)">Réinitialiser</button></div><p class="foot">Luxo <span id="ver2"></span></p>');
  askVersion();
}
const exportCode = () => { try { return 'LUXO1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))); } catch (e) { return ''; } };
$('sheet').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.start) { const L = LESSONS.find(l => l.id === b.dataset.start); closeSheet(); start('lesson', L); return; }
  if (b.dataset.run) { closeSheet(); start(b.dataset.run); return; }
  if (b.hasAttribute('data-close')) { closeSheet(); return; }
  if (b.dataset.goal) { S.goal = +b.dataset.goal; save(); meSheet(); stats(); return; }
  const a = b.dataset.pn; if (!a) return;
  if (a === 'sound') { S.sound = !S.sound; save(); b.classList.toggle('on', S.sound); sfx('tap'); }
  if (a === 'exp') openSheet('<h2>Exporter</h2><p class="sub">Copie ce code et garde-le dans une note. Il permet de tout récupérer.</p><textarea id="expT" readonly>' + esc(exportCode()) + '</textarea><div class="row">' + (navigator.share ? '<button class="btn" data-pn="share">Partager</button>' : '') + '<button class="btn ghost" data-pn="copy">Copier</button></div>');
  if (a === 'share') { try { await navigator.share({title: 'Sauvegarde Luxo', text: $('expT').value}); } catch (er) {} }
  if (a === 'copy') { const t = $('expT'); t.select(); try { await navigator.clipboard.writeText(t.value); toast('Code copié'); } catch (er) { toast('Code sélectionné : utilise « Copier »'); } }
  if (a === 'imp') openSheet('<h2>Importer</h2><p class="sub">Colle un code de sauvegarde (Luxo, ou l\'ancienne appli Schwätz). Il remplace ta progression actuelle.</p><textarea id="impT" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea><div class="row"><button class="btn" data-pn="doimp">Importer</button><button class="btn ghost" data-close>Annuler</button></div>');
  if (a === 'doimp') {
    try { const v = $('impT').value.trim().replace(/^(LUXO1|SCHW1|XLB1):/, ''); const o = JSON.parse(decodeURIComponent(escape(atob(v)))); if (!o || typeof o !== 'object' || !('xp' in o)) throw 0; S = migrate(o); S.onb = true; save(); go('carte'); toast('Progression importée'); }
    catch (er) { toast('Code invalide'); }
  }
  if (a === 'rst') openSheet('<h2>Tout effacer ?</h2><p class="sub">XP, série, communes et révisions seront supprimées de ce téléphone. Exporte d\'abord si tu veux garder une copie.</p><div class="row"><button class="btn ghost" data-close>Annuler</button><button class="btn red" data-pn="dorst">Effacer</button></div>');
  if (a === 'dorst') { S = blank(); save(); closeSheet(); onboarding(0); }
});
$('sheetBg').addEventListener('click', closeSheet);
$('meBtn').addEventListener('click', meSheet);

/* ================= Accueil (premier lancement) ================= */
let onbGoal = 50;
function onboarding(step) {
  view = 'onb'; document.body.classList.add('focus'); closeSheet();
  const dots = '<div class="dots">' + [0, 1, 2].map(i => '<i class="' + (i === step ? 'on' : '') + '"></i>').join('') + '</div>';
  if (step === 0) app.innerHTML = '<div class="onb"><div class="hero">' + lion('cheer', 'cheer') + '</div><h1>Moien !</h1><p>Ech sinn de Léiw, le lion du drapeau luxembourgeois. Je vais t\'apprendre le luxembourgeois depuis le français, commune après commune, même dans le train sans réseau.</p>' + dots + '<button class="btn green w" data-onb="1">C\'est parti</button></div>';
  if (step === 1) app.innerHTML = '<div class="onb"><div class="hero">' + lion('think') + '</div><h1>Ton rythme ?</h1><p>Un objectif court tenu tous les jours vaut mieux qu\'une grosse séance par semaine.</p><div class="choice">' + [[20, 'Tranquille', '≈ 5 min'], [50, 'Régulier', '≈ 10-15 min'], [100, 'Intense', '≈ 25 min']].map(([v, t, d]) => '<button data-g="' + v + '" class="' + (onbGoal === v ? 'on' : '') + '">' + t + '<small>' + v + ' XP par jour<br>' + d + '</small></button>').join('') + '</div>' + dots + '<button class="btn green w" data-onb="2">Continuer</button></div>';
  if (step === 2) app.innerHTML = '<div class="onb"><div class="hero">' + lion('happy') + '</div><h1>Tu pars d\'où ?</h1><p>Aucun souci si c\'est de zéro : chaque mot nouveau te sera présenté avant d\'être testé.</p><div class="choice"><button data-onb="zero">Je pars de zéro<small>On commence au Minett</small></button><button data-onb="audit">J\'ai quelques bases<small>Test de placement</small></button></div>' + dots + '</div>';
}
function finishOnb(next) { S.goal = onbGoal; S.onb = true; save(); if (next === 'audit') { go('carte'); start('audit'); } else { go('carte'); toast('Astuce : l\'onglet Guide t\'explique la prononciation.'); } }

/* ================= Séance d'exercices ================= */
const KIND = {trad: 'Traduis en luxembourgeois', qcm: 'Choisis la bonne traduction', ordre: 'Remets les mots dans l\'ordre', trou: 'Complète la phrase', inv: 'Traduis en français', pairs: 'Associe les paires', intro: 'Nouveau'};
const PRAISE = ['Super !', 'Exact !', 'Genau !', 'Parfait !', 'Bravo !', 'Gutt gemaach !', 'Top !', 'Très bien !'];
const OOPS = ['Pas tout à fait', 'Presque, retiens bien', 'On y retourne', 'Pas grave, ça rentre'];
function start(kind, L) {
  daily();
  if (kind === 'lesson' && S.lives <= 0) { toast('Plus de cœurs aujourd\'hui : fais une révision pour en regagner 2.'); return; }
  const ex = kind === 'lesson' ? buildLesson(L) : kind === 'rev' ? buildRev() : kind === 'weak' ? buildWeak() : kind === 'free' ? buildFree() : buildAudit();
  if (!ex.length) { toast('Rien à faire ici pour le moment.'); return; }
  sess = {kind, L, ex, i: 0, checked: false, xp: 0, okN: 0, graded: 0, combo: 0, best: 0, kos: 0};
  view = 'ex'; document.body.classList.add('focus'); closeSheet(); renderEx(); window.scrollTo(0, 0);
}
function sayBlock(mood, text, small) { return '<div class="say">' + lion(mood) + '<div class="bubble">' + text + (small ? '<small>' + small + '</small>' : '') + '</div></div>'; }
function renderEx() {
  stats();
  const s = sess, e = s.ex[s.i], it = e.item;
  let body = '';
  if (e.type === 'intro') {
    if (e.items.length === 1) {
      const x = e.items[0], g = gram(x.g);
      body = '<div class="card-new"><span class="tagnew">Nouveau</span><div class="lu">' + esc(x.lu) + '</div><div class="fr">' + esc(x.fr) + '</div>' +
        (x.n ? '<div class="note">' + esc(x.n) + '</div>' : '') + (g ? '<div class="note"><b>' + esc(g.titre) + '.</b> ' + esc(g.texte) + '</div>' : '') + '</div>';
    } else body = sayBlock('happy', 'Nouveaux mots !', 'Lis-les une fois, ensuite on joue.') + '<div class="newlist">' + e.items.map(x => '<div><b>' + esc(x.lu) + '</b><span>' + esc(x.fr) + '</span></div>').join('') + '</div>';
  } else if (e.type === 'pairs') {
    e.state = e.state || {left: shuffle(e.items), right: shuffle(e.items), sel: null, matched: [], miss: []};
    const st = e.state, cls = (x, side) => 'w' + (st.matched.includes(x) ? ' gone' : '') + (st.sel && st.sel.side === side && st.sel.x === x ? ' on' : '');
    body = sayBlock('normal', 'Associe chaque mot à sa traduction.') + '<div class="pairs"><div class="col">' + st.left.map((x, k) => '<button class="' + cls(x, 'l') + '" data-pl="' + k + '">' + esc(x.fr) + '</button>').join('') + '</div><div class="col">' + st.right.map((x, k) => '<button class="' + cls(x, 'r') + '" data-pr="' + k + '">' + esc(x.lu) + '</button>').join('') + '</div></div>';
  } else if (e.type === 'qcm') {
    body = sayBlock('normal', esc(it.fr)) + '<div class="opts">' + e.opts.map((o, k) => '<button class="opt' + (e.pick === o ? ' on' : '') + '" data-opt="' + k + '"' + (s.checked ? ' disabled' : '') + '><kbd>' + (k + 1) + '</kbd>' + esc(o) + '</button>').join('') + '</div>';
  } else if (e.type === 'ordre') {
    body = sayBlock('normal', esc(it.fr)) + '<div class="ans">' + e.placed.map((t, k) => '<button class="w" data-back="' + k + '">' + esc(e.tokens[t]) + '</button>').join('') + '</div><div class="bank">' +
      e.tokens.map((t, k) => '<button class="w' + (e.placed.includes(k) ? ' ghost' : '') + '" data-tok="' + k + '">' + esc(t) + '</button>').join('') + '</div>';
  } else if (e.type === 'trou') {
    const q = it.lu.split(' ').map(w => soft(w) === e.gap ? (e.pick && e.choices ? '<b style="color:var(--skyd)">' + esc(e.pick) + '</b>' + esc(w.replace(e.gap, '')) : '<span class="gap">&nbsp;</span>' + esc(w.replace(e.gap, ''))) : esc(w)).join(' ');
    body = sayBlock('think', q, esc(it.fr)) + (e.choices ? '<div class="bank">' + e.choices.map((c, k) => '<button class="w' + (e.pick === c ? ' on' : '') + '" data-ch="' + k + '">' + esc(c) + '</button>').join('') + '</div>'
      : '<input class="inp" id="inp" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="done" placeholder="Le mot manquant…" value="' + esc(e.given || '') + '"' + (s.checked ? ' disabled' : '') + '>' + keys());
  } else {
    const inv = e.type === 'inv';
    body = sayBlock('normal', esc(inv ? it.lu : it.fr)) + '<input class="inp" id="inp" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="done" placeholder="' + (inv ? 'En français…' : 'En luxembourgeois…') + '" value="' + esc(e.given || '') + '"' + (s.checked ? ' disabled' : '') + '>' +
      (inv ? '' : keys(true)) + (e.hint ? '<div class="hintline">' + esc(words(it.lu).slice(0, e.hint).join(' ')) + ' …</div>' : '');
  }
  const title = s.kind === 'audit' ? 'Test de placement' : s.kind === 'rev' ? 'Révisions' : s.kind === 'weak' ? 'Mots fragiles' : s.kind === 'free' ? 'Entraînement' : s.L.commune;
  const pct = Math.round((s.i + (s.checked || e.type === 'intro' ? 1 : 0)) / s.ex.length * 100);
  app.innerHTML = '<div class="ex"><div class="exh"><button class="x" data-quit aria-label="Quitter">×</button><div class="bar"><i style="width:' + pct + '%"></i></div>' +
    (s.combo >= 3 ? '<span class="combo">' + s.combo + ' d\'affilée</span>' : '') +
    (s.kind === 'lesson' ? '<span class="chip"><svg viewBox="0 0 24 24"><path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z" fill="#ef3340"/></svg><b>' + S.lives + '</b></span>' : '') + '</div>' +
    '<div class="exb"><div class="kind">' + esc(title) + ' · ' + esc(KIND[e.type]) + '</div>' + body + '</div>' + footer() + '</div>';
  const inp = $('inp'); if (inp && !s.checked && matchMedia('(pointer:fine)').matches) inp.focus();
  if (s.checked || e.type === 'intro') { const g = app.querySelector('[data-next]'); if (g) g.focus({preventScroll: true}); }
}
function keys(hint) {
  if (sess.checked) return '';
  return '<div class="tools">' + ['ë', 'é', 'ä', 'É', 'Ä'].map(c => '<button data-key="' + c + '" tabindex="-1" aria-label="Insérer ' + c + '">' + c + '</button>').join('') + (hint ? '<button class="hint" data-hint>Indice</button>' : '') + '</div>';
}
function footer() {
  const s = sess, e = s.ex[s.i];
  if (e.type === 'intro') return '<div class="fb"><div class="in"><div class="acts"><button class="btn green" data-next>J\'ai compris</button></div></div></div>';
  if (!s.checked) {
    if (e.type === 'pairs') return '<div class="fb"><div class="in"><div class="acts"><button class="skip" data-skip>Je ne sais pas</button></div></div></div>';
    const can = e.type === 'qcm' || (e.type === 'trou' && e.choices) ? !!e.pick : e.type === 'ordre' ? e.placed.length > 0 : true;
    return '<div class="fb"><div class="in"><div class="acts"><button class="skip" data-skip>Passer</button><button class="btn green" data-check ' + (can ? '' : 'disabled') + '>Vérifier</button></div></div></div>';
  }
  const r = e.result, h = r === 'ok' ? (s.combo >= 3 ? s.combo + ' d\'affilée !' : PRAISE[s.i % PRAISE.length]) : r === 'al' ? 'Presque !' : OOPS[s.i % OOPS.length];
  let ref = '';
  if (e.type === 'pairs') ref = r === 'ok' ? '' : '<div class="ref">' + e.items.map(x => esc(x.fr) + ' = ' + esc(x.lu)).join(' · ') + '</div>';
  else if (r !== 'ok' || e.type === 'trou') ref = '<div class="ref">' + (e.type === 'inv' ? esc(e.item.fr) : esc(e.item.lu)) + '</div>';
  const w = r === 'ok' ? (e.item && e.item.v ? why(e) : []) : why(e);
  return '<div class="fb ' + r + '"><div class="in"><div class="why"><h3>' + lion(r === 'ok' ? 'cheer' : r === 'al' ? 'think' : 'sad') + h + '</h3>' + ref + w.map(t => '<p>' + t + '</p>').join('') + '</div><div class="acts"><button class="btn ' + (r === 'ko' ? 'red' : r === 'al' ? 'gold' : 'green') + '" data-next>Continuer</button></div></div></div>';
}
function check(skip) {
  const s = sess, e = s.ex[s.i]; if (s.checked || e.type === 'intro') return;
  const it = e.item; let r;
  if (e.type === 'pairs') { r = skip || e.state.miss.length ? 'ko' : 'ok'; e.items.forEach(x => srsHit(x, skip || e.state.miss.includes(x) ? 'ko' : 'ok', '')); }
  else {
    if (skip) { r = 'ko'; e.given = ''; }
    else if (e.type === 'qcm') { if (!e.pick) return; e.given = e.pick; r = e.pick === it.lu ? 'ok' : 'ko'; }
    else if (e.type === 'trou' && e.choices) { if (!e.pick) return; e.given = e.pick; r = e.pick === e.gap ? 'ok' : 'ko'; }
    else if (e.type === 'ordre') { if (!e.placed.length) return; e.given = e.placed.map(k => e.tokens[k]).join(' '); r = e.given === words(it.lu).join(' ') ? 'ok' : 'ko'; }
    else {
      e.given = $('inp').value;
      r = e.type === 'inv' ? gradeFr(e.given, it) : e.type === 'trou' ? grade(e.given, [e.gap]) : grade(e.given, [it.lu].concat(it.alt || []));
      if (!r) { $('inp').focus(); return; }
    }
    if (s.kind !== 'audit') srsHit(it, r, e.given);
  }
  e.result = r; s.checked = true; s.graded++;
  if (r === 'ok') { s.combo++; s.best = Math.max(s.best, s.combo); S.q.combo = Math.max(S.q.combo, s.combo); s.kos = 0; } else { s.combo = 0; if (r === 'ko') s.kos++; }
  const xp = s.kind === 'audit' ? 0 : r === 'ok' ? (e.hint ? 5 : 10) + (s.combo >= 5 ? 2 : 0) : r === 'al' ? 5 : 0;
  s.xp += xp; gainXp(xp); if (r !== 'ko') s.okN += r === 'ok' ? 1 : .5;
  if (s.kind === 'lesson' && r === 'ko') S.lives = Math.max(0, S.lives - 1);
  sfx(r === 'ko' ? 'ko' : 'ok');
  save(); renderEx();
}
function next() {
  const s = sess;
  if (s.kind === 'lesson' && S.lives <= 0 && s.i < s.ex.length - 1) { endScreen(true); return; }
  if (s.kind === 'audit' && s.kos >= 2) { endScreen(false); return; }   // test adaptatif : on s'arrête après 2 erreurs d'affilée
  s.i++; s.checked = false;
  if (s.i >= s.ex.length) endScreen(false); else { if (s.ex[s.i].type === 'intro') sfx('new'); renderEx(); window.scrollTo(0, 0); }
}
function endScreen(out) {
  const s = sess, score = Math.round(s.okN / Math.max(1, s.graded) * 100); let line = '', bonus = 0, title, stamp = '', mood = 'cheer';
  if (!out) {
    if (s.kind === 'lesson') {
      const prev = S.done[s.L.id];
      S.done[s.L.id] = {score: Math.max(score, prev && !prev.audit ? prev.score : 0), date: today()};
      S.unlocked = Math.max(S.unlocked, s.L.idx + 2); bonus = 20; gainXp(20); S.q.les++;
      const nx = LESSONS[s.L.idx + 1];
      title = prev ? s.L.commune + ', encore mieux !' : s.L.commune + ' débloquée !';
      line = nx ? 'Prochain arrêt : ' + nx.commune + ' · ' + nx.theme + '.' : 'Tu as fait toutes les communes disponibles. Chapeau !';
      if (!prev) stamp = '<div class="newstamp"><div class="stamp" style="--rc:' + s.L.unite.couleur + '"><div class="in"><small>' + esc(s.L.unite.nom) + '</small>' + emblem(s.L.unite.id) + '<b>' + esc(s.L.commune) + '</b><span class="val">' + frDate(today()) + '</span></div><span class="ink">' + score + ' %</span></div></div>';
    } else if (s.kind === 'audit') {
      let k = 0; while (k < s.ex.length && s.ex[k].result === 'ok') k++;
      S.unlocked = Math.max(S.unlocked, Math.min(LESSONS.length, k + 1));
      for (let j = 0; j < k; j++) if (!S.done[LESSONS[j].id]) S.done[LESSONS[j].id] = {score: 100, date: today(), audit: 1};
      S.audit = true; title = 'Test terminé';
      line = k ? plural(k, 'commune') + ' validée' + (k > 1 ? 's' : '') + ' d\'office. Tu reprends à ' + (LESSONS[k] ? LESSONS[k].commune : 'la fin') + '.' : 'On part du début : parfait pour poser des bases solides.';
    } else { if (s.kind === 'rev') S.lives = Math.min(MAXL, S.lives + 2); S.q.les++; title = 'Révisions faites !'; line = s.kind === 'rev' ? '+2 cœurs récupérés. Ta mémoire te remercie.' : 'Bien entraîné. Les mots ratés reviendront en révision.'; }
    save(); sfx('end'); if (score >= 60 || s.kind === 'audit') confetti();
  } else { title = 'Pause !'; mood = 'sad'; line = 'Plus de cœurs pour aujourd\'hui. Fais une révision pour en regagner 2, puis reviens.'; }
  stats(); view = 'end';
  app.innerHTML = '<div class="end"><div class="hero">' + lion(mood, mood === 'cheer' ? 'cheer' : '') + '</div><h1>' + esc(title) + '</h1><p>' + esc(line) + '</p><div class="big"><div class="g"><em>XP</em><b>+' + (s.xp + bonus) + '</b></div><div class="v"><em>Justes</em><b>' + score + '%</b></div><div class="s"><em>Série</em><b>' + s.best + '</b></div></div>' + stamp + '<button class="btn green w" data-home>Continuer</button></div>';
}

/* ================= Paires ================= */
function pairTap(side, k) {
  const e = sess.ex[sess.i], st = e.state; if (sess.checked) return;
  const x = (side === 'l' ? st.left : st.right)[k]; if (!x || st.matched.includes(x)) return;
  if (!st.sel || st.sel.side === side) { st.sel = {side, x}; sfx('tap'); renderEx(); return; }
  if (st.sel.x === x) { st.matched.push(x); st.sel = null; sfx('tap'); if (st.matched.length === e.items.length) { check(); return; } renderEx(); }
  else {
    const other = st.sel.x; [other, x].forEach(m => { if (!st.miss.includes(m)) st.miss.push(m); });
    st.sel = null; sfx('ko'); renderEx();
    const bad = [...app.querySelectorAll('[data-pl],[data-pr]')].filter(b => { const isL = b.dataset.pl != null, v = isL ? st.left[+b.dataset.pl] : st.right[+b.dataset.pr]; return (isL ? 'l' : 'r') === side ? v === x : v === other; });
    bad.forEach(b => b.classList.add('bad')); setTimeout(() => bad.forEach(b => b.classList.remove('bad')), 650);
  }
}

/* ================= Clics et clavier ================= */
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { if (view === 'onb') return; go(b.dataset.tab); }));
app.addEventListener('click', e => {
  const t = e.target.closest('button,[data-les]'); if (!t) return;
  if (view === 'onb') {
    if (t.dataset.g) { onbGoal = +t.dataset.g; onboarding(1); return; }
    if (t.dataset.onb === '1') onboarding(1); else if (t.dataset.onb === '2') onboarding(2); else if (t.dataset.onb) finishOnb(t.dataset.onb);
    return;
  }
  if (t.hasAttribute('data-home')) { go('carte'); return; }
  if (t.dataset.les) { const L = LESSONS.find(l => l.id === t.dataset.les); if (t.dataset.direct && !locked(L)) start('lesson', L); else communeSheet(L); return; }
  if (t.dataset.run) { start(t.dataset.run); return; }
  if (t.dataset.gt) { guideTab = t.dataset.gt; renderGuide(); return; }
  if (t.hasAttribute('data-chest')) { if (!S.q.claimed && quests().every(q => q.v >= q.m)) { S.q.claimed = true; gainXp(30); save(); sfx('end'); confetti(); toast('Coffre ouvert : +30 XP !'); renderCarte(); stats(); } return; }
  if (!sess || view !== 'ex') return;
  const ex = sess.ex[sess.i];
  if (t.hasAttribute('data-quit')) { go(tab); return; }
  if (t.hasAttribute('data-check')) { check(); return; }
  if (t.hasAttribute('data-skip')) { check(true); return; }
  if (t.hasAttribute('data-next')) { next(); return; }
  if (sess.checked) return;
  if (t.hasAttribute('data-hint')) { ex.hint = Math.min((ex.hint || 0) + 1, words(ex.item.lu).length); ex.given = $('inp').value; renderEx(); return; }
  if (t.dataset.opt != null) { ex.pick = ex.opts[+t.dataset.opt]; sfx('tap'); renderEx(); return; }
  if (t.dataset.ch != null) { ex.pick = ex.choices[+t.dataset.ch]; sfx('tap'); renderEx(); return; }
  if (t.dataset.tok != null) { const k = +t.dataset.tok; if (!ex.placed.includes(k)) ex.placed.push(k); sfx('tap'); renderEx(); return; }
  if (t.dataset.back != null) { ex.placed.splice(+t.dataset.back, 1); renderEx(); return; }
  if (t.dataset.pl != null) { pairTap('l', +t.dataset.pl); return; }
  if (t.dataset.pr != null) { pairTap('r', +t.dataset.pr); return; }
  if (t.dataset.key) { const i = $('inp'); const a = i.selectionStart ?? i.value.length, b = i.selectionEnd ?? a; i.value = i.value.slice(0, a) + t.dataset.key + i.value.slice(b); i.focus(); i.setSelectionRange(a + 1, a + 1); ex.given = i.value; }
});
app.addEventListener('mousedown', e => { if (e.target.closest('[data-key]')) e.preventDefault(); });   // garde le clavier ouvert
app.addEventListener('input', e => { if (e.target.id === 'inp' && sess) sess.ex[sess.i].given = e.target.value; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSheet(); return; }
  if (view === 'tab' && e.key === 'Enter' && e.target.matches('g[data-les]')) { e.preventDefault(); communeSheet(LESSONS.find(l => l.id === e.target.dataset.les)); return; }
  if (view === 'end' && e.key === 'Enter') { e.preventDefault(); go('carte'); return; }
  if (view !== 'ex' || !sess) return;
  const ex = sess.ex[sess.i], inInput = e.target.id === 'inp';
  if (e.key === 'Enter') {
    if (e.target.closest('button') && !inInput && !e.target.matches('[data-next],[data-check]')) return;
    e.preventDefault(); if (inInput) e.target.blur();
    if (ex.type === 'intro' || sess.checked) next(); else check(); return;
  }
  if (sess.checked || inInput) return;
  if (ex.type === 'qcm' && /^[1-4]$/.test(e.key) && ex.opts[+e.key - 1]) { ex.pick = ex.opts[+e.key - 1]; renderEx(); }
  if (ex.type === 'pairs' && /^[1-8]$/.test(e.key)) { const n = +e.key; n <= 4 ? pairTap('l', n - 1) : pairTap('r', n - 5); }
  if (ex.type === 'ordre' && e.key === 'Backspace' && ex.placed.length) { e.preventDefault(); ex.placed.pop(); renderEx(); }
});

/* ================= Service worker : hors ligne + mises à jour ================= */
let swReg = null;
function askVersion() { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage('version'); }
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.version) ['ver', 'ver2'].forEach(id => { const v = $(id); if (v) v.textContent = 'v' + ev.data.version; }); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    const offer = () => { if (reg.waiting && navigator.serviceWorker.controller) $('update').hidden = false; };
    offer();
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') offer(); }); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  $('updBtn').addEventListener('click', () => { if (swReg && swReg.waiting) swReg.waiting.postMessage('skipWaiting'); });
}

/* ================= Démarrage ================= */
$('logoLion').innerHTML = lion('happy');
fetch('lessons.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(data => {
  P = data; G = P.grammaire || {};
  P.unites.forEach(u => { REG[u.id] = u.couleur; u.lecons.forEach(l => { l.unite = u; l.idx = LESSONS.length; LESSONS.push(l); }); });
  ['minett', 'stad', 'musel', 'mellerdall', 'eislek', 'guttland', 'sauer'].forEach(k => { REG[k] = REG[k] || '#8899aa'; });
  LESSONS.forEach(l => l.items.forEach(it => { it.key = l.id + '|' + it.lu; it.lecon = l; IDX[it.key] = it; }));
  daily();
  if (!S.onb) onboarding(0); else go('carte');
}).catch(() => { app.innerHTML = '<p class="loading">Impossible de charger les leçons. Ouvre Luxo une fois avec du réseau pour la préparer au mode hors ligne.</p>'; });
})();
