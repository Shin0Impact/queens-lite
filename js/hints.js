// Hint engine. Looks at the current board and finds the simplest logical
// step, then explains it in plain words. It uses the game state from game.js
// (P, marks, ATT, UNITS, analyze).

const NAMES = ['Teal', 'Green', 'Brown', 'Purple', 'Red', 'Slate', 'Pink', 'Yellow', 'Orange', 'Sky'];

// Name of a row, column or color. Colors are shown as a small colored tag.
function unitName(u) {
  if (u.t === 'row') return 'row ' + (u.id + 1);
  if (u.t === 'col') return 'column ' + (u.id + 1);
  const [h, s, l] = PAL[u.id % PAL.length];
  const sym = S.sym ? ' ' + SYM[u.id] : '';
  return `<span class="rc" style="--h:${h};--s:${s};--l:${l}">${NAMES[u.id]}${sym}</span>`;
}
const capitalize = s => s.replace(/^(row|column)/, m => m[0].toUpperCase() + m.slice(1));
function listNames(units) {
  const a = units.map(unitName);
  return a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
}
function lineWord(type, k) {
  const w = type === 'reg' ? 'color' : type === 'row' ? 'row' : 'column';
  return k === 1 ? w : w + 's';
}
const squares = k => k === 1 ? 'this square' : `these ${k} squares`;

function keyOf(type, i) {
  const n = P.n;
  return type === 'row' ? (i / n) | 0 : type === 'col' ? i % n : P.reg[i];
}

// Calls f with every k-sized combination of arr. Stops when f returns true.
function combos(arr, k, f) {
  const pick = [];
  (function rec(start) {
    if (pick.length === k) return f(pick.slice());
    for (let x = start; x < arr.length; x++) {
      pick.push(arr[x]);
      if (rec(x + 1)) return true;
      pick.pop();
    }
  })(0);
}

function clashReason(a, b) {
  const n = P.n;
  if (((a / n) | 0) === ((b / n) | 0)) return 'are in the same row';
  if (a % n === b % n) return 'are in the same column';
  if (P.reg[a] === P.reg[b]) return 'are both in ' + unitName({ t: 'reg', id: P.reg[a] });
  return 'are touching (diagonals count too)';
}

// Explains how each highlighted square would block the target square.
function blockReason(options, target) {
  const n = P.n, tr = (target / n) | 0, tc = target % n;
  const count = { row: 0, col: 0, color: 0, touch: 0 };
  for (const c of options) {
    if (((c / n) | 0) === tr) count.row++;
    else if (c % n === tc) count.col++;
    else if (P.reg[c] === P.reg[target]) count.color++;
    else count.touch++;
  }
  const color = unitName({ t: 'reg', id: P.reg[target] });
  const all = {
    row: 'All of them are in its row.',
    col: 'All of them are in its column.',
    color: `All of them are ${color}, the same color as this square.`,
    touch: 'All of them touch it.',
  };
  const keys = Object.keys(count).filter(k => count[k]);
  if (keys.length === 1) return all[keys[0]];
  const part = {
    row: x => x === 1 ? '1 is in its row' : `${x} are in its row`,
    col: x => x === 1 ? '1 is in its column' : `${x} are in its column`,
    color: x => x === 1 ? `1 is ${color} like it` : `${x} are ${color} like it`,
    touch: x => x === 1 ? '1 touches it' : `${x} touch it`,
  };
  const parts = keys.map(k => part[k](count[k]));
  const text = parts.slice(0, -1).join(', ') + (parts.length > 2 ? ',' : '') + ' and ' + parts.at(-1) + '.';
  return text[0].toUpperCase() + text.slice(1);
}

// Pretends a queen is on square c and follows forced moves. Returns the
// group that ends up with no open squares, or null if nothing breaks.
function simulate(c, isOpen, maxForced) {
  const hit = new Set(ATT[c]), placed = new Set([c]), chain = [];
  const openUnits = () => UNITS.filter(u => !u.cells.some(j => marks[j] === 2 || placed.has(j)));
  for (;;) {
    let forced = null;
    for (const u of openUnits()) {
      const left = u.cells.filter(j => isOpen(j) && !hit.has(j));
      if (!left.length) return { dead: Object.assign({ before: u.cells.filter(isOpen) }, u), chain };
      if (left.length === 1 && !forced) forced = { u, cell: left[0] };
    }
    if (!forced || chain.length >= maxForced) return null;
    chain.push(forced);
    placed.add(forced.cell);
    for (const j of ATT[forced.cell]) hit.add(j);
  }
}

function findHint() {
  const n = P.n, N = n * n, { q, bad, cover } = analyze();
  const isOpen = i => marks[i] === 0 && !cover[i];

  // Mistakes come first.
  if (bad.size) {
    const a = [...bad][0], b = ATT[a].find(j => bad.has(j) && marks[j] === 2);
    return { title: 'Two queens break a rule', why: `These two queens ${clashReason(a, b)}. Remove one of them.`, targets: [a, b], kind: 'err', type: 'err' };
  }
  for (const i of q) {
    if (P.sol[(i / n) | 0] === i % n) continue;
    const dead = UNITS.find(u => !u.cells.some(j => marks[j] === 2) && !u.cells.some(isOpen));
    const why = dead
      ? `With a queen here, ${unitName(dead)} has no open squares left, so it can't get a queen.`
      : "It doesn't break a rule yet, but the puzzle can't be finished with it here.";
    return { title: 'This queen is in the wrong place', why, targets: [i], unit: dead ? dead.cells : [], kind: 'err', act: 'clear', type: 'err' };
  }
  for (let i = 0; i < N; i++) {
    if (marks[i] === 1 && P.sol[(i / n) | 0] === i % n)
      return { title: 'This ✕ is a mistake', why: 'This square needs a queen.', targets: [i], kind: 'err', act: 'clear', type: 'err' };
  }

  // Squares the queens already block, when auto-mark is off.
  if (!S.auto) {
    const t = [];
    for (let i = 0; i < N; i++) if (marks[i] === 0 && cover[i]) t.push(i);
    if (t.length) return {
      title: `Mark ${squares(t.length)}`,
      why: 'Your queens already block them. Each one shares a row, column or color with a queen, or touches one.',
      targets: t, act: 'x', type: 'blocked',
    };
  }

  const open = UNITS.filter(u => !u.cells.some(j => marks[j] === 2))
    .map(u => Object.assign({}, u, { av: u.cells.filter(isOpen) }));

  // Only one open square left in a row, column or color.
  for (const u of open) {
    if (u.av.length === 1) return {
      title: 'Place a queen here',
      why: `This is the only open square left in ${unitName(u)}, and every ${lineWord(u.t, 1)} needs one queen.`,
      targets: u.av, unit: u.cells, act: 'q', type: 'single',
    };
  }

  // k groups that only fit inside k lines fill those lines completely.
  function squeeze(k) {
    let result = null;
    for (const A of ['reg', 'row', 'col']) for (const B of ['row', 'col', 'reg']) {
      if (A === B || result) continue;
      const groups = open.filter(u => u.t === A);
      if (groups.length <= k) continue;
      combos(groups, k, sub => {
        const keys = new Set();
        for (const u of sub) for (const c of u.av) keys.add(keyOf(B, c));
        if (keys.size !== k) return false;
        const inside = new Set(sub.flatMap(u => u.cells));
        const t = [];
        for (let i = 0; i < N; i++) if (isOpen(i) && keys.has(keyOf(B, i)) && !inside.has(i)) t.push(i);
        if (!t.length) return false;
        const lines = [...keys].map(id => UNITS.find(u => u.t === B && u.id === id));
        let why;
        if (k === 1) {
          const a = unitName(sub[0]), b = unitName(lines[0]);
          why = B === 'reg'
            ? `All of ${capitalize(a)}'s open squares are inside ${b} (highlighted). That means ${a}'s queen will also be ${b}'s queen, so the rest of ${b} can't have one.`
            : `All of ${capitalize(a)}'s open squares are in ${b} (highlighted). That means ${a}'s queen will be in ${b}, so ${b} can't have another queen anywhere else.`;
        } else {
          why = `${capitalize(listNames(sub))} can only fit inside ${listNames(lines)} (highlighted). That's ${k} queens for ${k} ${lineWord(B, k)}, so those ${lineWord(B, k)} are full and nothing else in them can be a queen.`;
        }
        result = { title: `Mark ${squares(t.length)}`, why, targets: t, unit: sub.flatMap(u => u.av), act: 'x', type: 'squeeze', k };
        return true;
      });
    }
    return result;
  }

  let h = squeeze(1);
  if (h) return h;

  // Squares that every possible queen of some group would block.
  for (const u of open) {
    if (u.av.length < 2) continue;
    const cnt = new Uint8Array(N);
    for (const c of u.av) for (const j of ATT[c]) cnt[j]++;
    const t = [];
    for (let i = 0; i < N; i++) if (cnt[i] === u.av.length && isOpen(i) && !u.cells.includes(i)) t.push(i);
    if (!t.length) continue;
    let why = `${capitalize(unitName(u))}'s queen has to go on one of the ${u.av.length} highlighted squares. `;
    why += t.length === 1
      ? blockReason(u.av, t[0]) + ' So wherever that queen goes, this square gets blocked.'
      : 'Every one of them would block these squares by sharing a row, column or color, or by touching. So none of them can be a queen.';
    return { title: `Mark ${squares(t.length)}`, why, targets: t, unit: u.av, act: 'x', type: 'every' };
  }

  for (let k = 2; k <= 4; k++) {
    h = squeeze(k);
    if (h) return h;
  }

  // Look ahead: a queen here would leave some group with nowhere to go.
  for (let depth = 0; depth <= 1; depth++) {
    for (let c = 0; c < N; c++) {
      if (!isOpen(c)) continue;
      const r = simulate(c, isOpen, depth ? 20 : 0);
      if (!r) continue;
      const dead = unitName(r.dead);
      let why;
      if (r.chain.length) {
        const chain = r.chain.map(x => unitName(x.u)).join(', then ');
        const its = r.chain.length > 1 ? 'their last open squares' : 'its last open square';
        why = `Suppose you put a queen here. Then ${chain} would be forced into ${its}, and after that ${dead} would have nowhere left for a queen.`;
      } else {
        why = `Suppose you put a queen here. It would block every open square in ${dead}, so ${dead} couldn't get a queen.`;
      }
      return { title: 'Mark this square', why, targets: [c], unit: r.dead.before.concat(r.chain.map(x => x.cell)), act: 'x', type: r.chain.length ? 'chain' : 'look' };
    }
  }

  return { title: 'No simple step here', why: 'This position needs some trial and error. Use Solve 1 if you want a queen placed for you.', targets: [], type: 'none' };
}
