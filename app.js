/* Luxo — logique de l'appli
   Tout tourne dans le téléphone : aucun appel réseau sauf le chargement de lessons.json,
   lui-même gardé en copie par le service worker (sw.js). */
(() => {
'use strict';

/* ---------- Constantes ---------- */
const MAXL = 5;                    // cœurs par jour
const INT = [1, 2, 4, 7, 15];      // répétition espacée : jours avant la prochaine révision, par niveau
const LSK = 'luxo_v1';             // clé de sauvegarde sur le téléphone
let P, G, GOAL, LESSONS = [], IDX = {};

/* ---------- Petits outils ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => dstr(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const frDate = d => d.split('-').reverse().slice(0, 2).join('/');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const soft = s => String(s).replace(/[’`´]/g, "'").replace(/[.!?,;:¿¡«»"()]/g, ' ').replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
const loose = s => strip(soft(s).toLowerCase()).replace(/œ/g, 'oe');
const words = s => soft(s).split(' ').filter(Boolean);
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9; let p = Array.from({length: n + 1}, (_, j) => j); for (let i = 1; i <= m; i++) { const q = [i]; for (let j = 1; j <= n; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q; } return p[n]; }
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', 3200); }

/* ---------- Sauvegarde sur le téléphone ---------- */
const blank = () => ({v: 1, ts: 0, xp: 0, day: '', dayXp: 0, goalDay: '', streak: 0, lives: MAXL, livesDay: '', done: {}, unlocked: 1, audit: false, srs: {}, errors: []});
let S = blank();
try { const r = localStorage.getItem(LSK); if (r) S = Object.assign(blank(), JSON.parse(r)); } catch (e) {}
function save() { S.ts = Date.now(); try { localStorage.setItem(LSK, JSON.stringify(S)); } catch (e) { toast('Sauvegarde impossible : pense à exporter ta progression.'); } }
// Demande au navigateur de ne pas effacer nos données de lui-même (si possible).
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
function daily() { const t = today(); if (S.livesDay !== t) { S.lives = MAXL; S.livesDay = t; } if (S.day !== t) { S.day = t; S.dayXp = 0; } }

/* ---------- Progression ---------- */
function gainXp(n) {
  if (!n) return; daily(); S.xp += n; S.dayXp += n;
  if (S.dayXp >= GOAL && S.goalDay !== today()) { S.streak = S.goalDay === addDays(-1) ? S.streak + 1 : 1; S.goalDay = today(); toast('Objectif du jour atteint ! Série : ' + S.streak + ' jour' + (S.streak > 1 ? 's' : '')); }
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

/* ---------- Génération des exercices ---------- */
function opts(it) {
  let pool = it.lecon.items.filter(x => x !== it && x.t === it.t && x.lu !== it.lu);
  if (pool.length < 3) pool = pool.concat(Object.values(IDX).filter(x => x.t === it.t && x.lecon !== it.lecon));
  return shuffle([it.lu].concat(shuffle(pool).slice(0, 3).map(x => x.lu)));
}
const gapOf = it => { const w = words(it.lu); return it.gap && w.includes(it.gap) ? it.gap : w.slice().sort((a, b) => b.length - a.length)[0]; };
function mk(type, it) {
  const w = words(it.lu);
  if (type === 'ordre' && (it.t !== 's' || w.length < 3 || w.length > 8)) type = 'qcm';
  if (type === 'trou' && (it.t !== 's' || w.length < 2)) type = 'trad';
  const e = {type, item: it};
  if (type === 'qcm') e.opts = opts(it);
  if (type === 'trou') e.gap = gapOf(it);
  if (type === 'ordre') {
    const extra = shuffle(Object.values(IDX).filter(x => x.t === 's' && x !== it).flatMap(x => words(x.lu))).filter(x => !w.includes(x)).slice(0, w.length > 5 ? 1 : 2);
    e.tokens = shuffle(w.concat(extra)); e.placed = [];
  }
  return e;
}
function buildLesson(L) {
  const ws = L.items.filter(i => i.t === 'w'), ss = L.items.filter(i => i.t !== 'w'), ex = []; let rest = ws;
  if (ws.length >= 4) { const pick = shuffle(ws).slice(0, 4); ex.push({type: 'pairs', items: pick}); rest = ws.filter(x => !pick.includes(x)); }
  const seq = ['trad', 'qcm', 'ordre', 'trou'];
  ss.forEach((it, k) => ex.push(mk(k % 5 === 4 ? 'inv' : seq[k % 4], it)));   // 1 fois sur 5 : traduction inverse
  shuffle(rest).forEach((it, k) => ex.push(mk(['qcm', 'trad', 'inv'][k % 3], it)));
  const first = ex.shift(); return [first].concat(shuffle(ex)).slice(0, 15);
}
const buildRev = () => dueKeys().slice(0, 15).map((k, i) => mk(['trad', 'qcm', 'inv', 'trou', 'ordre'][i % 5], IDX[k]));
const buildAudit = () => LESSONS.map(L => { const ss = L.items.filter(i => i.t === 's'); return mk('qcm', ss[1 + Math.floor(Math.random() * (ss.length - 1))] || ss[0]); });

/* ---------- Correction ---------- */
function grade(ans, targets) {
  if (!soft(ans)) return null;
  if (targets.some(t => soft(t) === soft(ans))) return 'ok';
  if (targets.some(t => loose(t) === loose(ans))) return 'al';   // juste à un accent / une majuscule près
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
  if (e.type === 'pairs') { const g = [...new Set(e.items.map(x => x.g).filter(Boolean))][0]; if (g && G[g]) out.push(G[g]); return out; }
  const target = e.type === 'trou' ? e.gap : it.lu;
  if (e.result === 'al' && e.type !== 'inv') out.push('Presque : vérifie les majuscules, les accents (ë, é, ä) et les espaces.');
  if (e.result !== 'ok' && e.given && e.type !== 'inv' && eifelSlip(e.given, target) && it.g !== 'eifel') out.push(G.eifel);
  if (it.n) out.push(it.n);
  if (it.g && G[it.g]) out.push(G[it.g]);
  if (it.v) out.push('Forme marquée « à vérifier » sur lod.lu.');
  return out;
}

/* ---------- Carte du Luxembourg (dessin simplifié) ---------- */
const BORDER = '73.3,15.4 83.5,19 91.3,25 94.2,31 95.1,52 102.9,70 110.6,88 122.2,106 131.9,118 145.5,124 159,127 168.7,130 168.7,142 164.8,154 151.3,169 145.5,187 139.6,205 137.7,229 122.2,223 114.5,217 99,220 87.4,232 73.9,235 62.2,232 48.7,223 37.1,211 31.3,205 42.9,190 46.8,178 42.9,160 31.3,151 19.7,133 17.7,118 21.6,109 17.7,100 25.5,82 35.2,67 42.9,52 48.7,37 62.2,19';
const RIVERS = ['165,133 162,150 150,165 144,183 138,203 136,226', '70,222 82,200 92,176 90,150 82,118', '30,102 55,108 80,113 106,103 128,112 146,124 166,131'];
// Étiquette d'une commune : sous la bulle (par défaut), à gauche ou à droite ("etiquette" dans lessons.json).
function label(L, x, y) {
  const side = L.etiquette || 'bas';
  if (side === 'gauche') return '<text class="lb" style="text-anchor:end" x="' + (x - 12) + '" y="' + (y + 2.5) + '">' + esc(L.commune) + '</text>';
  if (side === 'droite') return '<text class="lb" style="text-anchor:start" x="' + (x + 12) + '" y="' + (y + 2.5) + '">' + esc(L.commune) + '</text>';
  return '<text class="lb" x="' + x + '" y="' + (y + 20) + '">' + esc(L.commune) + '</text>';
}
function mapSvg(curIdx) {
  const pts = LESSONS.map(L => L.carte);
  let route = '';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], done = S.done[LESSONS[i - 1].id] && (S.done[LESSONS[i].id] || i === curIdx);
    route += '<line class="route' + (done ? ' done' : '') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
  }
  const soon = (P.communes_a_venir || []).map(c => '<g class="soon"><circle cx="' + c.carte[0] + '" cy="' + c.carte[1] + '" r="5"/><text x="' + c.carte[0] + '" y="' + (c.carte[1] + 11) + '">' + esc(c.commune) + '</text></g>').join('');
  const nodes = LESSONS.map((L, i) => {
    const [x, y] = L.carte, d = S.done[L.id], lk = locked(L), cur = i === curIdx;
    const cls = d ? 'done' : cur ? 'cur' : lk ? 'lock' : 'open';
    const ic = d ? '★' : (i + 1);
    return '<g class="c ' + cls + '" data-les="' + esc(L.id) + '" role="button" tabindex="0" aria-label="' + esc(L.commune + ', ' + L.theme) + '">' +
      '<circle class="base" cx="' + x + '" cy="' + (y + 2.6) + '" r="9.5"/><circle class="top" cx="' + x + '" cy="' + y + '" r="9.5"/>' +
      '<text class="ic" x="' + x + '" y="' + (y + .3) + '">' + ic + '</text>' + label(L, x, y) + '</g>';
  }).join('');
  let pin = '';   // halo qui pulse sous la commune en cours
  if (curIdx >= 0) { const [x, y] = LESSONS[curIdx].carte; pin = '<circle class="pulse" cx="' + x + '" cy="' + (y + 1) + '" r="12"/>'; }
  return '<svg class="map" viewBox="5 8 175 238" role="img" aria-label="Carte du Luxembourg et communes à débloquer"><polygon class="land" points="' + BORDER + '"/>' +
    RIVERS.map(r => '<polyline class="river" points="' + r + '"/>').join('') + route + soon + pin + nodes + '</svg>';
}

/* ---------- Écrans ---------- */
let view = 'home', sess = null;
const app = $('app');
function stats() { daily(); $('sStreak').textContent = streakShown(); $('sXp').textContent = S.xp; $('sLives').textContent = S.lives; }
function show(v) { view = v; closeSheet(); stats(); if (v === 'home') home(); else if (v === 'carnet') carnet(); window.scrollTo(0, 0); }
function home() {
  const curIdx = LESSONS.findIndex(L => !S.done[L.id] && !locked(L));
  const due = dueKeys().length, seen = Object.keys(S.srs).length, nd = LESSONS.filter(L => S.done[L.id]).length;
  const p = Math.min(100, Math.round(S.dayXp / GOAL * 100)), curL = LESSONS[curIdx];
  app.innerHTML = '<div class="wrap">' +
    '<section class="hello"><h1>' + (S.xp ? 'Moien !' : 'Moien, wëllkomm !') + '</h1><p>' + (curL ? 'Prochaine commune : <b>' + esc(curL.commune) + '</b> · ' + esc(curL.theme) : 'Toutes les communes sont débloquées. Bravo !') + '</p>' +
    '<div class="goal"><span aria-hidden="true">🎯</span><div class="gb"><i style="width:' + p + '%"></i></div><b>' + S.dayXp + ' / ' + GOAL + ' XP</b></div></section>' +
    '<section class="mapcard"><h2>A1 · ' + nd + '/' + LESSONS.length + ' communes</h2>' + mapSvg(curIdx) +
    '<div class="legend"><span><i style="background:var(--green)"></i>en cours</span><span><i style="background:var(--gold)"></i>terminée</span><span><i style="background:var(--sky)"></i>ouverte</span><span><i style="background:var(--grey)"></i>verrouillée</span></div></section>' +
    (curL ? '<button class="btn green w" data-les="' + esc(curL.id) + '">Continuer · ' + esc(curL.commune) + '</button>' : '') +
    '<section class="tiles" style="margin-top:16px">' +
    '<button class="tile' + (due ? ' hot' : '') + '" data-go="rev"><b>Révisions</b><span>' + (due ? due + ' mot' + (due > 1 ? 's' : '') + ' à revoir · +2 ♥' : 'Rien à revoir aujourd\'hui') + '</span></button>' +
    '<button class="tile" data-go="carnet"><b>Carnet</b><span>' + seen + ' mot' + (seen > 1 ? 's' : '') + ' vus</span></button>' +
    (S.audit ? '' : '<button class="tile wide" data-go="audit"><b>Test de placement</b><span>10 questions pour débloquer d\'office les communes que tu maîtrises déjà</span></button>') +
    '</section><p class="foot">Luxo <span id="ver"></span> · fonctionne hors ligne</p></div>';
  askVersion();
}
function carnet() {
  const ks = Object.keys(S.srs).filter(k => IDX[k]).sort((a, b) => S.srs[a].d.localeCompare(S.srs[b].d));
  const rows = ks.map(k => { const o = S.srs[k], it = IDX[k]; return '<div><span><b>' + esc(it.lu) + '</b><small>' + esc(it.fr) + '</small></span><span style="text-align:right"><span class="lv">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= o.b ? 'f' : '') + '"></i>').join('') + '</span><br><small>' + (o.d <= today() ? 'à revoir' : frDate(o.d)) + '</small></span></div>'; }).join('');
  const errs = S.errors.filter(e => IDX[e.k]).slice(0, 10).map(e => '<div><span><b>' + esc(IDX[e.k].lu) + '</b><small>' + esc(IDX[e.k].fr) + '</small></span><span style="text-align:right"><small style="color:var(--red)">' + esc(e.g || '—') + '</small><br><small>' + frDate(e.d) + '</small></span></div>').join('');
  app.innerHTML = '<div class="wrap"><section class="hello"><h1>Carnet</h1><p>Un mot réussi monte d\'un niveau (révision à J+1, 2, 4, 7, 15). Un mot raté redescend au niveau 1 et revient aujourd\'hui.</p></section>' +
    (errs ? '<h3 style="margin-top:18px">Erreurs récentes</h3><div class="list">' + errs + '</div>' : '') +
    '<h3 style="margin-top:18px">Mots vus (' + ks.length + ')</h3>' + (rows ? '<div class="list">' + rows + '</div>' : '<p>Rien encore : lance ta première commune.</p>') +
    '<button class="btn ghost w" data-go="home">Retour à la carte</button><p class="foot"></p></div>';
}

/* ---------- Feuille du bas ---------- */
function openSheet(h) { const s = $('sheet'); s.innerHTML = h; s.hidden = false; $('sheetBg').hidden = false; const f = s.querySelector('.btn,textarea'); if (f) f.focus({preventScroll: true}); }
function closeSheet() { $('sheet').hidden = true; $('sheetBg').hidden = true; }
function communeSheet(L) {
  const d = S.done[L.id], lk = locked(L);
  openSheet('<h2>' + esc(L.commune) + '</h2><p class="sub">' + esc(L.commune_fr) + ' · ' + esc(L.theme) + ' · ' + L.items.length + ' mots et phrases</p>' +
    (d ? '<div class="stars"><i>' + (d.audit ? 'Validée au test' : 'Meilleur score ' + d.score + ' %') + '</i></div>' : '') +
    (lk ? '<p>Termine d\'abord la commune précédente, ou passe le test de placement.</p><div class="row"><button class="btn ghost" data-close>Fermer</button></div>'
        : '<div class="row"><button class="btn green" data-start="' + esc(L.id) + '">' + (d ? 'Refaire' : 'Commencer') + '</button></div>'));
}
function menuSheet() {
  openSheet('<h2>Ma progression</h2><p class="sub">Elle est enregistrée sur ce téléphone. Exporte-la de temps en temps : c\'est ta copie de secours.</p><div class="row"><button class="btn" data-pn="exp">Exporter</button><button class="btn ghost" data-pn="imp">Importer</button></div><div class="row" style="margin-top:12px"><button class="btn ghost" data-pn="rst" style="color:var(--red)">Réinitialiser</button></div>');
}
function exportCode() { try { return 'LUXO1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))); } catch (e) { return ''; } }
$('sheet').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.start) { const L = LESSONS.find(l => l.id === b.dataset.start); closeSheet(); start('lesson', L); return; }
  if (b.hasAttribute('data-close')) { closeSheet(); return; }
  const a = b.dataset.pn; if (!a) return;
  if (a === 'exp') openSheet('<h2>Exporter</h2><p>Copie ce code et colle-le dans une note. Il permet de tout récupérer.</p><textarea id="expT" readonly>' + esc(exportCode()) + '</textarea><div class="row">' + (navigator.share ? '<button class="btn" data-pn="share">Partager</button>' : '') + '<button class="btn ghost" data-pn="copy">Copier</button></div>');
  if (a === 'share') { try { await navigator.share({title: 'Sauvegarde Luxo', text: $('expT').value}); } catch (er) {} }
  if (a === 'copy') { const t = $('expT'); t.select(); try { await navigator.clipboard.writeText(t.value); toast('Code copié'); } catch (er) { toast('Code sélectionné : utilise « Copier »'); } }
  if (a === 'imp') openSheet('<h2>Importer</h2><p>Colle un code de sauvegarde (Luxo ou ancienne version Schwätz). Il remplace ta progression actuelle.</p><textarea id="impT" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea><div class="row"><button class="btn" data-pn="doimp">Importer</button><button class="btn ghost" data-close>Annuler</button></div>');
  if (a === 'doimp') {
    try { const v = $('impT').value.trim().replace(/^(LUXO1|SCHW1|XLB1):/, ''); const o = JSON.parse(decodeURIComponent(escape(atob(v)))); if (!o || typeof o !== 'object' || !('xp' in o)) throw 0; S = Object.assign(blank(), o); save(); show('home'); toast('Progression importée'); }
    catch (er) { toast('Code invalide'); }
  }
  if (a === 'rst') openSheet('<h2>Tout effacer ?</h2><p>XP, série, communes et révisions seront supprimées de ce téléphone. Exporte d\'abord si tu veux garder une copie.</p><div class="row"><button class="btn ghost" data-close>Annuler</button><button class="btn red" data-pn="dorst">Effacer</button></div>');
  if (a === 'dorst') { S = blank(); save(); show('home'); toast('Progression remise à zéro'); }
});
$('sheetBg').addEventListener('click', closeSheet);
$('mBtn').addEventListener('click', menuSheet);

/* ---------- Séance d'exercices ---------- */
const KIND = {trad: 'Traduis en luxembourgeois', qcm: 'Choisis la bonne traduction', ordre: 'Remets les mots dans l\'ordre', trou: 'Complète la phrase', inv: 'Traduis en français', pairs: 'Associe les paires'};
const PRAISE = ['Super !', 'Exact !', 'Genau !', 'Parfait !', 'Bravo !', 'Gutt gemaach !'];
function start(kind, L) {
  daily();
  if (kind === 'lesson' && S.lives <= 0) { toast('Plus de cœurs aujourd\'hui : fais tes révisions pour en regagner.'); return; }
  const ex = kind === 'lesson' ? buildLesson(L) : kind === 'rev' ? buildRev() : buildAudit();
  if (!ex.length) { toast('Aucune révision à faire aujourd\'hui.'); return; }
  sess = {kind, L, ex, i: 0, checked: false, xp: 0, okN: 0, streak: 0, best: 0}; view = 'ex'; closeSheet(); renderEx(); window.scrollTo(0, 0);
}
function renderEx() {
  stats();
  const s = sess, e = s.ex[s.i], it = e.item;
  let body = '';
  if (e.type === 'pairs') {
    e.state = e.state || {left: shuffle(e.items), right: shuffle(e.items), sel: null, matched: [], miss: []};
    const st = e.state, cls = (x, side) => 'w' + (st.matched.includes(x) ? ' gone' : '') + (st.sel && st.sel.side === side && st.sel.x === x ? ' on' : '');
    body = '<div class="pairs"><div class="col">' + st.left.map((x, k) => '<button class="' + cls(x, 'l') + '" data-pl="' + k + '">' + esc(x.fr) + '</button>').join('') + '</div><div class="col">' +
      st.right.map((x, k) => '<button class="' + cls(x, 'r') + '" data-pr="' + k + '">' + esc(x.lu) + '</button>').join('') + '</div></div>';
  } else if (e.type === 'qcm') {
    body = '<p class="q">' + esc(it.fr) + '</p><div class="opts">' + e.opts.map((o, k) => '<button class="opt' + (e.pick === o ? ' on' : '') + '" data-opt="' + k + '"' + (s.checked ? ' disabled' : '') + '>' + esc(o) + '</button>').join('') + '</div>';
  } else if (e.type === 'ordre') {
    body = '<p class="q">' + esc(it.fr) + '</p><div class="ans">' + e.placed.map((t, k) => '<button class="w" data-back="' + k + '">' + esc(e.tokens[t]) + '</button>').join('') + '</div><div class="bank">' +
      e.tokens.map((t, k) => '<button class="w' + (e.placed.includes(k) ? ' ghost' : '') + '" data-tok="' + k + '">' + esc(t) + '</button>').join('') + '</div>';
  } else {
    let q;
    if (e.type === 'inv') q = esc(it.lu);
    else if (e.type === 'trou') q = it.lu.split(' ').map(w => soft(w) === e.gap ? '<span class="gap">&nbsp;</span>' + esc(w.replace(e.gap, '')) : esc(w)).join(' ') + '<small>' + esc(it.fr) + '</small>';
    else q = esc(it.fr);
    body = '<p class="q">' + q + '</p><input class="inp" id="inp" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="off" enterkeyhint="done" placeholder="' + (e.type === 'inv' ? 'En français…' : 'En luxembourgeois…') + '" value="' + esc(e.given || '') + '"' + (s.checked ? ' disabled' : '') + '>' +
      (e.type !== 'inv' && !s.checked ? '<div class="keys">' + ['ë', 'é', 'ä', 'É', 'Ä'].map(c => '<button data-key="' + c + '" tabindex="-1" aria-label="Insérer ' + c + '">' + c + '</button>').join('') + '</div>' : '');
  }
  const title = s.kind === 'audit' ? 'Test de placement' : s.kind === 'rev' ? 'Révisions' : s.L.commune;
  app.innerHTML = '<div class="ex"><div class="exh"><button class="x" data-quit aria-label="Quitter">×</button><div class="bar"><i style="width:' + Math.round((s.i + (s.checked ? 1 : 0)) / s.ex.length * 100) + '%"></i></div>' +
    (s.kind === 'lesson' ? '<span class="chip"><svg viewBox="0 0 24 24"><path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z" fill="#ef3340"/></svg><b>' + S.lives + '</b></span>' : '') + '</div>' +
    '<div class="exb"><div class="kind">' + esc(title) + ' · ' + esc(KIND[e.type]) + '</div>' + body + '</div>' + footer() + '</div>';
  const inp = $('inp'); if (inp && !s.checked && matchMedia('(pointer:fine)').matches) inp.focus();
  if (s.checked) { const g = app.querySelector('[data-next]'); if (g) g.focus({preventScroll: true}); }
}
function footer() {
  const s = sess, e = s.ex[s.i];
  if (!s.checked) {
    if (e.type === 'pairs') return '<div class="fb"><div class="in"><div class="acts"><button class="skip" data-skip>Je ne sais pas</button></div></div></div>';
    const can = e.type === 'qcm' ? !!e.pick : e.type === 'ordre' ? e.placed.length > 0 : true;
    return '<div class="fb"><div class="in"><div class="acts"><button class="skip" data-skip>Passer</button><button class="btn green" data-check ' + (can ? '' : 'disabled') + '>Vérifier</button></div></div></div>';
  }
  const r = e.result, h = r === 'ok' ? (s.streak >= 3 ? s.streak + ' d\'affilée !' : PRAISE[s.i % PRAISE.length]) : r === 'al' ? 'Presque !' : 'Pas tout à fait';
  let ref = '';
  if (e.type === 'pairs') ref = r === 'ok' ? '' : '<div class="ref">' + e.items.map(x => esc(x.fr) + ' = ' + esc(x.lu)).join(' · ') + '</div>';
  else if (r !== 'ok' || e.type === 'trou') ref = '<div class="ref">' + (e.type === 'inv' ? esc(e.item.fr) : esc(e.item.lu)) + '</div>';
  const w = r === 'ok' ? (e.item && e.item.v ? why(e) : []) : why(e);
  return '<div class="fb ' + r + '"><div class="in"><div class="why"><h3>' + h + '</h3>' + ref + w.map(t => '<p>' + esc(t) + '</p>').join('') + '</div><div class="acts"><button class="btn ' + (r === 'ko' ? 'red' : r === 'al' ? 'gold' : 'green') + '" data-next>Continuer</button></div></div></div>';
}
function check(skip) {
  const s = sess, e = s.ex[s.i]; if (s.checked) return;
  const it = e.item; let r;
  if (e.type === 'pairs') { r = skip || e.state.miss.length ? 'ko' : 'ok'; e.items.forEach(x => srsHit(x, skip || e.state.miss.includes(x) ? 'ko' : 'ok', '')); }
  else {
    if (skip) { r = 'ko'; e.given = ''; }
    else if (e.type === 'qcm') { if (!e.pick) return; e.given = e.pick; r = e.pick === it.lu ? 'ok' : 'ko'; }
    else if (e.type === 'ordre') { if (!e.placed.length) return; e.given = e.placed.map(k => e.tokens[k]).join(' '); r = e.given === words(it.lu).join(' ') ? 'ok' : 'ko'; }
    else {
      e.given = $('inp').value;
      r = e.type === 'inv' ? gradeFr(e.given, it) : e.type === 'trou' ? grade(e.given, [e.gap]) : grade(e.given, [it.lu].concat(it.alt || []));
      if (!r) { $('inp').focus(); return; }
    }
    if (s.kind !== 'audit') srsHit(it, r, e.given);
  }
  e.result = r; s.checked = true;
  s.streak = r === 'ok' ? s.streak + 1 : 0; s.best = Math.max(s.best, s.streak);
  const xp = s.kind === 'audit' ? 0 : r === 'ok' ? 10 : r === 'al' ? 5 : 0;
  s.xp += xp; gainXp(xp); if (r !== 'ko') s.okN += r === 'ok' ? 1 : .5;
  if (s.kind === 'lesson' && r === 'ko') S.lives = Math.max(0, S.lives - 1);
  save(); renderEx();
}
function next() {
  const s = sess;
  if (s.kind === 'lesson' && S.lives <= 0 && s.i < s.ex.length - 1) { endScreen(true); return; }
  s.i++; s.checked = false;
  if (s.i >= s.ex.length) endScreen(false); else { renderEx(); window.scrollTo(0, 0); }
}
const BADGE = '<svg class="badge" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="64" r="50" fill="#c99a00"/><circle cx="60" cy="58" r="50" fill="#ffc800"/><circle cx="60" cy="58" r="38" fill="#ffd94d"/><path d="M60 30l8.5 17.3 19 2.8-13.8 13.4 3.3 19L60 73.6 43 82.5l3.3-19L32.5 50.1l19-2.8z" fill="#fff"/></svg>';
function endScreen(out) {
  const s = sess, score = Math.round(s.okN / Math.max(1, s.ex.length) * 100); let line = '', bonus = 0, title;
  if (!out) {
    if (s.kind === 'lesson') { const prev = S.done[s.L.id]; S.done[s.L.id] = {score: Math.max(score, prev && !prev.audit ? prev.score : 0), date: today()}; S.unlocked = Math.max(S.unlocked, s.L.idx + 2); bonus = 20; gainXp(20); const nx = LESSONS[s.L.idx + 1]; line = nx ? 'Prochaine commune débloquée : ' + nx.commune + '.' : 'Tu as débloqué toutes les communes disponibles !'; title = s.L.commune + ' débloquée !'; }
    else if (s.kind === 'audit') { let k = 0; while (k < s.ex.length && s.ex[k].result === 'ok') k++; S.unlocked = Math.max(S.unlocked, Math.min(LESSONS.length, k + 1)); for (let j = 0; j < k; j++) if (!S.done[LESSONS[j].id]) S.done[LESSONS[j].id] = {score: 100, date: today(), audit: 1}; S.audit = true; line = k ? k + ' commune' + (k > 1 ? 's' : '') + ' validée' + (k > 1 ? 's' : '') + ' d\'office.' : 'On part du début, c\'est parfait pour poser les bases.'; title = 'Test terminé'; }
    else { S.lives = Math.min(MAXL, S.lives + 2); line = '+2 cœurs récupérés.'; title = 'Révisions faites !'; }
    save();
  } else { line = 'Plus de cœurs pour aujourd\'hui. Fais tes révisions pour en regagner, puis reviens.'; title = 'Pause !'; }
  stats(); view = 'end';
  app.innerHTML = '<div class="end">' + (out ? '' : BADGE) + '<h1>' + esc(title) + '</h1><p>' + esc(line) + '</p><div class="big"><div class="g"><b>+' + (s.xp + bonus) + '</b><span>XP</span></div><div class="v"><b>' + score + '%</b><span>justes</span></div><div class="s"><b>' + s.best + '</b><span>meilleure série</span></div></div><button class="btn green w" data-go="home">Continuer</button></div>';
}

/* ---------- Associer les paires ---------- */
function pairTap(side, k) {
  const e = sess.ex[sess.i], st = e.state; if (sess.checked) return;
  const x = (side === 'l' ? st.left : st.right)[k]; if (!x || st.matched.includes(x)) return;
  if (!st.sel || st.sel.side === side) { st.sel = {side, x}; renderEx(); return; }
  if (st.sel.x === x) { st.matched.push(x); st.sel = null; if (st.matched.length === e.items.length) { check(); return; } renderEx(); }
  else {
    const other = st.sel.x; [other, x].forEach(m => { if (!st.miss.includes(m)) st.miss.push(m); });
    st.sel = null; renderEx();
    const bad = [...app.querySelectorAll('[data-pl],[data-pr]')].filter(b => { const isL = b.dataset.pl != null, v = isL ? st.left[+b.dataset.pl] : st.right[+b.dataset.pr]; return (isL ? 'l' : 'r') === side ? v === x : v === other; });
    bad.forEach(b => b.classList.add('bad')); setTimeout(() => bad.forEach(b => b.classList.remove('bad')), 650);
  }
}

/* ---------- Clics et clavier ---------- */
app.addEventListener('click', e => {
  const t = e.target.closest('button,[data-les]'); if (!t) return;
  if (t.dataset.les) { const L = LESSONS.find(l => l.id === t.dataset.les); if (t.tagName === 'BUTTON' && !locked(L)) start('lesson', L); else communeSheet(L); return; }
  if (t.dataset.go) { const g = t.dataset.go; if (g === 'rev') start('rev'); else if (g === 'audit') start('audit'); else show(g); return; }
  if (!sess || view !== 'ex') return;
  const ex = sess.ex[sess.i];
  if (t.hasAttribute('data-quit')) { show('home'); return; }
  if (t.hasAttribute('data-check')) { check(); return; }
  if (t.hasAttribute('data-skip')) { check(true); return; }
  if (t.hasAttribute('data-next')) { next(); return; }
  if (sess.checked) return;
  if (t.dataset.opt != null) { ex.pick = ex.opts[+t.dataset.opt]; renderEx(); return; }
  if (t.dataset.tok != null) { const k = +t.dataset.tok; if (!ex.placed.includes(k)) ex.placed.push(k); renderEx(); return; }
  if (t.dataset.back != null) { ex.placed.splice(+t.dataset.back, 1); renderEx(); return; }
  if (t.dataset.pl != null) { pairTap('l', +t.dataset.pl); return; }
  if (t.dataset.pr != null) { pairTap('r', +t.dataset.pr); return; }
  if (t.dataset.key) { const i = $('inp'); const a = i.selectionStart ?? i.value.length, b = i.selectionEnd ?? a; i.value = i.value.slice(0, a) + t.dataset.key + i.value.slice(b); i.focus(); i.setSelectionRange(a + 1, a + 1); ex.given = i.value; }
});
app.addEventListener('mousedown', e => { if (e.target.closest('[data-key]')) e.preventDefault(); });   // garde le clavier ouvert
app.addEventListener('input', e => { if (e.target.id === 'inp' && sess) sess.ex[sess.i].given = e.target.value; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSheet(); return; }
  if (view === 'home' && e.key === 'Enter' && e.target.matches('[data-les]') && e.target.tagName !== 'BUTTON') { e.preventDefault(); communeSheet(LESSONS.find(l => l.id === e.target.dataset.les)); return; }
  if (view !== 'ex' || !sess) return;
  const ex = sess.ex[sess.i], inInput = e.target.id === 'inp';
  if (e.key === 'Enter') {
    if (e.target.closest('button') && !inInput && !e.target.matches('[data-next],[data-check]')) return;
    e.preventDefault(); if (inInput) e.target.blur(); sess.checked ? next() : check(); return;
  }
  if (sess.checked || inInput) return;
  if (ex.type === 'qcm' && /^[1-4]$/.test(e.key) && ex.opts[+e.key - 1]) { ex.pick = ex.opts[+e.key - 1]; renderEx(); }
  if (ex.type === 'ordre' && e.key === 'Backspace' && ex.placed.length) { e.preventDefault(); ex.placed.pop(); renderEx(); }
});
document.querySelector('.logo').addEventListener('click', () => show('home'));

/* ---------- Service worker : hors ligne + mises à jour ---------- */
let swReg = null;
function askVersion() {
  const c = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (c) c.postMessage('version');
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.version) { const v = $('ver'); if (v) v.textContent = 'v' + ev.data.version; } });
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    const offer = () => { if (reg.waiting && navigator.serviceWorker.controller) $('update').hidden = false; };
    offer();
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') offer(); }); });
    // Vérifie s'il y a du nouveau à chaque retour dans l'appli (utile sur iPhone).
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  $('updBtn').addEventListener('click', () => { if (swReg && swReg.waiting) swReg.waiting.postMessage('skipWaiting'); });
}

/* ---------- Démarrage ---------- */
fetch('lessons.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(data => {
  P = data; G = P.grammaire || {}; GOAL = P.objectif_journalier || 50;
  P.unites.forEach(u => u.lecons.forEach(l => { l.unite = u; l.idx = LESSONS.length; LESSONS.push(l); }));
  LESSONS.forEach(l => l.items.forEach(it => { it.key = l.id + '|' + it.lu; it.lecon = l; IDX[it.key] = it; }));
  daily(); show('home');
}).catch(() => { app.innerHTML = '<p class="loading">Impossible de charger les leçons. Ouvre l\'appli une fois avec du réseau pour la préparer au mode hors ligne.</p>'; });
})();
