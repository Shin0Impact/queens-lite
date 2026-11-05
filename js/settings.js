// Settings sheet, puzzle codes and the first puzzle on load.

function statsText() {
  const best = Object.entries(ST.best).map(([n, s]) => `${n}×${n} in ${fmt(s)}`).join(', ');
  let t = `Puzzles solved: ${ST.solved}. Daily streak: ${ST.streak}.`;
  if (best) t += ` Best times: ${best}.`;
  return t;
}

$('#gear').onclick = () => {
  document.querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = S[k]; else el.value = S[k];
  });
  $('#statsTxt').textContent = statsText();
  $('#settings').classList.add('open');
};

document.querySelectorAll('[data-k]').forEach(el => {
  el.onchange = () => {
    const k = el.dataset.k;
    S[k] = el.type === 'checkbox' ? el.checked : el.value;
    save();
    applyTheme();
    if (k === 'sym') { clearHint(); build(); }
    else if (k === 'lives' || k === 'mem' || k === 'blitz') start(P.n, P.seed, daily);
    else { update(); restartTick(); }
  };
});

$('#closeSet').onclick = () => $('#settings').classList.remove('open');
$('#settings').onclick = e => { if (e.target.id === 'settings') e.target.classList.remove('open'); };

$('#codeGo').onclick = () => {
  const m = $('#codeIn').value.trim().replace(/^#|^puzzle\s*/i, '').match(/^(\d+)-(\d+)$/);
  if (!m) return;
  const n = Math.min(10, Math.max(5, +m[1]));
  $('#settings').classList.remove('open');
  start(n, +m[2], false);
};

matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

applyTheme();
newRandom();
