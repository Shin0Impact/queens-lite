// Scoring.
// Each queen earns up to 100 points: 100 x T / (T + seconds since the
// previous queen), where T is 2 seconds per row of the board. The puzzle's
// points are multiplied by its difficulty and then by your streak (up to 10x).

const LEVELS = [
  { name: 'Easy', mult: 1, max: 4 },
  { name: 'Medium', mult: 1.5, max: 9 },
  { name: 'Hard', mult: 2, max: 16 },
  { name: 'Expert', mult: 3, max: Infinity },
];
const STEP_WEIGHT = { single: 0, blocked: 0, err: 0, every: 1, look: 3, chain: 5, none: 8 };
const MAX_STREAK_MULT = 10;

let found, lastFoundAt, helped;

Object.assign(ST, Object.assign({ total: 0, scoreStreak: 0, bestStreak: 0, recent: [], seen: [], playing: false }, ST));

// A page reload in the middle of a puzzle counts as leaving it unfinished.
if (ST.playing) { ST.scoreStreak = 0; ST.playing = false; save(); }

// Rates a puzzle by solving it with the hint logic and adding up how hard
// each step was.
function rateDifficulty() {
  const savedMarks = marks, savedAuto = S.auto;
  marks = new Int8Array(P.n * P.n);
  S.auto = true;
  let effort = 0;
  for (let i = 0; i < 300; i++) {
    if (analyze().q.length === P.n) break;
    const h = findHint();
    effort += h.type === 'squeeze' ? (h.k === 1 ? 1 : 2 * h.k) : STEP_WEIGHT[h.type] || 0;
    if (!h.act) break;
    const v = h.act === 'q' ? 2 : h.act === 'clear' ? 0 : 1;
    h.targets.forEach(t => { marks[t] = v; });
  }
  marks = savedMarks;
  S.auto = savedAuto;
  const level = LEVELS.find(l => effort <= l.max);
  return { effort, name: level.name, mult: level.mult };
}

function resetScoreState() {
  found = new Map();
  lastFoundAt = 0;
  helped = false;
  renderScoreStrip();
}

const streakMult = streak => Math.min(Math.max(streak, 1), MAX_STREAK_MULT);
const puzzleCode = () => P.n + '-' + P.seed;

// Called when a correct queen goes on the board for the first time.
function queenFound(i, byHelp) {
  const row = (i / P.n) | 0;
  if (found.has(row)) return;
  const t = now() / 1000;
  const dt = Math.max(0, t - lastFoundAt);
  const T = 2 * P.n;
  found.set(row, byHelp ? 0 : Math.round(100 * T / (T + dt)));
  lastFoundAt = t;
}

function markHelped() {
  if (helped) return;
  helped = true;
  breakStreak();
}

function breakStreak() {
  ST.scoreStreak = 0;
  save();
  renderScoreStrip();
}

function markPlaying() {
  if (ST.playing) return;
  ST.playing = true;
  save();
}

// Works out the score for a solved puzzle and returns the lines for the
// end screen.
function finishScore() {
  ST.playing = false;
  for (let r = 0; r < P.n; r++) if (!found.has(r)) found.set(r, 0);
  const base = [...found.values()].reduce((a, b) => a + b, 0);
  const code = puzzleCode();
  if (ST.seen.includes(code)) {
    save();
    renderScoreStrip();
    return ["You've solved this puzzle before, so it doesn't add points."];
  }
  ST.seen.push(code);
  if (ST.seen.length > 500) ST.seen.shift();

  if (!helped) ST.scoreStreak++;
  ST.bestStreak = Math.max(ST.bestStreak, ST.scoreStreak);
  const sm = helped ? 1 : streakMult(ST.scoreStreak);
  const score = Math.round(base * P.diff.mult * sm);
  ST.total += score;
  ST.recent.unshift({ n: P.n, level: P.diff.name, score, d: Date.now() });
  ST.recent.length = Math.min(ST.recent.length, 20);
  save();
  renderScoreStrip();
  saveSharedScore();

  const lines = [`Queens: ${base} points. ${P.diff.name} puzzle: ×${P.diff.mult}. Streak: ×${sm}.`];
  lines.push(`Score: ${score.toLocaleString()}. Total: ${ST.total.toLocaleString()}.`);
  if (helped) lines.push('You used help, so your streak starts again from the next puzzle.');
  return lines;
}

function renderScoreStrip() {
  const el = $('#scoreStrip');
  if (!el || !P) return;
  el.querySelector('[data-s=total]').textContent = ST.total.toLocaleString();
  el.querySelector('[data-s=streak]').textContent = '×' + streakMult(ST.scoreStreak + (helped ? 0 : 1));
  el.querySelector('[data-s=level]').textContent = P.diff ? `${P.diff.name} ×${P.diff.mult}` : '';
}
