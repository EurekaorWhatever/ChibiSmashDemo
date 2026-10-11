'use strict';
// ============================================================
//  Menus / screens (HTML overlay on top of the canvas)
// ============================================================

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function statsFor(ch, level = 1, dupes = 0, passiveIdx = 0) {
  const c = CLASSES[ch.cls], b = c.base, mul = 1 + 0.05 * (level - 1) + 0.03 * dupes, pid = c.passives[passiveIdx].id;
  let atk = b.atk * mul, as = 100, ms = 100, crit = b.crit * 100;
  if (pid === 'bruteAS' || pid === 'bruteMS') atk *= 1.2;
  if (pid === 'atkspd') as = 115; if (pid === 'bruteAS') as = 85; if (pid === 'bruteMS') ms = 85; if (pid === 'eagle') crit += 20;
  return { hp: Math.round(b.hp * mul), atk: Math.round(atk), def: b.def, crit, critDmg: b.critDmg * 100, as, ms };
}

const _pimg = {};
function portraitURL(id, size = 96) { const k = id + size; return _pimg[k] || (_pimg[k] = portrait(CHAR_BY_ID[id], size).toDataURL()); }
function chibiCanvas(id, scale = 2, w = 220, h = 260, extra = '') {
  h = Math.max(h, Math.ceil(150 * scale));   // room for horns / halos
  return `<canvas class="chibi" data-char="${id}" data-scale="${scale}" width="${w}" height="${h}" ${extra}></canvas>`;
}

const UI = {
  root: null, screen: 'home', params: {}, queue: null, versusT: 0,

  init() {
    this.root = document.getElementById('ui');
    this.root.addEventListener('click', e => {
      const el = e.target.closest('[data-act]'); if (!el) return;
      const fn = ACTIONS[el.dataset.act]; if (fn) { e.preventDefault(); fn(el.dataset, el); }
    });
    this.root.addEventListener('input', e => {
      const el = e.target;
      if (el.id === 'sens') { Save.data.settings.sensitivity = +el.value; Save.write(); document.getElementById('sensVal').textContent = (+el.value).toFixed(2) + '×'; }
      if (el.id === 'pname') { Save.data.name = el.value.slice(0, 16) || 'Proxy'; Save.write(); }
    });
  },

  show(screen, params = {}) {
    this.screen = screen; this.params = params;
    document.body.dataset.screen = screen;
    this.root.style.display = '';
    this.root.innerHTML = (SCREENS[screen](params) || '');
    this.paintAll();
  },
  rerender() { this.show(this.screen, this.params); },

  toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2200);
  },

  paintAll() { this.root.querySelectorAll('canvas.chibi').forEach(c => this.paintChibi(c)); },
  paintChibi(c, t = performance.now() / 1000) {
    const ch = CHAR_BY_ID[c.dataset.char]; if (!ch) return;
    const s = +c.dataset.scale || 1, ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height - 8 * s); ctx.scale(s * (c.dataset.flip ? -1 : 1), s);
    const [arm, wRot] = IDLE_POSE[ch.cls];
    Art.chibi(ctx, ch, { t: t + (c.dataset.seed ? +c.dataset.seed : 0), arm, wRot, eyes: c.dataset.eyes || 'open', mouth: c.dataset.mouth || 'smile' });
    if (c.dataset.locked) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#2a2638'; ctx.fillRect(0, 0, c.width, c.height); }
  },

  tick(dt) {
    if (Battle.current && !this.root.querySelector('.overlay')) return;
    const t = performance.now() / 1000;
    this.root.querySelectorAll('canvas.chibi[data-anim]').forEach(c => this.paintChibi(c, t));
    if (this.screen === 'queue' && this.queue) {
      this.queue.t += dt;
      const el = document.getElementById('qtime'); if (el) el.textContent = this.queue.t.toFixed(0) + 's';
      if (!this.queue.found && this.queue.t >= this.queue.wait) { this.queue.found = true; const s = document.getElementById('qstatus'); if (s) { s.textContent = 'MATCH FOUND!'; s.classList.add('found'); } setTimeout(() => startVersus(), 900); }
    }
    if (this.screen === 'versus') { this.versusT += dt; if (this.versusT > 2.6 && !this._launched) { this._launched = true; launchBattle(this.params.cfg); } }
    if (this.screen === 'settings') updateCamPanel();
  },
};

// ============================================================
//  Screens
// ============================================================
function topbar(back = true, title = '') {
  const d = Save.data;
  return `<div class="topbar">
    ${back ? `<button class="back" data-act="home">◀ BACK</button>` : `<div class="logo">CHIBI<b>CLASH</b><span>ZERO</span></div>`}
    ${title ? `<div class="ttl">${title}</div>` : '<div></div>'}
    <div class="cur"><span class="gem">◆ ${fmt(d.gems)}</span><span class="coin">● ${fmt(d.coins)}</span></div>
  </div>`;
}

const SCREENS = {
  home() {
    const d = Save.data, ch = CHAR_BY_ID[d.selected];
    const pvpS = Seasons.pvp(), pveS = Seasons.pve();
    const tier = pvpTier(d.pvp.rp);
    return `${topbar(false)}
    <div class="home">
      <div class="stage-card">
        <div class="stripe"></div>
        ${chibiCanvas(ch.id, 3.2, 520, 470, 'data-anim="1"')}
        <div class="who"><span class="rar r${ch.rarity}">${ch.rarity}</span> ${esc(ch.name)}<small>${esc(ch.title)} · ${CLASSES[ch.cls].icon} ${CLASSES[ch.cls].name}</small></div>
        <div class="player">${esc(d.name)} ${d.titles.length ? `<em>「${esc(d.titles[d.titles.length - 1])}」</em>` : ''}</div>
      </div>
      <div class="menu">
        <button class="btn big pvp" data-act="goSelect" data-mode="pvp"><span>RANKED PvP</span><small style="color:${tier.color}">${pvpTierLabel(d.pvp.rp)} · ${d.pvp.rp} RP · ${d.pvp.wins}W ${d.pvp.losses}L</small><i>Season ends in ${Seasons.remaining(pvpS)}</i></button>
        <button class="btn big pve" data-act="goSelect" data-mode="pve"><span>BOSS RAID</span><small>Best: ${fmt(d.pve.best)} pts · ${d.pve.runs} runs</small><i>Season ends in ${Seasons.remaining(pveS)}</i></button>
        <button class="btn" data-act="goSelect" data-mode="practice"><span>PRACTICE</span><small>Offline · test combos</small></button>
        <button class="btn gold" data-act="go" data-to="gacha"><span>SIGNAL SEARCH</span><small>Summon agents</small></button>
        <div class="row">
          <button class="btn sm" data-act="go" data-to="agents"><span>AGENTS</span></button>
          <button class="btn sm" data-act="go" data-to="boards"><span>RANKINGS</span></button>
          <button class="btn sm" data-act="go" data-to="settings"><span>CAMERA &amp; SETTINGS</span></button>
        </div>
        ${d.mail.length ? `<button class="btn mail" data-act="go" data-to="mail"><span>✉ SEASON REWARDS (${d.mail.length})</span></button>` : ''}
        <div class="camstat">${Vision.active ? '📷 Camera ultimates ON' : '⌨️ Camera off — ult with F+G+H + Enter'}</div>
      </div>
    </div>`;
  },

  select(p) {
    const d = Save.data;
    const owned = CHARACTERS.filter(c => Save.owns(c.id));
    const sel = Save.owns(p.char || d.selected) ? (p.char || d.selected) : owned[0].id;
    const ch = CHAR_BY_ID[sel], cs = Save.charState(sel), pi = Save.passiveIdx(sel), st = statsFor(ch, cs.level, cs.dupes, pi), cls = CLASSES[ch.cls];
    const label = { pvp: 'FIND MATCH', pve: 'ENTER RAID', practice: 'START PRACTICE' }[p.mode];
    const pr = p.practice || { opp: 'dummy', noCooldowns: true };
    return `${topbar(true, { pvp: 'RANKED PvP', pve: 'BOSS RAID', practice: 'PRACTICE' }[p.mode])}
    <div class="select">
      <div class="grid">
        ${owned.map(c => `<button class="card r${c.rarity} ${c.id === sel ? 'on' : ''}" data-act="pickChar" data-id="${c.id}">
          <img src="${portraitURL(c.id)}"><span class="ci">${CLASSES[c.cls].icon}</span><b>${esc(c.name)}</b><span class="lv">Lv${Save.charState(c.id).level}</span></button>`).join('')}
      </div>
      <div class="detail">
        <div class="dl">
          ${chibiCanvas(ch.id, 2.4, 300, 330, 'data-anim="1"')}
          <div class="nm"><span class="rar r${ch.rarity}">${ch.rarity}</span> ${esc(ch.name)}</div>
          <div class="sub">${esc(ch.title)} · ${cls.icon} ${cls.name}</div>
          <div class="stats">
            <div>HP<b>${st.hp}</b></div><div>ATK<b>${st.atk}</b></div><div>DEF<b>${st.def}</b></div>
            <div>CRIT<b>${st.crit}%</b></div><div>CRIT DMG<b>+${st.critDmg}%</b></div><div>ATK SPD<b>${st.as}%</b></div>
          </div>
        </div>
        <div class="dr">
          <h4>CHOOSE 1 PASSIVE</h4>
          <div class="passives">${cls.passives.map((ps, i) => `<button class="pas ${i === pi ? 'on' : ''}" data-act="setPassive" data-id="${ch.id}" data-i="${i}"><b>${ps.name}</b><span>${ps.desc}</span></button>`).join('')}</div>
          <h4>SKILLS <small>(${cls.pattern.length}-hit basic combo)</small></h4>
          <ul class="skills">${cls.skills.map((s, i) => `<li><kbd>${'UIO'[i]}</kbd><b>${s.icon} ${s.name}</b> <i>${s.cd}s</i><span>${s.desc}</span></li>`).join('')}</ul>
          <h4>ULTIMATE</h4>
          <div class="ult"><b>${cls.ult.name}</b><span>${cls.ult.desc}</span>
            <div class="gest">${GESTURES[ch.gesture].icon} Camera: <b>${GESTURES[ch.gesture].hint}</b> &nbsp;·&nbsp; Keys: <kbd>F</kbd>+<kbd>G</kbd>+<kbd>H</kbd> then <kbd>Enter</kbd></div></div>
          ${ch.unique ? `<div class="uniq">★ Signature: ${esc(ch.uniqueDesc)}</div>` : ''}
          ${p.mode === 'practice' ? `
            <h4>PRACTICE OPPONENT</h4>
            <div class="seg">${[['dummy', 'Dummy'], ['bot', 'AI Fighter'], ['boss', 'Raid Boss']].map(([k, n]) => `<button class="${pr.opp === k ? 'on' : ''}" data-act="pracOpp" data-v="${k}">${n}</button>`).join('')}
            <button class="${pr.noCooldowns ? 'on' : ''}" data-act="pracCd">No cooldowns + full ult: ${pr.noCooldowns ? 'ON' : 'OFF'}</button></div>` : ''}
          ${p.mode === 'pve' ? `<div class="note">Raid: 180s to defeat Gloomhorn. Score = damage + clear bonus + time left + HP left + max combo. Leaderboard resets every 3 months; top 20 earn special rewards.</div>` : ''}
          ${p.mode === 'pvp' ? `<div class="note">Win: +80 ◆ +300 ● and RP. Ranked season resets every 2 months with tier rewards.</div>` : ''}
          <button class="btn go" data-act="confirmSelect"><span>${label} ▶</span></button>
        </div>
      </div>
    </div>`;
  },

  queue(p) {
    const d = Save.data;
    return `<div class="queue">
      <div class="spinner"><div></div><div></div><div></div></div>
      <div id="qstatus" class="qstatus">SEARCHING FOR OPPONENT…</div>
      <div class="qinfo">${pvpTierLabel(d.pvp.rp)} · ${d.pvp.rp} RP · <span id="qtime">0s</span></div>
      <div class="qnote">Matchmaking pairs you with an AI rival of similar rank (online play needs a game server).</div>
      <button class="btn sm" data-act="cancelQueue"><span>CANCEL</span></button>
    </div>`;
  },

  versus(p) {
    const c = p.cfg, pc = CHAR_BY_ID[c.player.charId];
    const right = c.opponent.type === 'boss' ? null : CHAR_BY_ID[c.opponent.charId];
    return `<div class="versus">
      <div class="vs-l" style="--c:${pc.fx}">${chibiCanvas(pc.id, 3.4, 420, 470, 'data-anim="1" data-eyes="angry" data-mouth="grit"')}
        <div class="vname">${esc(c.player.name)}<small>${esc(pc.name)} · ${c.mode === 'pvp' ? pvpTierLabel(Save.data.pvp.rp) : 'Lv' + c.player.level}</small></div></div>
      <div class="vs-r" style="--c:${right ? right.fx : '#ff3d7f'}">${right ? chibiCanvas(right.id, 3.4, 420, 470, 'data-anim="1" data-flip="1" data-eyes="angry" data-mouth="grit"') : '<div class="bossv">👁</div>'}
        <div class="vname">${esc(c.opponent.name)}<small>${right ? esc(right.name) : 'Ether Tyrant'} · ${c.opponent.rankLabel || ''}</small></div></div>
      <div class="vs">VS</div>
    </div>`;
  },

  results(p) {
    const r = p.res, rw = p.rewards || {};
    if (r.mode === 'pve') {
      return `<div class="overlay results">
        <div class="res-card">
          <div class="banner ${r.killed ? 'win' : 'lose'}">${r.killed ? 'RAID CLEAR!' : 'RAID FAILED'}</div>
          <div class="grade g${r.grade}">${r.grade}</div>
          <div class="score">${fmt(r.score)} <small>pts</small></div>
          <table class="breakdown">
            <tr><td>Damage ×10</td><td>${fmt(r.parts.damage)}</td></tr>
            <tr><td>Clear bonus</td><td>${fmt(r.parts.clear)}</td></tr>
            <tr><td>Time left bonus</td><td>${fmt(r.parts.time)}</td></tr>
            <tr><td>HP left bonus</td><td>${fmt(r.parts.hp)}</td></tr>
            <tr><td>Max combo (${r.maxCombo}) ×150</td><td>${fmt(r.parts.combo)}</td></tr>
          </table>
          ${rw.newBest ? `<div class="newbest">★ NEW SEASON BEST — current rank #${rw.rank}</div>` : `<div class="sub">Season best: ${fmt(Save.data.pve.best)} (rank #${rw.rank || '-'})</div>`}
          <div class="rewards">+${rw.gems} ◆ &nbsp; +${fmt(rw.coins)} ●</div>
          <div class="row"><button class="btn sm" data-act="again"><span>RETRY</span></button><button class="btn sm" data-act="go" data-to="boards" data-tab="pve"><span>LEADERBOARD</span></button><button class="btn sm" data-act="home"><span>HOME</span></button></div>
        </div></div>`;
    }
    return `<div class="overlay results">
      <div class="res-card">
        <div class="banner ${r.win ? 'win' : 'lose'}">${r.win ? 'VICTORY' : 'DEFEAT'}</div>
        ${chibiCanvas(r.player.ch.id, 1.7, 240, 250, `data-anim="1" data-eyes="${r.win ? 'happy' : 'hurt'}" data-mouth="${r.win ? 'open' : 'flat'}"`)}
        <table class="breakdown">
          <tr><td>Damage dealt</td><td>${fmt(r.dealt)}</td></tr><tr><td>Damage taken</td><td>${fmt(r.taken)}</td></tr>
          <tr><td>Max combo</td><td>${r.maxCombo}</td></tr><tr><td>Time</td><td>${r.time.toFixed(1)}s${r.timeUp ? ' (time up)' : ''}</td></tr>
        </table>
        ${r.mode === 'pvp' ? `<div class="rp ${rw.rp >= 0 ? 'up' : 'down'}">${rw.rp >= 0 ? '+' : ''}${rw.rp} RP → ${Save.data.pvp.rp} (${pvpTierLabel(Save.data.pvp.rp)})</div>
          <div class="rewards">+${rw.gems} ◆ &nbsp; +${fmt(rw.coins)} ●</div>` : ''}
        <div class="row"><button class="btn sm" data-act="again"><span>${r.mode === 'pvp' ? 'QUEUE AGAIN' : 'AGAIN'}</span></button><button class="btn sm" data-act="home"><span>HOME</span></button></div>
      </div></div>`;
  },

  gacha(p) {
    const d = Save.data, f = CHAR_BY_ID[GACHA.featuredS], pity = d.pity;
    return `${topbar(true, 'SIGNAL SEARCH')}
    <div class="gacha">
      <div class="banner-art" style="--c:${f.fx}">
        <div class="ban-txt"><small>LIMITED SIGNAL</small><h2>${esc(f.name)}</h2><span>${esc(f.title)} · ${CLASSES[f.cls].icon} ${CLASSES[f.cls].name}</span>
        <p>★ ${esc(f.uniqueDesc)}</p>
        <div class="feat-a">Rate-up A: ${GACHA.featuredA.map(id => `<img src="${portraitURL(id, 64)}" title="${esc(CHAR_BY_ID[id].name)}">`).join('')}</div></div>
        ${chibiCanvas(f.id, 3.6, 440, 500, 'data-anim="1" data-mouth="tongue"')}
      </div>
      <div class="gside">
        <div class="pity">
          <div>S-rank pity <b>${pity.s}/${GACHA.hardPity}</b></div>
          <div class="pbar"><i style="width:${pity.s / GACHA.hardPity * 100}%"></i></div>
          <div>A-rank or better within <b>${GACHA.aPity - pity.a}</b> pulls</div>
          <div>50/50: <b>${pity.guarantee ? 'NEXT S IS GUARANTEED FEATURED' : 'Not guaranteed'}</b></div>
        </div>
        <button class="btn" data-act="pull" data-n="1"><span>SEARCH ×1</span><small>◆ ${GACHA.cost1}</small></button>
        <button class="btn gold" data-act="pull" data-n="10"><span>SEARCH ×10</span><small>◆ ${GACHA.cost1 * 10}</small></button>
        <details class="rates"><summary>Rates &amp; details</summary>
          <p>S: 0.6% base, rising after pull ${GACHA.softPity}, guaranteed by ${GACHA.hardPity}. 50% featured; lose the 50/50 and the next S is guaranteed featured.</p>
          <p>A: 9.4%, guaranteed every ${GACHA.aPity} pulls. B: credits, tuning chips or starter agent copies.</p>
          <p>Duplicates raise Mindscape (max ${ECON.maxDupes}, +3% stats each). Beyond that → coins.</p>
        </details>
        <details class="rates"><summary>Recent pulls (${d.pullHistory.length})</summary>
          <div class="hist">${d.pullHistory.slice(0, 30).map(h => `<span class="r${h.rarity}">${h.kind === 'char' ? esc(CHAR_BY_ID[h.id].name) : esc(h.name)}</span>`).join('') || '—'}</div>
        </details>
      </div>
    </div>`;
  },

  pulls(p) {
    const res = p.res;
    const best = res.some(r => r.rarity === 'S') ? 'S' : res.some(r => r.rarity === 'A') ? 'A' : 'B';
    return `<div class="overlay pulls b${best}">
      <div class="pgrid n${res.length}">
        ${res.map((r, i) => `<div class="pc r${r.rarity}" style="animation-delay:${0.15 + i * 0.18}s">
          ${r.kind === 'char' ? `${chibiCanvas(r.id, 1.05, 140, 150, 'data-anim="1" data-eyes="happy" data-mouth="open"')}<b>${esc(CHAR_BY_ID[r.id].name)}</b>
            <small>${r.isNew ? 'NEW!' : r.overflow ? `+${r.overflow} ●` : `Mindscape ${r.dupe}`}</small>`
            : `<div class="item">${r.name === 'Tuning Chip' ? '⚙️' : '💰'}</div><b>${esc(r.name)}</b><small>+${r.amount} ●</small>`}
          <span class="rr">${r.rarity}</span></div>`).join('')}
      </div>
      <button class="btn sm" data-act="go" data-to="gacha" style="animation-delay:${0.3 + res.length * 0.18}s"><span>CONTINUE</span></button>
    </div>`;
  },

  agents(p) {
    const sel = p.id || Save.data.selected, ch = CHAR_BY_ID[sel], owned = Save.owns(sel);
    const cs = Save.charState(sel), cls = CLASSES[ch.cls], st = statsFor(ch, cs.level, cs.dupes, Save.passiveIdx(sel));
    const cost = ECON.levelCost(cs.level);
    return `${topbar(true, 'AGENTS')}
    <div class="agents">
      <div class="grid">${CHARACTERS.map(c => `<button class="card r${c.rarity} ${c.id === sel ? 'on' : ''} ${Save.owns(c.id) ? '' : 'locked'}" data-act="viewAgent" data-id="${c.id}">
        <img src="${portraitURL(c.id)}"><span class="ci">${CLASSES[c.cls].icon}</span><b>${esc(c.name)}</b></button>`).join('')}</div>
      <div class="adetail">
        <div class="al">${chibiCanvas(ch.id, 2.5, 300, 340, `data-anim="1" ${owned ? '' : 'data-locked="1"'}`)}
          <div class="nm"><span class="rar r${ch.rarity}">${ch.rarity}</span> ${esc(ch.name)}</div><div class="sub">${esc(ch.title)} · ${cls.icon} ${cls.name}</div>
          ${owned ? `<div class="lvl">Lv ${cs.level}/${ECON.maxLevel} · Mindscape ${cs.dupes}/${ECON.maxDupes}</div>
            ${cs.level < ECON.maxLevel ? `<button class="btn sm" data-act="levelUp" data-id="${ch.id}"><span>LEVEL UP</span><small>● ${fmt(cost)}</small></button>` : '<div class="sub">MAX LEVEL</div>'}
            ${Save.data.selected !== ch.id ? `<button class="btn sm" data-act="setMain" data-id="${ch.id}"><span>SET AS MAIN</span></button>` : '<div class="sub">★ Main agent</div>'}`
            : `<div class="sub">Not owned — find them in Signal Search.</div>`}
        </div>
        <div class="ar">
          <h4>STORY</h4><p class="story">${esc(ch.story)}</p>
          <div class="stats wide"><div>HP<b>${st.hp}</b></div><div>ATK<b>${st.atk}</b></div><div>DEF<b>${st.def}</b></div><div>CRIT<b>${st.crit}%</b></div><div>CRIT DMG<b>+${st.critDmg}%</b></div></div>
          ${ch.unique ? `<div class="uniq">★ Signature: ${esc(ch.uniqueDesc)}</div>` : ''}
          <h4>PASSIVES (pick 1 before battle)</h4><ul class="skills">${cls.passives.map(ps => `<li><b>${ps.name}</b><span>${ps.desc}</span></li>`).join('')}</ul>
          <h4>SKILLS</h4><ul class="skills">${cls.skills.map((s, i) => `<li><kbd>${'UIO'[i]}</kbd><b>${s.icon} ${s.name}</b> <i>${s.cd}s</i><span>${s.desc}</span></li>`).join('')}</ul>
          <h4>ULTIMATE · ${cls.ult.name}</h4><p>${cls.ult.desc}<br>${GESTURES[ch.gesture].icon} Camera gesture: <b>${GESTURES[ch.gesture].hint}</b> · Keys: F+G+H then Enter</p>
        </div>
      </div>
    </div>`;
  },

  boards(p) {
    const tab = p.tab || 'pve', d = Save.data;
    const season = tab === 'pve' ? Seasons.pve() : Seasons.pvp();
    const my = tab === 'pve' ? d.pve.best : d.pvp.rp;
    const list = Leaderboard.board(tab, season, my, d.name, d.selected);
    const me = list.find(e => e.you);
    const top = list.slice(0, 20);
    const row = e => `<tr class="${e.you ? 'you' : ''} ${e.rank <= 20 ? 'top' : ''}"><td>#${e.rank}</td><td><img src="${portraitURL(e.char, 64)}"> ${esc(e.name)}</td><td>${tab === 'pve' ? fmt(e.score) : `${e.score} <small>${pvpTierLabel(e.score)}</small>`}</td></tr>`;
    return `${topbar(true, 'RANKINGS')}
    <div class="boards">
      <div class="tabs"><button class="${tab === 'pve' ? 'on' : ''}" data-act="boardTab" data-tab="pve">BOSS RAID</button><button class="${tab === 'pvp' ? 'on' : ''}" data-act="boardTab" data-tab="pvp">RANKED PvP</button></div>
      <div class="bwrap">
        <div class="blist">
          <div class="shead">${season.label} · resets in <b>${Seasons.remaining(season)}</b> (every ${tab === 'pve' ? '3' : '2'} months)</div>
          <table>${top.map(row).join('')}${me && me.rank > 20 ? `<tr class="gap"><td colspan="3">⋯</td></tr>${row(me)}` : ''}</table>
          ${!me ? `<div class="sub">You have no ${tab === 'pve' ? 'raid score' : 'ranked RP'} this season yet.</div>` : ''}
          <div class="qnote">Rivals are simulated offline for now; plug in a server to make this a live global board.</div>
        </div>
        <div class="rtable">
          <h4>SEASON REWARDS</h4>
          ${tab === 'pve' ? `<table>${PVE_REWARDS.map(r => `<tr class="${r.to <= 20 ? 'top' : ''}"><td>${r.from === r.to ? '#' + r.from : r.to > 1e6 ? '#' + r.from + '+' : `#${r.from}–${r.to}`}</td><td>◆ ${fmt(r.gems)}<br>● ${fmt(r.coins)}</td><td>${r.title ? '🏆 ' + r.title : ''}</td></tr>`).join('')}</table>
            <div class="sub">Top 20 earn exclusive titles. Everyone else is rewarded by rank bracket.</div>`
            : `<table>${PVP_TIERS.map(t => `<tr><td style="color:${t.color}">${t.name}</td><td>${t.min}+ RP</td><td>◆ ${fmt(t.reward)} · ● ${fmt(t.reward * 3)}</td></tr>`).join('')}</table>
            <div class="sub">Every win also pays +80 ◆ instantly.</div>`}
        </div>
      </div>
    </div>`;
  },

  settings() {
    const s = Save.data.settings;
    return `${topbar(true, 'CAMERA & SETTINGS')}
    <div class="settings">
      <div class="campanel">
        <h4>FACE-GESTURE ULTIMATES</h4>
        <div class="camrow">
          <canvas id="camview" width="320" height="240"></canvas>
          <div class="meters">${Object.entries(GESTURES).map(([k, g]) => `<div class="meter" data-g="${k}"><span>${g.icon} ${g.name}</span><div class="mbar"><i></i><em style="left:${Vision.thresholds[k] * 100}%"></em></div><b class="fired">!</b></div>`).join('')}</div>
        </div>
        <div id="camstatus" class="sub"></div>
        <div class="row">
          ${Vision.active || Vision.status === 'loading' ? `<button class="btn sm" data-act="camOff"><span>TURN CAMERA OFF</span></button>` : `<button class="btn sm go" data-act="camOn"><span>ENABLE CAMERA</span></button>`}
        </div>
        <label class="slider">Sensitivity <input id="sens" type="range" min="0.6" max="1.8" step="0.05" value="${s.sensitivity}"> <span id="sensVal">${(+s.sensitivity).toFixed(2)}×</span></label>
        <p class="qnote">Video stays on your device — frames are processed locally by MediaPipe in the browser. Hold a gesture briefly to fire; natural blinks are too short to trigger. No camera? Hold <kbd>F</kbd>+<kbd>G</kbd>+<kbd>H</kbd> and press <kbd>Enter</kbd>.</p>
      </div>
      <div class="opts">
        <h4>OPTIONS</h4>
        <label>Name <input id="pname" maxlength="16" value="${esc(Save.data.name)}"></label>
        <button class="tog ${s.showCam ? 'on' : ''}" data-act="toggle" data-k="showCam">Camera preview in battle: ${s.showCam ? 'ON' : 'OFF'}</button>
        <button class="tog ${s.shake ? 'on' : ''}" data-act="toggle" data-k="shake">Screen shake: ${s.shake ? 'ON' : 'OFF'}</button>
        <h4>CONTROLS</h4>
        <table class="controls">
          <tr><td>Move</td><td><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></td></tr>
          <tr><td>Jump</td><td><kbd>W</kbd> / <kbd>↑</kbd> / <kbd>Space</kbd></td></tr>
          <tr><td>Basic attack (hold)</td><td><kbd>J</kbd></td></tr>
          <tr><td>Skills 1 / 2 / 3</td><td><kbd>U</kbd><kbd>I</kbd><kbd>O</kbd> (or <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>)</td></tr>
          <tr><td>Ultimate</td><td>Camera gesture, or hold <kbd>F</kbd>+<kbd>G</kbd>+<kbd>H</kbd> + <kbd>Enter</kbd></td></tr>
          <tr><td>Pause</td><td><kbd>Esc</kbd></td></tr>
        </table>
        <button class="btn sm danger" data-act="resetSave"><span>RESET ALL PROGRESS</span></button>
      </div>
    </div>`;
  },

  mail() {
    const m = Save.data.mail;
    return `${topbar(true, 'SEASON REWARDS')}
    <div class="mail">${m.length ? m.map((x, i) => `<div class="mitem"><b>${esc(x.title)}</b><span>${esc(x.body)}</span>
      <em>◆ ${fmt(x.gems || 0)} · ● ${fmt(x.coins || 0)}${x.titleReward ? ' · 🏆 ' + esc(x.titleReward) : ''}</em>
      <button class="btn sm go" data-act="claim" data-i="${i}"><span>CLAIM</span></button></div>`).join('') : '<div class="sub">No rewards waiting.</div>'}</div>`;
  },

  pause() {
    return `<div class="overlay pause"><div class="res-card">
      <div class="banner">PAUSED</div>
      <div class="row"><button class="btn sm" data-act="resume"><span>RESUME</span></button><button class="btn sm danger" data-act="quitBattle"><span>${Battle.current && Battle.current.mode === 'practice' ? 'EXIT' : 'FORFEIT'}</span></button></div>
      <p class="qnote">Move A/D · Jump W · Attack J · Skills U/I/O · Ult F+G+H+Enter or camera</p>
    </div></div>`;
  },
};

// ============================================================
//  Actions
// ============================================================
let lastCfg = null;

const ACTIONS = {
  home() { Battle.stop(); UI.show('home'); },
  go(d) { UI.show(d.to, d.tab ? { tab: d.tab } : {}); },
  goSelect(d) { UI.show('select', { mode: d.mode }); },
  pickChar(d) { Save.data.selected = d.id; Save.write(); UI.show('select', Object.assign({}, UI.params, { char: d.id })); },
  setPassive(d) { Save.setPassive(d.id, +d.i); UI.rerender(); },
  pracOpp(d) { UI.params.practice = Object.assign({ noCooldowns: true }, UI.params.practice, { opp: d.v }); UI.rerender(); },
  pracCd() { const p = UI.params.practice = Object.assign({ opp: 'dummy', noCooldowns: true }, UI.params.practice); p.noCooldowns = !p.noCooldowns; UI.rerender(); },
  confirmSelect() {
    const mode = UI.params.mode, d = Save.data, id = d.selected, cs = Save.charState(id);
    const player = { charId: id, passiveIdx: Save.passiveIdx(id), level: cs.level, dupes: cs.dupes, name: d.name };
    if (mode === 'pvp') { UI.queue = { t: 0, wait: rand(2.2, 5.5), found: false, player }; UI.show('queue'); return; }
    if (mode === 'pve') { lastCfg = { mode: 'pve', player, opponent: { type: 'boss', hp: 7000, name: 'GLOOMHORN', rankLabel: 'Raid Boss' } }; UI.versusT = 0; UI._launched = false; UI.show('versus', { cfg: lastCfg }); return; }
    const pr = UI.params.practice || { opp: 'dummy', noCooldowns: true };
    let opponent;
    if (pr.opp === 'boss') opponent = { type: 'boss', hp: 7000 };
    else if (pr.opp === 'bot') { const oc = pick(CHARACTERS); opponent = { type: 'fighter', charId: oc.id, aiSkill: 0.5, level: cs.level, name: 'SPARRING BOT', passiveIdx: Math.round(Math.random()) }; }
    else opponent = { type: 'dummy' };
    lastCfg = { mode: 'practice', player, opponent, practice: pr };
    launchBattle(lastCfg);
  },
  cancelQueue() { UI.queue = null; UI.show('select', { mode: 'pvp' }); },
  again() {
    if (!lastCfg) return ACTIONS.home();
    if (lastCfg.mode === 'pvp') { UI.queue = { t: 0, wait: rand(2.2, 5.5), found: false, player: lastCfg.player }; Battle.stop(); UI.show('queue'); }
    else { Battle.stop(); launchBattle(lastCfg); }
  },
  pull(d) {
    const n = +d.n, res = Gacha.pull(n);
    if (!res) { UI.toast(`Not enough ◆ — need ${GACHA.cost1 * n}. Win PvP / clear raids to earn more.`); return; }
    UI.show('pulls', { res });
  },
  viewAgent(d) { UI.show('agents', { id: d.id }); },
  levelUp(d) { if (Save.levelUp(d.id)) UI.toast('Level up!'); else UI.toast('Not enough ● coins'); UI.rerender(); },
  setMain(d) { Save.data.selected = d.id; Save.write(); UI.rerender(); },
  boardTab(d) { UI.show('boards', { tab: d.tab }); },
  camOn() { Vision.start().then(() => UI.rerender()); UI.rerender(); },
  camOff() { Vision.stop(); UI.rerender(); },
  toggle(d) { Save.data.settings[d.k] = !Save.data.settings[d.k]; Save.write(); UI.rerender(); },
  resetSave() { if (confirm('Reset ALL progress (agents, currency, ranks)?')) { Save.reset(); UI.show('home'); } },
  claim(d) { Save.claimMail(+d.i); UI.toast('Rewards claimed!'); UI.rerender(); },
  resume() { if (Battle.current) Battle.current.paused = false; UI.root.innerHTML = ''; },
  quitBattle() {
    const W = Battle.current;
    if (W && W.mode === 'pvp' && !W.finished) { Save.data.pvp.rp = Math.max(0, Save.data.pvp.rp - 18); Save.data.pvp.losses++; Save.data.pvp.streak = 0; Save.write(); UI.toast('Forfeit: -18 RP'); }
    ACTIONS.home();
  },
};

// ============================================================
//  Flow helpers
// ============================================================
function startVersus() {
  if (UI.screen !== 'queue' || !UI.queue) return;
  const d = Save.data, rp = d.pvp.rp;
  // rarer characters show up more often at higher ranks
  const pool = CHARACTERS.filter(c => c.rarity === 'B' || rp > 200 || c.rarity === 'A' || Math.random() < 0.3);
  const oc = pick(pool);
  const oRp = Math.max(0, Math.round(rp + rand(-80, 80)));
  const opponent = {
    type: 'fighter', charId: oc.id, passiveIdx: Math.round(Math.random()),
    level: clamp(Math.round(1 + rp / 220 + rand(-1, 1)), 1, 10), dupes: Math.min(6, Math.floor(rp / 500)),
    aiSkill: clamp(0.3 + rp / 2600 + rand(-0.05, 0.05), 0.25, 0.95),
    name: pick(BOT_NAMES) + (Math.random() < 0.5 ? Math.floor(rand(1, 99)) : ''), rankLabel: pvpTierLabel(oRp),
  };
  lastCfg = { mode: 'pvp', player: UI.queue.player, opponent };
  UI.queue = null; UI.versusT = 0; UI._launched = false;
  UI.show('versus', { cfg: lastCfg });
}

function launchBattle(cfg) {
  cfg.onEnd = res => onBattleEnd(res);
  HUD.ghost = new Map();
  Battle.start(cfg);
  UI.root.innerHTML = ''; UI.screen = 'battle'; document.body.dataset.screen = 'battle';
}

function onBattleEnd(res) {
  const d = Save.data, rewards = {};
  if (res.mode === 'pvp') {
    if (res.win) {
      d.pvp.streak = Math.max(0, d.pvp.streak) + 1;
      rewards.rp = 25 + Math.min(10, (d.pvp.streak - 1) * 3); rewards.gems = 80; rewards.coins = 300; d.pvp.wins++;
    } else { d.pvp.streak = 0; rewards.rp = -Math.min(18, d.pvp.rp); rewards.gems = 15; rewards.coins = 80; d.pvp.losses++; }
    d.pvp.rp = Math.max(0, d.pvp.rp + rewards.rp);
  } else if (res.mode === 'pve') {
    rewards.gems = { SS: 120, S: 90, A: 60, B: 40, C: 20 }[res.grade];
    rewards.coins = Math.floor(res.score / 40);
    d.pve.runs++;
    if (res.score > d.pve.best) { d.pve.best = res.score; d.pve.bestChar = res.player.ch.id; rewards.newBest = true; }
    const me = Leaderboard.board('pve', Seasons.pve(), d.pve.best, d.name, d.selected).find(e => e.you);
    rewards.rank = me ? me.rank : null;
  } else {
    ACTIONS.home(); return;
  }
  d.gems += rewards.gems || 0; d.coins += rewards.coins || 0;
  Save.write();
  UI.screen = 'results'; UI.params = { res, rewards };
  UI.root.innerHTML = SCREENS.results(UI.params); UI.paintAll();
}

function updateCamPanel() {
  const cv = document.getElementById('camview'); if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#17151f'; ctx.fillRect(0, 0, cv.width, cv.height);
  if (Vision.active && Vision.video) { ctx.save(); ctx.translate(cv.width, 0); ctx.scale(-1, 1); ctx.drawImage(Vision.video, 0, 0, cv.width, cv.height); ctx.restore(); }
  else { ctx.fillStyle = '#888'; ctx.font = '600 16px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Vision.status === 'loading' ? 'Loading camera + face model…' : 'Camera off', cv.width / 2, cv.height / 2); }
  const sens = Save.data.settings.sensitivity || 1;
  document.querySelectorAll('.meter').forEach(m => {
    const g = m.dataset.g, v = Math.min(1, Vision.values[g] * sens);
    m.querySelector('i').style.width = (v * 100) + '%';
    m.classList.toggle('hot', v >= Vision.thresholds[g]);
    if (Vision.fired[g]) { Vision.fired[g] = false; m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); }
  });
  const st = document.getElementById('camstatus');
  if (st) st.textContent = Vision.status === 'error' ? '⚠ ' + Vision.error : Vision.status === 'ready' ? (Vision.hasFace ? '✔ Face tracked — try each gesture, the bar turns green and "!" pops when it fires.' : 'Looking for your face…') : Vision.status === 'loading' ? 'Starting…' : '';
}
