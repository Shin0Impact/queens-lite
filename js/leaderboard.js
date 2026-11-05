// Leaderboard. The shared board ranks players by total score. Inside Claude it
// is stored with the artifact; in the Android app and on the web it is stored
// in Firebase (see online.js). Your own times and recent scores stay on this
// device. Players are shown by the name they pick, never by account name.

let lbMine = null, lbCanWrite = true;
let lbTab = 'all', lbWrite = Promise.resolve();

const MAX_TIME = 36000;
const validTime = v => typeof v === 'number' && isFinite(v) && v > 0 && v < MAX_TIME;
const validScore = v => typeof v === 'number' && isFinite(v) && v >= 0 && v < 1e12;

// Player name: everyone starts with a default name and can change it.
function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
if (!ST.name) { ST.name = 'Player ' + (1000 + Math.floor(Math.random() * 9000)); save(); }
function setName(name) {
  const clean = cleanName(name);
  if (!clean || clean === ST.name) return;
  ST.name = clean;
  save();
  saveSharedScore();
  document.querySelectorAll('.nameIn').forEach(el => { el.value = ST.name; });
}

// Older saves only had one best time per size. Start the top list from it.
ST.top = ST.top || {};
ST.dailies = ST.dailies || {};
for (const [n, s] of Object.entries(ST.best)) if (!ST.top[n]) ST.top[n] = [{ s, d: null }];

// Shared board inside Claude, stored with the artifact.
const ClaudeBoard = {
  kind: 'claude', db: null, user: null, id: null, canWrite: true,
  async init() {
    if (typeof claude === 'undefined' || !claude.use) return false;
    [this.db, this.user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!this.db) return false;
    if (this.user) {
      this.id = await this.user.id();
      if ((await this.user.can('data.write')) === false) this.canWrite = false;
    }
    return true;
  },
  async loadMine() {
    if (!this.id) return null;
    const snap = await this.db.doc('scores/' + this.id).get();
    return snap.exists ? structuredClone(snap.data()) : null;
  },
  async save(doc) {
    if (!this.id) throw new Error('No player id');
    await this.db.doc('scores/' + this.id).set(doc);
  },
  async top() {
    const snap = await this.db.collection('scores').limit(500).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data() || {}));
  },
};

// Use the Claude board inside Claude, otherwise the online board if it is set up.
let scoreBoard = null;
(async () => {
  for (const b of [ClaudeBoard, OnlineBoard]) {
    try { if (await b.init()) { scoreBoard = b; break; } } catch (e) {}
  }
  if (!scoreBoard) return;
  lbCanWrite = scoreBoard.canWrite;
  try {
    lbMine = await scoreBoard.loadMine();
    // Playing on another device may have raised the shared total.
    if (lbMine && validScore(lbMine.total) && lbMine.total > ST.total) { ST.total = lbMine.total; save(); renderScoreStrip(); }
  } catch (e) {}
})();

// Called by game.js when a puzzle is solved without help. Local only.
function recordResult(n, s, isDaily, dayKey) {
  if (isDaily) {
    if (!(dayKey in ST.dailies) || s < ST.dailies[dayKey]) ST.dailies[dayKey] = s;
    const days = Object.keys(ST.dailies).sort();
    while (days.length > 30) delete ST.dailies[days.shift()];
  } else {
    const list = (ST.top[n] = ST.top[n] || []);
    list.push({ s, d: Date.now() });
    list.sort((a, b) => a.s - b.s);
    list.length = Math.min(list.length, 10);
  }
  save();
}

// Writes this player's name and total to the shared board.
function saveSharedScore() {
  if (!scoreBoard || !lbCanWrite) return;
  const doc = { name: ST.name, total: ST.total, bestStreak: ST.bestStreak, solved: ST.solved, updated: Date.now() };
  if (lbMine && lbMine.name === doc.name && lbMine.total === doc.total && lbMine.bestStreak === doc.bestStreak) return;
  const before = lbMine;
  lbMine = doc;
  lbWrite = lbWrite
    .then(() => scoreBoard.save(doc))
    .catch(e => {
      lbMine = before;
      if (scoreBoard.kind === 'claude' && e && e.code === 'invalid_argument') lbCanWrite = false;
    });
}

// Board UI.
document.querySelectorAll('#lbTabs button').forEach(b => {
  b.onclick = () => { lbTab = b.dataset.t; renderBoard(); };
});
$('#trophy').onclick = () => { $('#lb').classList.add('open'); renderBoard(); };
$('#lbClose').onclick = () => $('#lb').classList.remove('open');
$('#lb').onclick = e => { if (e.target.id === 'lb') e.target.classList.remove('open'); };
document.querySelectorAll('.nameIn').forEach(el => {
  el.value = ST.name;
  el.addEventListener('change', () => { setName(el.value); el.value = ST.name; if (lbTab === 'all') renderBoard(); });
});

function row(rank, name, value, extra, isMe) {
  const li = document.createElement('li');
  if (isMe) li.className = 'me';
  const r = document.createElement('span'); r.className = 'rk'; r.textContent = rank;
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name;
  if (extra) { const x = document.createElement('small'); x.textContent = extra; nm.appendChild(x); }
  const t = document.createElement('span'); t.className = 'tm'; t.textContent = value;
  li.append(r, nm, t);
  return li;
}
function message(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  return li;
}
function heading(text) {
  const li = document.createElement('li');
  li.className = 'head';
  li.textContent = text;
  return li;
}

let lbRequest = 0;
async function renderBoard() {
  document.querySelectorAll('#lbTabs button').forEach(b => b.classList.toggle('sel', b.dataset.t === lbTab));
  $('#lbMe').style.display = lbTab === 'me' ? '' : 'none';
  const list = $('#lbList'), note = $('#lbNote');
  list.innerHTML = '';
  note.textContent = '';

  if (lbTab === 'me') {
    $('#meTotal').textContent = ST.total.toLocaleString();
    $('#meStreak').textContent = ST.scoreStreak;
    $('#meBest').textContent = ST.bestStreak;
    list.appendChild(heading('Recent puzzles'));
    if (!ST.recent.length) list.appendChild(message('Solve a puzzle to see your scores here.'));
    ST.recent.slice(0, 10).forEach(e => list.appendChild(row('', `${e.n}×${e.n}`, e.score.toLocaleString(), e.level, false)));
    list.appendChild(heading('Best times without help'));
    let any = false;
    for (let n = 5; n <= 10; n++) {
      const top = ST.top[n];
      if (top && top.length) { any = true; list.appendChild(row('', `${n}×${n}`, fmt(top[0].s), '', false)); }
    }
    if (!any) list.appendChild(message('No times yet.'));
    note.textContent = 'Your times and recent scores are saved on this device.';
    return;
  }

  if (!scoreBoard) {
    list.appendChild(message("The online leaderboard isn't available in this copy of the game. Your own scores are under You."));
    return;
  }
  if (!lbCanWrite) note.textContent = "You can see this board, but your score isn't saved to it. The owner can invite you by email as an Editor so your score counts.";
  list.appendChild(message('Loading…'));
  const req = ++lbRequest;
  const timer = setTimeout(() => {
    if (req !== lbRequest) return;
    list.innerHTML = '';
    list.appendChild(message("Couldn't reach the leaderboard. Check your connection and try again."));
  }, 10000);
  try {
    const rows = await scoreBoard.top(50);
    if (req !== lbRequest) return;
    clearTimeout(timer);
    const entries = [];
    for (const d of rows) {
      if (validScore(d.total) && d.total > 0) entries.push({ id: d.id, total: d.total, name: cleanName(d.name) || 'Player' });
    }
    entries.sort((a, b) => b.total - a.total);
    list.innerHTML = '';
    if (!entries.length) { list.appendChild(message('No scores yet. Solve a puzzle to be first.')); return; }
    entries.slice(0, 50).forEach((e, i) => {
      const isMe = e.id === scoreBoard.id;
      list.appendChild(row(i + 1, isMe ? ST.name : e.name, e.total.toLocaleString(), isMe ? 'You' : '', isMe));
    });
  } catch (e) {
    if (req !== lbRequest) return;
    clearTimeout(timer);
    list.innerHTML = '';
    list.appendChild(message("Couldn't load the leaderboard right now."));
  }
}
