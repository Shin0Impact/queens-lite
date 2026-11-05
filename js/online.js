// Online leaderboard stored in Firebase Firestore, used by the Android app
// and any normal web copy of the game. It talks to Firebase over plain HTTPS
// requests, so no extra library is loaded.
//
// Each device signs in anonymously once. The sign-in is kept in local
// storage and refreshed when it expires. The project settings come from
// js/config.js, which the build fills in.

const OnlineBoard = (() => {
  const cfg = ((window.QUEENS_CONFIG || {}).firebase) || {};
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId || '')}/databases/(default)/documents`;
  let auth = store.get('onlineAuth', null);

  function keep(a) { auth = a; store.set('onlineAuth', a); }

  async function token() {
    if (auth && auth.exp > Date.now() + 60000) return auth.idToken;
    if (auth && auth.refreshToken) {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(auth.refreshToken),
      });
      if (r.ok) {
        const j = await r.json();
        keep({ uid: j.user_id, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + Number(j.expires_in) * 1000 });
        return auth.idToken;
      }
    }
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    if (!r.ok) throw new Error('Sign-in failed (' + r.status + ')');
    const j = await r.json();
    keep({ uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + Number(j.expiresIn) * 1000 });
    return auth.idToken;
  }

  const int = v => ({ integerValue: String(Math.max(0, Math.round(v || 0))) });
  const num = f => (f ? Number(f.integerValue !== undefined ? f.integerValue : f.doubleValue) : NaN);
  function fromDoc(doc) {
    const f = doc.fields || {};
    return {
      id: doc.name.split('/').pop(),
      name: f.name ? f.name.stringValue : '',
      total: num(f.total),
      bestStreak: num(f.bestStreak),
      solved: num(f.solved),
    };
  }

  return {
    kind: 'online',
    id: null,
    canWrite: true,

    async init() {
      if (!cfg.apiKey || !cfg.projectId) return false;
      try { await token(); } catch (e) { /* Offline for now. Reads and writes retry later. */ }
      this.id = auth ? auth.uid : null;
      return true;
    },

    async loadMine() {
      if (!this.id) return null;
      const r = await fetch(`${base}/scores/${this.id}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Load failed (' + r.status + ')');
      return fromDoc(await r.json());
    },

    async save(d) {
      const t = await token();
      this.id = auth.uid;
      const fields = {
        name: { stringValue: d.name },
        total: int(d.total),
        bestStreak: int(d.bestStreak),
        solved: int(d.solved),
        updated: { timestampValue: new Date().toISOString() },
      };
      const r = await fetch(`${base}/scores/${auth.uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error('Save failed (' + r.status + ')');
    },

    async top(n) {
      const r = await fetch(`${base}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'scores' }],
            orderBy: [{ field: { fieldPath: 'total' }, direction: 'DESCENDING' }],
            limit: n,
          },
        }),
      });
      if (!r.ok) throw new Error('Load failed (' + r.status + ')');
      const rows = await r.json();
      return rows.filter(x => x.document).map(x => fromDoc(x.document));
    },
  };
})();
