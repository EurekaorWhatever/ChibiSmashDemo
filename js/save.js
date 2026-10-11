'use strict';
// ============================================================
//  Save data, seasons, leaderboards, gacha
//  NOTE: everything is stored locally (localStorage). Rival entries on the
//  leaderboards are simulated, deterministic per season. A real online
//  leaderboard / matchmaking needs a backend server.
// ============================================================

const SAVE_KEY = 'chibiclash.save.v1';

// ---------- seeded RNG ----------
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- seasons ----------
const Seasons = {
  // PvE: resets every 3 months (calendar quarters)
  pve(d = new Date()) {
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1), end = new Date(d.getFullYear(), q * 3 + 3, 1);
    return { id: `${d.getFullYear()}-Q${q + 1}`, label: `Raid Season ${d.getFullYear()} Q${q + 1}`, start, end };
  },
  // PvP: resets every 2 months
  pvp(d = new Date()) {
    const s = Math.floor(d.getMonth() / 2);
    const start = new Date(d.getFullYear(), s * 2, 1), end = new Date(d.getFullYear(), s * 2 + 2, 1);
    return { id: `${d.getFullYear()}-S${s + 1}`, label: `Ranked Season ${d.getFullYear()}.${s + 1}`, start, end };
  },
  progress(season, d = new Date()) { return Math.min(1, Math.max(0, (d - season.start) / (season.end - season.start))); },
  remaining(season, d = new Date()) {
    const ms = season.end - d, day = 86400000;
    const days = Math.floor(ms / day), hrs = Math.floor((ms % day) / 3600000);
    return `${days}d ${hrs}h`;
  },
};

function pvpTier(rp) { let t = PVP_TIERS[0]; for (const x of PVP_TIERS) if (rp >= x.min) t = x; return t; }
function pvpTierLabel(rp) {
  const t = pvpTier(rp), i = PVP_TIERS.indexOf(t), next = PVP_TIERS[i + 1];
  if (!next) return t.name;
  const span = next.min - t.min, div = Math.min(2, Math.floor((rp - t.min) / (span / 3)));
  return `${t.name} ${['III', 'II', 'I'][div]}`;
}
function pveReward(rank) { return PVE_REWARDS.find(r => rank >= r.from && rank <= r.to); }

// ---------- rival generation ----------
const SYL = ['ka', 'ri', 'mo', 'zen', 'lu', 'xi', 'to', 'na', 'vy', 'pa', 'ko', 'ren', 'sa', 'mi', 'jo', 'qu', 'el', 'dra', 'bo', 'ty'];
function rivalName(rng) {
  if (rng() < 0.35) return BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)] + Math.floor(rng() * 99);
  let n = ''; const k = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < k; i++) n += SYL[Math.floor(rng() * SYL.length)];
  return n[0].toUpperCase() + n.slice(1) + (rng() < 0.4 ? '_' + Math.floor(rng() * 999) : '');
}
const Leaderboard = {
  _cache: {},
  rivals(kind, season) {
    const key = kind + season.id;
    if (this._cache[key]) return this._cache[key];
    const rng = mulberry32(hashStr(key)), out = [];
    const n = kind === 'pve' ? 999 : 499;
    for (let i = 0; i < n; i++) {
      const r = rng();
      // skewed distribution: few very high, many average
      const v = kind === 'pve' ? Math.round(15000 + Math.pow(r, 3.2) * 112000 + rng() * 5000)
                               : Math.round(Math.pow(r, 2.2) * 2300 + rng() * 60);
      out.push({ name: rivalName(rng), score: v, char: CHARACTERS[Math.floor(rng() * CHARACTERS.length)].id });
    }
    return (this._cache[key] = out);
  },
  board(kind, season, playerScore, playerName, playerChar) {
    const prog = 0.3 + 0.7 * Seasons.progress(season);
    const list = this.rivals(kind, season).map(r => ({ ...r, score: Math.round(r.score * prog) }));
    if (playerScore > 0) list.push({ name: playerName, score: playerScore, char: playerChar, you: true });
    list.sort((a, b) => b.score - a.score);
    list.forEach((e, i) => e.rank = i + 1);
    return list;
  },
  // rank at the end of a season (rivals at full strength)
  finalRank(kind, season, score) {
    if (score <= 0) return null;
    return this.rivals(kind, season).filter(r => r.score > score).length + 1;
  },
};

// ---------- profile ----------
function defaultSave() {
  const owned = {};
  STARTERS.forEach(id => owned[id] = { level: 1, dupes: 0 });
  return {
    name: 'Proxy' + Math.floor(Math.random() * 9000 + 1000),
    gems: ECON.startGems, coins: ECON.startCoins,
    owned, selected: 'rin', passives: {},
    pity: { s: 0, a: 0, guarantee: false }, pullHistory: [],
    pvp: { season: Seasons.pvp().id, rp: 0, wins: 0, losses: 0, streak: 0 },
    pve: { season: Seasons.pve().id, best: 0, bestChar: null, runs: 0 },
    mail: [], titles: [],
    settings: { camera: false, sensitivity: 1.0, shake: true, showCam: true },
  };
}

const Save = {
  data: null,
  load() {
    try { const raw = localStorage.getItem(SAVE_KEY); this.data = raw ? Object.assign(defaultSave(), JSON.parse(raw)) : defaultSave(); }
    catch (e) { this.data = defaultSave(); }
    this.checkSeasons();
    this.write();
    return this.data;
  },
  write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } },
  reset() { this.data = defaultSave(); this.write(); },

  // Season rollover: grant rewards into the mailbox and reset ladders.
  checkSeasons() {
    const d = this.data;
    const pvpNow = Seasons.pvp();
    if (d.pvp.season !== pvpNow.id) {
      const tier = pvpTier(d.pvp.rp);
      if (d.pvp.wins + d.pvp.losses > 0)
        d.mail.push({ id: 'pvp' + d.pvp.season, title: `Ranked season ${d.pvp.season} ended`, body: `Final tier: ${pvpTierLabel(d.pvp.rp)} (${d.pvp.rp} RP)`, gems: tier.reward, coins: tier.reward * 3 });
      d.pvp = { season: pvpNow.id, rp: 0, wins: 0, losses: 0, streak: 0 };
    }
    const pveNow = Seasons.pve();
    if (d.pve.season !== pveNow.id) {
      if (d.pve.best > 0) {
        const old = { id: d.pve.season, start: new Date(0), end: new Date(0) };
        const rank = Leaderboard.finalRank('pve', old, d.pve.best);
        const rw = pveReward(rank);
        d.mail.push({ id: 'pve' + d.pve.season, title: `Raid season ${d.pve.season} ended`, body: `Final rank #${rank} with ${d.pve.best.toLocaleString()} pts`, gems: rw.gems, coins: rw.coins, titleReward: rw.title });
      }
      d.pve = { season: pveNow.id, best: 0, bestChar: null, runs: 0 };
    }
  },
  claimMail(i) {
    const m = this.data.mail[i]; if (!m) return;
    this.data.gems += m.gems || 0; this.data.coins += m.coins || 0;
    if (m.titleReward && !this.data.titles.includes(m.titleReward)) this.data.titles.push(m.titleReward);
    this.data.mail.splice(i, 1); this.write();
  },

  owns(id) { return !!this.data.owned[id]; },
  charState(id) { return this.data.owned[id] || { level: 1, dupes: 0 }; },
  passiveIdx(id) { return this.data.passives[id] || 0; },
  setPassive(id, i) { this.data.passives[id] = i; this.write(); },
  levelUp(id) {
    const s = this.data.owned[id]; if (!s || s.level >= ECON.maxLevel) return false;
    const cost = ECON.levelCost(s.level); if (this.data.coins < cost) return false;
    this.data.coins -= cost; s.level++; this.write(); return true;
  },
};

// ---------- gacha ----------
const Gacha = {
  rollOne(rng = Math.random) {
    const d = Save.data, p = d.pity;
    p.s++; p.a++;
    let sRate = GACHA.baseS + (p.s > GACHA.softPity ? (p.s - GACHA.softPity) * 0.06 : 0);
    let result;
    if (p.s >= GACHA.hardPity || rng() < sRate) {
      const pityAt = p.s;
      p.s = 0;
      let id;
      if (p.guarantee || rng() < 0.5) { id = GACHA.featuredS; p.guarantee = false; }
      else {
        const pool = CHARACTERS.filter(c => c.rarity === 'S' && c.id !== GACHA.featuredS);
        id = pool[Math.floor(rng() * pool.length)].id; p.guarantee = true;
      }
      result = { kind: 'char', id, rarity: 'S', pityAt };
    } else if (p.a >= GACHA.aPity || rng() < GACHA.baseA / (1 - sRate)) {
      p.a = 0;
      const pool = rng() < 0.5 ? GACHA.featuredA : CHARACTERS.filter(c => c.rarity === 'A').map(c => c.id);
      result = { kind: 'char', id: pool[Math.floor(rng() * pool.length)], rarity: 'A' };
    } else {
      const r = rng();
      if (r < 0.25) result = { kind: 'char', id: STARTERS[Math.floor(rng() * STARTERS.length)], rarity: 'B' };
      else if (r < 0.7) result = { kind: 'coins', amount: 400, rarity: 'B', name: 'Credit Stash' };
      else result = { kind: 'coins', amount: 700, rarity: 'B', name: 'Tuning Chip' };
    }
    // grant
    if (result.kind === 'char') {
      const o = d.owned[result.id];
      if (!o) { d.owned[result.id] = { level: 1, dupes: 0 }; result.isNew = true; }
      else if (o.dupes < ECON.maxDupes) { o.dupes++; result.dupe = o.dupes; }
      else { const c = { S: 5000, A: 1500, B: 300 }[result.rarity]; d.coins += c; result.overflow = c; }
    } else d.coins += result.amount;
    return result;
  },
  pull(n) {
    const cost = GACHA.cost1 * n;
    if (Save.data.gems < cost) return null;
    Save.data.gems -= cost;
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.rollOne());
    Save.data.pullHistory = out.map(r => ({ ...r, t: Date.now() })).concat(Save.data.pullHistory).slice(0, 100);
    Save.write();
    return out;
  },
};
