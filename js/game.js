// Game state, board drawing, input, timer and game modes.

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('ql.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ql.' + k, JSON.stringify(v)); } catch (e) {} },
};

const S = Object.assign({ auto: true, dbl: true, conf: true, timer: true, lives: true, mem: false, blitz: false, sym: false, theme: 'dark', size: 8 }, store.get('settings', {}));
const ST = Object.assign({ solved: 0, best: {}, top: {}, dailies: {}, streak: 0, lastDaily: '' }, store.get('stats', {}));
const PAL = [[174, 50, 62], [100, 50, 72], [25, 40, 52], [262, 55, 72], [2, 62, 68], [212, 30, 72], [330, 75, 82], [46, 80, 62], [22, 85, 66], [198, 70, 74]];
const SYM = '●▲■◆★♥✚◐✿☾';

// P: puzzle {n, reg, sol, seed}. marks: 0 empty, 1 ✕, 2 queen.
let P, marks, undoStack, lives, hints, penalty, done, cells, ATT, UNITS;
let elapsed, startT, tick, memTimer, memOn = false, awarded = new Set(), daily = false, H = null;

const board = $('#board');

function save() { store.set('settings', S); store.set('stats', ST); }
function dayKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function todayKey() { return dayKey(new Date()); }

function applyTheme() {
  const root = document.documentElement;
  const light = S.theme === 'light' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  root.classList.toggle('light', light);
  $('#tapHelp').textContent = S.dbl
    ? 'Tap for ✕, double-tap for a queen. Drag to mark several squares.'
    : 'Tap once for ✕, twice for a queen, and again to clear. Drag to mark several squares.';
}

function start(n, seed, isDaily) {
  if (P && !done && (startT || elapsed > 0)) { ST.playing = false; breakStreak(); }
  daily = !!isDaily;
  P = generate(n, mulberry32(seed));
  P.seed = seed;
  marks = new Int8Array(n * n);
  undoStack = []; lives = 3; hints = 0; penalty = 0; done = false; elapsed = 0; startT = null;
  clearHint();
  build();
  P.diff = rateDifficulty();
  resetScoreState();
  stopTimer();
  showTime();

  $('#code').textContent = 'Puzzle ' + n + '-' + seed;
  const modes = [S.blitz && 'Time attack', S.lives && 'Lives', S.mem && 'Memory'].filter(Boolean);
  $('#mode').textContent = daily ? 'Daily ' + String(seed).replace(/(\d{4})(\d\d)(\d\d)/, '$3/$2') : modes.join(', ') || 'Classic';
  document.querySelectorAll('#sizes button').forEach(b => b.classList.toggle('sel', +b.dataset.n === n && !daily));
  $('#daily').classList.toggle('on', daily);

  clearTimeout(memTimer);
  memOn = false; awarded = new Set();
  board.classList.remove('mem');
  const mem = S.mem && !daily;
  $('#peek').style.display = mem ? 'flex' : 'none';
  if (mem) memTimer = setTimeout(() => { if (!done) { memOn = true; board.classList.add('mem'); } }, 10000);
}
function newRandom() { start(S.size, (Math.random() * 1e6) | 0, false); }

function build() {
  const n = P.n;
  board.innerHTML = '';
  board.style.gridTemplateColumns = board.style.gridTemplateRows = `repeat(${n},1fr)`;
  sizeFont();
  cells = [];
  for (let i = 0; i < n * n; i++) {
    const g = P.reg[i], e = document.createElement('div');
    const [h, s, l] = PAL[g % PAL.length];
    e.className = 'cell';
    e.style.cssText = `--h:${h};--s:${s};--l:${l}`;
    e.innerHTML = (S.sym ? `<span class="g">${SYM[g]}</span>` : '') + '<span class="m"></span>';
    e.dataset.i = i;
    board.appendChild(e);
    cells.push(e);
  }

  // All grid and region lines live in one SVG so the outlines join cleanly.
  let region = '', grid = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c, g = P.reg[i];
    if (c < n - 1) { const d = `M${c + 1} ${r}V${r + 1}`; if (P.reg[i + 1] !== g) region += d; else grid += d; }
    if (r < n - 1) { const d = `M${c} ${r + 1}H${c + 1}`; if (P.reg[i + n] !== g) region += d; else grid += d; }
  }
  board.insertAdjacentHTML('beforeend',
    `<svg id="lines" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none">` +
    `<path class="gl" vector-effect="non-scaling-stroke" d="${grid}"/>` +
    `<path class="rl" vector-effect="non-scaling-stroke" d="${region}"/></svg>`);

  // For each square, the squares a queen there would block.
  ATT = [];
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n, a = [];
    for (let j = 0; j < n * n; j++) {
      if (j === i) continue;
      const rr = (j / n) | 0, cc = j % n;
      if (rr === r || cc === c || P.reg[j] === P.reg[i] || (Math.abs(rr - r) < 2 && Math.abs(cc - c) < 2)) a.push(j);
    }
    ATT.push(a);
  }
  // Every row, column and color as a list of squares.
  UNITS = [];
  for (let k = 0; k < n; k++) {
    const R = [], C = [], G = [];
    for (let i = 0; i < n * n; i++) {
      if (((i / n) | 0) === k) R.push(i);
      if (i % n === k) C.push(i);
      if (P.reg[i] === k) G.push(i);
    }
    UNITS.push({ t: 'row', id: k, cells: R }, { t: 'col', id: k, cells: C }, { t: 'reg', id: k, cells: G });
  }
  update();
}
function sizeFont() { if (P) board.style.fontSize = Math.round(Math.min(innerWidth, 480) * 0.5 / P.n) + 'px'; }

// Queens on the board, queens that clash, and squares the queens block.
function analyze() {
  const N = P.n * P.n, q = [], bad = new Set(), cover = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (marks[i] === 2) q.push(i);
  for (const i of q) for (const j of ATT[i]) { cover[j] = 1; if (marks[j] === 2) { bad.add(i); bad.add(j); } }
  return { q, bad, cover };
}

const HEART = '<svg viewBox="0 0 24 24"><use href="#i-heart"/></svg>';
function update() {
  const { q, bad, cover } = analyze();
  cells.forEach((e, i) => {
    const m = marks[i];
    e.classList.toggle('q', m === 2);
    e.classList.toggle('x', m === 1);
    e.classList.toggle('ax', m === 0 && S.auto && cover[i] === 1);
    e.classList.toggle('bad', S.conf && bad.has(i));
  });
  $('#count').textContent = q.length + ' / ' + P.n + ' queens';
  $('#lives').innerHTML = S.lives && !daily ? [0, 1, 2].map(k => HEART.replace('<svg', k < lives ? '<svg' : '<svg class="gone"')).join('') : '';
  if (!done && q.length === P.n && bad.size === 0) win();
}

function setMark(i, v, batch) { if (marks[i] === v) return; batch.push([i, marks[i]]); marks[i] = v; }
function commit(batch) { if (batch.length) undoStack.push(batch); }
function flash(i) { const e = cells[i]; e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 350); }
const isAnswer = i => P.sol[(i / P.n) | 0] === i % P.n;

// Tapping a square.
let lastTap = { i: -1, t: 0 };
function tapCell(i) {
  if (done) return;
  startTimer();
  clearHint();
  let next = (marks[i] + 1) % 3;
  if (S.dbl) {
    const t = Date.now();
    if (lastTap.i === i && t - lastTap.t < 350 && lastTap.prev !== 2) {
      // Second tap: undo the ✕ from the first tap and place a queen instead.
      const b = undoStack.pop();
      if (b) for (let k = b.length - 1; k >= 0; k--) marks[b[k][0]] = b[k][1];
      next = 2;
      lastTap = { i: -1, t: 0 };
    } else {
      next = marks[i] === 0 ? 1 : 0;
      lastTap = { i, t, prev: marks[i] };
    }
  }
  const batch = [];
  if (next === 2 && S.lives && !daily && !isAnswer(i)) {
    lives--;
    setMark(i, 1, batch); commit(batch); flash(i); update();
    if (lives <= 0) lose('Out of lives');
    return;
  }
  setMark(i, next, batch);
  commit(batch);
  if (next === 2 && isAnswer(i)) queenFound(i, false);
  if (next === 2 && S.blitz && !daily && isAnswer(i) && !awarded.has(i)) { awarded.add(i); penalty -= 10; }
  update();
}

// A tap toggles a square; dragging paints ✕ (or erases ✕ if the drag started on one).
let drag = null;
board.addEventListener('pointerdown', e => {
  const t = e.target.closest('.cell');
  if (!t || done) return;
  board.setPointerCapture(e.pointerId);
  const i = +t.dataset.i;
  drag = { start: i, last: i, moved: false, paint: marks[i] === 1 ? 0 : 1, batch: [] };
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const t = el && el.closest && el.closest('.cell');
  if (!t) return;
  const i = +t.dataset.i;
  if (i === drag.last) return;
  if (!drag.moved) { drag.moved = true; startTimer(); clearHint(); paintCell(drag.start); }
  drag.last = i;
  paintCell(i);
});
function paintCell(i) {
  if (marks[i] === 2) return;
  if (drag.paint === 1 && marks[i] === 0) setMark(i, 1, drag.batch);
  else if (drag.paint === 0 && marks[i] === 1) setMark(i, 0, drag.batch);
  update();
}
board.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.moved) commit(drag.batch); else tapCell(drag.start);
  drag = null;
});
board.addEventListener('pointercancel', () => { if (drag && drag.moved) commit(drag.batch); drag = null; });

// Timer. It ticks once a second, only while the game is visible and running.
function now() { return elapsed + (startT ? Date.now() - startT : 0); }
function startTimer() {
  if (startT || done || document.hidden) return;
  startT = Date.now();
  markPlaying();
  restartTick();
}
function restartTick() {
  clearInterval(tick);
  if (startT && (S.timer || S.blitz)) tick = setInterval(showTime, 1000);
  showTime();
}
function stopTimer() { if (startT) { elapsed += Date.now() - startT; startT = null; } clearInterval(tick); }
function seconds() { return Math.floor(now() / 1000) + penalty; }
function fmt(s) { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function showTime() {
  const t = $('#time');
  if (S.blitz && !daily) {
    const left = P.n * 20 - seconds();
    t.textContent = fmt(left);
    t.style.color = left <= 10 ? 'var(--bad)' : '';
    if (left <= 0 && !done && startT) lose("Time's up");
  } else {
    t.style.color = '';
    t.textContent = S.timer ? fmt(seconds()) : '';
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimer();
  else if (elapsed > 0 && !done) startTimer();
});

function win() {
  done = true;
  stopTimer(); clearHint(); clearTimeout(memTimer);
  board.classList.remove('mem');
  const s = seconds(), n = P.n;
  ST.solved++;
  const lines = [`${n}×${n} in ${fmt(s)}.`];
  if (!hints && !(S.blitz && !daily)) recordResult(n, s, daily, P.seed);
  lines.push(...finishScore());
  if (!daily) {
    const best = ST.best[n];
    if (hints === 0 && (!best || s < best)) { ST.best[n] = s; lines.push(best ? 'New best time.' : 'Your first best time for this size.'); }
  } else {
    const k = todayKey(), yesterday = dayKey(new Date(Date.now() - 864e5));
    if (ST.lastDaily !== k) { ST.streak = ST.lastDaily === yesterday ? ST.streak + 1 : 1; ST.lastDaily = k; }
    lines.push(`Daily streak: ${ST.streak} ${ST.streak === 1 ? 'day' : 'days'}.`);
  }
  save();
  $('#endTitle').textContent = 'Solved';
  $('#endTxt').textContent = lines.join(' ');
  $('#end').classList.add('open');
}
function lose(msg) {
  done = true;
  ST.playing = false;
  breakStreak();
  stopTimer(); clearHint();
  board.classList.remove('mem');
  marks = new Int8Array(P.n * P.n);
  P.sol.forEach((c, r) => { marks[r * P.n + c] = 2; });
  update();
  $('#endTitle').textContent = msg;
  $('#endTxt').textContent = 'The solution is shown on the board.';
  $('#end').classList.add('open');
}

// Hint box.
function showHint() {
  if (done) return;
  startTimer(); clearHint();
  H = findHint();
  markHelped();
  hints++; penalty += 5; showTime();
  (H.unit || []).forEach(i => cells[i].classList.add('hu'));
  H.targets.forEach(i => cells[i].classList.add(H.kind === 'err' ? 'he' : H.act === 'q' ? 'hq' : 'ht'));
  $('#hintTitle').textContent = H.title;
  $('#hintTxt').innerHTML = H.why;
  $('#hintLegend').style.display = H.unit && H.unit.length && H.kind !== 'err' ? '' : 'none';
  const apply = $('#hintApply');
  apply.style.display = H.act ? '' : 'none';
  apply.textContent = H.act === 'q' ? 'Place queen' : H.act === 'clear' ? 'Remove it' : 'Mark ✕';
  $('#hintBox').classList.add('open');
}
function clearHint() {
  H = null;
  if (cells) cells.forEach(e => e.classList.remove('hu', 'ht', 'hq', 'he'));
  $('#hintBox').classList.remove('open');
}
$('#hint').onclick = showHint;
$('#hintClose').onclick = clearHint;
$('#hintApply').onclick = () => {
  if (!H || done) return;
  const b = [], v = H.act === 'q' ? 2 : H.act === 'clear' ? 0 : 1;
  H.targets.forEach(i => setMark(i, v, b));
  if (v === 2) H.targets.forEach(i => queenFound(i, true));
  commit(b); clearHint(); update();
};

// Solve 1: fixes a mistake if there is one, otherwise places a correct queen.
$('#solve1').onclick = () => {
  if (done) return;
  startTimer(); clearHint();
  const n = P.n, b = [];
  let target = -1;
  for (let i = 0; i < n * n && target < 0; i++) {
    if ((marks[i] === 2 && !isAnswer(i)) || (marks[i] === 1 && isAnswer(i))) { target = i; setMark(i, 0, b); }
  }
  if (target < 0) {
    const rows = [...Array(n).keys()].filter(r => marks[r * n + P.sol[r]] !== 2);
    if (!rows.length) return;
    const r = rows[(Math.random() * rows.length) | 0];
    target = r * n + P.sol[r];
    setMark(target, 2, b);
    queenFound(target, true);
  }
  markHelped();
  commit(b);
  hints++; penalty += 15;
  cells[target].classList.add('hq');
  setTimeout(() => cells[target] && cells[target].classList.remove('hq'), 1200);
  update(); showTime();
};

$('#undo').onclick = () => {
  if (done) return;
  clearHint();
  const b = undoStack.pop();
  if (!b) return;
  for (let k = b.length - 1; k >= 0; k--) marks[b[k][0]] = b[k][1];
  update();
};
$('#clear').onclick = () => {
  if (done) return;
  clearHint();
  const b = [];
  for (let i = 0; i < marks.length; i++) setMark(i, 0, b);
  commit(b); update();
};
$('#new').onclick = newRandom;

// Memory mode: hold Peek to see the colors again.
const peek = $('#peek');
peek.addEventListener('pointerdown', () => {
  if (!board.classList.contains('mem')) return;
  board.classList.remove('mem');
  penalty += 5; showTime();
});
const unpeek = () => { if (memOn && !done) board.classList.add('mem'); };
peek.addEventListener('pointerup', unpeek);
peek.addEventListener('pointerleave', unpeek);

$('#daily').onclick = () => start(8, todayKey(), true);
$('#code').onclick = () => { try { navigator.clipboard.writeText(P.n + '-' + P.seed); } catch (e) {} };
$('#endNext').onclick = () => { $('#end').classList.remove('open'); newRandom(); };
$('#endClose').onclick = () => $('#end').classList.remove('open');

for (let n = 5; n <= 10; n++) {
  const b = document.createElement('button');
  b.dataset.n = n;
  b.textContent = n + '×' + n;
  b.onclick = () => { S.size = n; save(); newRandom(); };
  $('#sizes').appendChild(b);
}
addEventListener('resize', sizeFont);
