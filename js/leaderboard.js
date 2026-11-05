// Leaderboard. The shared board ranks players by total score and is stored
// with the page. Your own times and recent scores are kept on this device.
// Players are shown by the name they pick in the game, never by account name.

let lbDb = null, lbUser = null, lbId = null, lbMine = null, lbCanWrite = true;
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

// Connect to the shared board when the page is opened inside Claude.
(async () => {
  if (typeof claude === 'undefined' || !claude.use) return;
  try {
    [lbDb, lbUser] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (lbUser) {
      lbId = await lbUser.id();
      if ((await lbUser.can('data.write')) === false) lbCanWrite = false;
    }
    if (lbDb && lbId) {
      const snap = await lbDb.doc('scores/' + lbId).get();
      if (snap.exists) {
        lbMine = structuredClone(snap.data());
        // Playing on another device may have raised the shared total.
        if (validScore(lbMine.total) && lbMine.total > ST.total) { ST.total = lbMine.total; save(); renderScoreStrip(); }
      }
    }
  } catch (e) {
    lbDb = null;
  }
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
  if (!lbDb || !lbId || !lbCanWrite) return;
  const doc = { name: ST.name, total: ST.total, bestStreak: ST.bestStreak, solved: ST.solved, updated: Date.now() };
  if (lbMine && lbMine.name === doc.name && lbMine.total === doc.total && lbMine.bestStreak === doc.bestStreak) return;
  lbMine = doc;
  lbWrite = lbWrite
    .then(() => lbDb.doc('scores/' + lbId).set(doc))
    .catch(e => { if (e && e.code === 'invalid_argument') lbCanWrite = false; });
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

  if (!lbDb) {
    list.appendChild(message("The shared board isn't available here. Open the game in Claude while signed in to see it. Your own scores are under You."));
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
    const snap = await lbDb.collection('scores').limit(500).get();
    if (req !== lbRequest) return;
    clearTimeout(timer);
    const entries = [];
    for (const d of snap.docs) {
      const data = d.data() || {};
      if (validScore(data.total) && data.total > 0) entries.push({ id: d.id, total: data.total, name: cleanName(data.name) || 'Player' });
    }
    entries.sort((a, b) => b.total - a.total);
    list.innerHTML = '';
    if (!entries.length) { list.appendChild(message('No scores yet. Solve a puzzle to be first.')); return; }
    entries.slice(0, 50).forEach((e, i) => {
      const isMe = e.id === lbId;
      list.appendChild(row(i + 1, isMe ? ST.name : e.name, e.total.toLocaleString(), isMe ? 'You' : '', isMe));
    });
  } catch (e) {
    if (req !== lbRequest) return;
    clearTimeout(timer);
    list.innerHTML = '';
    list.appendChild(message("Couldn't load the leaderboard right now."));
  }
}
