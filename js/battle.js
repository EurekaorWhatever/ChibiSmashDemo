'use strict';
// ============================================================
//  Battle world: units, hitboxes, projectiles, damage, FX, HUD
// ============================================================

const Battle = {
  current: null,
  start(cfg) { this.current = new World(cfg); Input.ultQueued = false; Vision.clearFired(); return this.current; },
  stop() { this.current = null; },
};

const _portraits = {};
function portrait(ch, size = 96) {
  const key = ch.id + size;
  if (_portraits[key]) return _portraits[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), s = size / 96;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = ch.fx; ctx.fillRect(0, 0, size, size);
  Art.halftone(ctx, 0, 0, size, size, 'rgba(255,255,255,0.3)', 8 * s, 2.5 * s, 1);
  ctx.translate(size / 2 - 3 * s, size * 1.45); ctx.scale(s * 1.05, s * 1.05);
  Art.chibi(ctx, ch, { t: 1, eyes: 'open', mouth: 'smile' });
  return (_portraits[key] = c);
}

class World {
  constructor(cfg) {
    this.cfg = cfg; this.mode = cfg.mode;
    this.time = 0; this.dt = 0;
    this.units = []; this.hitboxes = []; this.projectiles = []; this.objects = []; this.fx = []; this.texts = [];
    this.shakeAmt = 0; this.shakeT = 0; this.hitstopT = 0; this.cutin = null;
    this.paused = false; this.state = 'countdown'; this.countdown = 3.4; this.koT = 0; this.finished = false;
    this.timer = cfg.mode === 'pvp' ? 99 : cfg.mode === 'pve' ? 180 : Infinity;
    this.bg = Art.makeBG(cfg.mode === 'pve' ? 'hollow' : cfg.mode === 'practice' ? 'dojo' : 'city');

    const pc = CHAR_BY_ID[cfg.player.charId];
    this.player = new Fighter(this, pc, { team: 0, x: 320, facing: 1, isPlayer: true, ctrl: new PlayerController(pc.gesture),
      passiveIdx: cfg.player.passiveIdx, level: cfg.player.level, dupes: cfg.player.dupes, name: cfg.player.name,
      noCooldowns: cfg.practice && cfg.practice.noCooldowns });
    this.units.push(this.player);

    const o = cfg.opponent;
    if (o.type === 'boss') this.enemy = new Boss(this, { hp: o.hp, noDeath: cfg.mode === 'practice' });
    else if (o.type === 'dummy') this.enemy = new Dummy(this, 900);
    else {
      const oc = CHAR_BY_ID[o.charId];
      this.enemy = new Fighter(this, oc, { team: 1, x: 960, facing: -1, ctrl: new AIController(o.aiSkill), passiveIdx: o.passiveIdx, level: o.level, dupes: o.dupes, name: o.name });
    }
    this.units.push(this.enemy);
    if (this.mode === 'practice') this.countdown = 1.2;
  }

  // ---------- queries ----------
  enemiesOf(e) { return this.units.filter(u => u.team !== e.team && !u.dead); }
  opponentOf(e) {
    let best = null, bd = 1e9;
    for (const u of this.units) if (u.team !== e.team && !u.dead) { const d = Math.abs(u.x - e.x); if (d < bd) { bd = d; best = u; } }
    return best;
  }

  // ---------- spawners ----------
  addHitbox(owner, d) {
    const hb = Object.assign({ owner, life: 0.08, hit: new Map(), action: d.fixed ? null : owner.action, kb: [0, 0], stun: 0 }, d);
    this.hitboxes.push(hb); return hb;
  }
  addProj(owner, d) {
    const p = Object.assign({ owner, t: 0, vx: 0, vy: 0, r: 10, life: 2, hit: new Set(), kb: [0, 0], stun: 0, color: '#fff' }, d);
    if (p.homing && !p.speed) p.speed = Math.hypot(p.vx, p.vy);
    this.projectiles.push(p); return p;
  }
  addObj(o) { this.objects.push(o); return o; }
  later(delay, fn) { const W = this; this.objects.push({ t: 0, layer: 'none', update(dt) { this.t += dt; if (this.t >= delay) { fn(); return false; } return true; }, draw() {} }); }
  startCutin(f, source, cb) {
    this.cutin = { f, t: 0, dur: 1.05, cb, source };
    if (f.isPlayer) f.stats.ultSource = source;
  }
  shake(a, t) { if (!Save.data.settings.shake) return; this.shakeAmt = Math.max(this.shakeAmt, a); this.shakeT = Math.max(this.shakeT, t); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }

  // ---------- damage pipeline ----------
  damage(src, tgt, mult, opts = {}) {
    if (!tgt || tgt.dead || (tgt.invuln && !opts.dot)) return 0;
    if (this.state !== 'fight') return 0;
    const dir = Math.sign(tgt.x - (opts.fromX != null ? opts.fromX : src.x)) || src.facing || 1;

    if (!opts.dot) {
      // parry
      if (tgt.parrying && opts.parryable !== false) {
        tgt.parrying = false; tgt.invulnT = 0.4;
        this.pop(tgt.x, tgt.y - 150, 'PARRY!', '#ffffff', 34); this.fxRing(tgt.x + tgt.facing * 30, tgt.y - 60, 80, '#ffffff'); this.hitstop(0.12); this.shake(8, 0.15);
        if (!opts.projectile && Math.abs(src.x - tgt.x) < 260 && src !== tgt) {
          if (src.isBoss) src.stun = Math.max(src.stun, 0.8);
          else if (src instanceof Fighter) { src.stun = Math.max(src.stun, 0.9); if (src.action && !src.action.invuln) { if (src.action.onEnd) src.action.onEnd(src, this, src.action); src.action = null; } }
          tgt.facing = Math.sign(src.x - tgt.x) || tgt.facing;
          tgt.action = Act({ name: 'riposte', dur: 0.32, invuln: true, ev: [[0.08, (f, W) => {
            W.damage(f, src, 1.8, { tag: 'skill', kb: [380, 220], stun: 0.6, parryable: false });
            W.fxSlash(src.x, src.y - 60, 80, f.facing, f.ch.fx, false);
          }]], tick(f) { f.anim.arm = 0; f.anim.wRot = 0; f.anim.lean = 0.25; f.anim.eyes = 'angry'; } });
        }
        return 0;
      }
      // arcane ward
      if (tgt.passive === 'ward' && Math.random() < 0.2) { this.pop(tgt.x, tgt.y - 140, 'BLOCK', '#c8b6ff', 26); this.fxRing(tgt.x, tgt.y - 60, 70, '#c8b6ff'); return 0; }
    }

    let raw = (src.atkPower ? src.atkPower() : 10) * mult, crit = false;
    if (!opts.dot) {
      if (src.focusReady) { raw *= 1.5; src.focusReady = false; this.pop(src.x, src.y - 160, 'FOCUS x1.5', '#4cc9f0', 18); }
      if (Math.random() < (src.critRate ? src.critRate() : 0)) { crit = true; raw *= 1 + (src.critDmg || 0.5); }
      raw -= Math.floor((tgt.defense ? tgt.defense() : 0) / 10);
      if (tgt.spinBlock && !opts.projectile) raw *= 0.6;
    }
    const dmg = Math.max(1, Math.round(raw));
    tgt.hp -= dmg;
    if (tgt.dpsWindow) tgt.dpsWindow.push({ t: this.time, d: dmg });
    if (src.stats) { src.stats.dealt += dmg; src.stats.hits++; }
    if (tgt.stats) tgt.stats.taken += dmg;

    // reactions
    if (!opts.dot) {
      if (tgt instanceof Fighter && !tgt.superArmor()) {
        if (opts.kb) { tgt.kbx = dir * opts.kb[0]; if (opts.kb[1]) { tgt.vy = -opts.kb[1]; tgt.onGround = false; } }
      }
      tgt.onHurt(src, opts);
      // energy
      if (src instanceof Fighter && !opts.noEnergy) src.energy = Math.min(100, src.energy + (opts.tag === 'basic' ? 2.5 : 3.5) + dmg * 0.03);
      if (tgt instanceof Fighter) tgt.energy = Math.min(100, tgt.energy + dmg / tgt.maxHp * 70);
      // passives / uniques
      if (src instanceof Fighter) {
        if (src.passive === 'lifesteal') src.hp = Math.min(src.maxHp, src.hp + dmg * 0.05);
        if (src.passive === 'hex' && Math.random() < 0.1) { tgt.status.hex = 4; this.pop(tgt.x, tgt.y - 170, 'HEXED', '#9b5de5', 20); }
        if (src.passive === 'pierce' && Math.random() < 0.1) { tgt.status.shred = 5; this.pop(tgt.x, tgt.y - 170, 'DEF DOWN', '#4cc9f0', 20); }
        if (src.unique === 'bleed' && crit) { tgt.status.bleed = 3; tgt._bleedSrc = src; this.fxPetals(tgt.x, tgt.y - 60, '#ff4d8d'); }
        src.combo++; src.comboTimer = 1.8; src.stats.maxCombo = Math.max(src.stats.maxCombo, src.combo);
      }
      // feel
      const big = opts.tag === 'ult' || mult >= 2;
      this.hitstop(opts.tag === 'ult' ? 0.05 : big ? 0.07 : 0.035);
      if (big) this.shake(7, 0.15);
      const hx = tgt.x + rand(-14, 14), hy = tgt.y - Math.min(tgt.h * 0.55, 130) + rand(-14, 14);
      this.fxImpact(hx, hy, src.ch ? src.ch.fx : '#ff9f1c', big);
    }
    this.pop(tgt.x + rand(-24, 24), tgt.y - Math.min(tgt.h, 240) - 20, crit ? dmg + '!' : String(dmg),
      opts.dot ? '#ff8fab' : crit ? '#ffd400' : tgt.team === 0 ? '#ff5a5a' : '#ffffff', crit ? 40 : opts.dot ? 18 : 28, crit);

    if (tgt.hp <= 0) {
      if (tgt.isDummy || tgt.noDeath) tgt.hp = tgt.maxHp;
      else { tgt.hp = 0; tgt.die(); this.onKO(tgt); }
    }
    return dmg;
  }

  onKO(u) {
    if (this.state !== 'fight') return;
    if (this.mode === 'practice' && u === this.enemy) {
      // bots respawn in practice
      setTimeout(() => { if (Battle.current === this) { u.dead = false; u.hp = u.maxHp; u.deadT = 0; u.x = 960; u.y = STAGE.GROUND; u.stun = 0; } }, 1500);
      return;
    }
    if (this.mode === 'practice' && u === this.player) { setTimeout(() => { if (Battle.current === this) { u.dead = false; u.hp = u.maxHp; u.deadT = 0; } }, 1200); return; }
    this.state = 'ko'; this.koT = 0; this.koUnit = u; this.hitstop(0.25); this.shake(20, 0.5);
  }

  // ---------- main update ----------
  update(dt) {
    if (this.paused || this.finished) return;
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeAmt = 0; }
    this.updateFx(dt);
    if (this.cutin) { this.cutin.t += dt; if (this.cutin.t >= this.cutin.dur) { const cb = this.cutin.cb; this.cutin = null; cb(); } return; }
    if (this.hitstopT > 0) { this.hitstopT -= dt; return; }
    if (this.state === 'ko') { this.koT += dt; dt *= this.koT < 1.2 ? 0.3 : 1; if (this.koT > 2.6) return this.finish(); }
    this.dt = dt; this.time += dt;

    if (this.state === 'countdown') { this.countdown -= dt; if (this.countdown <= 0) { this.state = 'fight'; } }
    else if (this.state === 'fight') {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 0; this.state = 'ko'; this.koT = 0; this.timeUp = true; }
    }

    for (const u of this.units) u.update(dt);
    this.separate();
    this.updateHitboxes(dt);
    this.updateProjectiles(dt);
    this.objects = this.objects.filter(o => o.update(dt) !== false);
  }

  separate() {
    const a = this.player, b = this.enemy;
    if (!a || !b || a.dead || b.dead || a.held || b.held) return;
    const minD = (a.w + b.w) / 2 * 0.7, dx = b.x - a.x;
    if (Math.abs(dx) < minD && Math.abs(a.y - b.y) < 80) {
      const push = (minD - Math.abs(dx)) * (Math.sign(dx) || 1);
      if (b.isBoss || b.isDummy) a.x -= push; else { a.x -= push / 2; b.x += push / 2; }
      a.x = clamp(a.x, STAGE.LEFT + a.w / 2, STAGE.RIGHT - a.w / 2);
      if (!b.isBoss && !b.isDummy) b.x = clamp(b.x, STAGE.LEFT + b.w / 2, STAGE.RIGHT - b.w / 2);
    }
  }

  hbRect(hb) {
    if (hb.fixed) return { x: hb.x - hb.w / 2, y: hb.y - hb.h / 2, w: hb.w, h: hb.h };
    const o = hb.owner, cx = o.x + o.facing * hb.dx, cy = o.y - hb.dy;
    return { x: cx - hb.w / 2, y: cy - hb.h / 2, w: hb.w, h: hb.h };
  }
  unitRect(u) { return { x: u.x - u.w / 2, y: u.y - u.h, w: u.w, h: u.h }; }

  updateHitboxes(dt) {
    for (const hb of this.hitboxes) {
      hb.life -= dt;
      if (hb.action && hb.owner.action !== hb.action) { hb.life = 0; continue; }
      if (hb.owner.dead && !hb.fixed) { hb.life = 0; continue; }
      const r = this.hbRect(hb);
      for (const e of this.enemiesOf(hb.owner)) {
        if (e.invuln) continue;
        const last = hb.hit.get(e);
        if (last != null && !(hb.rehit && this.time - last >= hb.rehit)) continue;
        const u = this.unitRect(e);
        if (r.x < u.x + u.w && r.x + r.w > u.x && r.y < u.y + u.h && r.y + r.h > u.y) {
          hb.hit.set(e, this.time);
          if (hb.grab) { if (hb.onHit) hb.onHit(e); hb.life = 0; break; }
          const d = this.damage(hb.owner, e, hb.mult, hb);
          if (hb.onHit && d > 0) hb.onHit(e);
        }
      }
    }
    this.hitboxes = this.hitboxes.filter(h => h.life > 0);
  }

  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      p.t += dt; p.life -= dt;
      let alive = p.life > 0;
      if (p.homing) {
        const t = this.opponentOf(p.owner);
        if (t) {
          const want = Math.atan2(t.y - t.h * 0.5 - p.y, t.x - p.x), cur = Math.atan2(p.vy, p.vx);
          let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          const na = cur + clamp(d, -p.homing * dt, p.homing * dt);
          p.vx = Math.cos(na) * p.speed; p.vy = Math.sin(na) * p.speed;
        }
      }
      if (p.gravity) p.vy += STAGE.GRAVITY * (p.gravity === true ? 1 : p.gravity) * dt;
      if (p.boomerang) {
        const b = p.boomerang, o = p.owner;
        if (!p.returning && (Math.abs(p.x - b.sx) >= b.dist || p.x < STAGE.LEFT || p.x > STAGE.RIGHT)) { p.returning = true; p.hit.clear(); }
        if (p.returning) {
          const dx = o.x - p.x, dy = (o.y - 60) - p.y, d = Math.hypot(dx, dy);
          if (d < 40 || o.dead) { alive = false; o.spearOut = false; }
          else { p.vx = dx / d * 1300; p.vy = dy / d * 1300; }
        }
        if (p.life <= 0) o.spearOut = false;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.ground && (p.fall || p.gravity) && p.y >= STAGE.GROUND - 6) { alive = false; this.fxDust(p.x, STAGE.GROUND); }
      if (!p.boomerang && (p.x < -150 || p.x > STAGE.W + 150)) alive = false;

      if (alive) for (const e of this.enemiesOf(p.owner)) {
        if (p.delay && p.t < p.delay) break;
        if (p.hit.has(e) || e.invuln) continue;
        // spin guard destroys projectiles
        if (e.spinBlock && p.tag !== 'ult' && Math.hypot(p.x - e.x, p.y - (e.y - 60)) < 95) {
          alive = false; this.pop(e.x, e.y - 150, 'DEFLECT', '#4cc9f0', 22); this.fxSpark(p.x, p.y, '#ffffff'); if (p.boomerang) p.owner.spearOut = false; break;
        }
        const u = this.unitRect(e);
        const cx = clamp(p.x, u.x, u.x + u.w), cy = clamp(p.y, u.y, u.y + u.h);
        if ((p.x - cx) ** 2 + (p.y - cy) ** 2 <= p.r * p.r) {
          p.hit.add(e);
          const d = this.damage(p.owner, e, p.mult, Object.assign({}, p, { projectile: true, fromX: p.x - Math.sign(p.vx) * 10 }));
          if (d > 0 && p.onHit) p.onHit(e, p);
          if (d > 0 && p.returning && p.onReturnHit) p.onReturnHit(e, p);
          if (!p.pierce) { alive = false; if (p.boomerang) { p.returning = true; alive = true; } break; }
        }
      }
      if (alive) keep.push(p);
    }
    this.projectiles = keep;
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const P = this.player, E = this.enemy;
    let win;
    if (this.timeUp) win = P.hp / P.maxHp >= E.hp / E.maxHp;
    else win = !P.dead;
    const res = { mode: this.mode, win, timeUp: !!this.timeUp, time: this.time, player: P, enemy: E,
      dealt: P.stats.dealt, taken: P.stats.taken, maxCombo: P.stats.maxCombo, hpPct: P.hp / P.maxHp };
    if (this.mode === 'pve') {
      const killed = E.dead, timeLeft = Math.max(0, this.timer);
      const parts = {
        damage: Math.round(P.stats.dealt * 10),
        clear: killed ? 20000 : 0,
        time: killed ? Math.round(timeLeft * 120) : 0,
        hp: killed ? Math.round(res.hpPct * 15000) : 0,
        combo: P.stats.maxCombo * 150,
      };
      res.killed = killed; res.parts = parts;
      res.score = Object.values(parts).reduce((a, b) => a + b, 0);
      res.grade = res.score >= 125000 ? 'SS' : res.score >= 105000 ? 'S' : res.score >= 80000 ? 'A' : res.score >= 50000 ? 'B' : 'C';
    }
    if (this.cfg.onEnd) setTimeout(() => this.cfg.onEnd(res), 50);
  }

  // ---------- FX ----------
  pop(x, y, text, color, size = 26, crit = false) { this.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9, crit }); }
  fxImpact(x, y, color, big) {
    this.fx.push({ k: 'impact', x, y, color, life: 0.16, max: 0.16, s: big ? 1.6 : 1, rot: rand(0, 6) });
    for (let i = 0; i < (big ? 10 : 5); i++) { const a = rand(0, Math.PI * 2), s = rand(300, 700); this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.22, max: 0.22, color }); }
  }
  fxSpark(x, y, color) { for (let i = 0; i < 6; i++) { const a = rand(0, Math.PI * 2), s = rand(200, 500); this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25, max: 0.25, color }); } }
  fxBurst(x, y, color, n = 12) { for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(100, 420); this.fx.push({ k: 'blob', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: rand(0.3, 0.6), max: 0.6, color, r: rand(5, 12) }); } }
  fxRing(x, y, r, color) { this.fx.push({ k: 'ring', x, y, r, color, life: 0.3, max: 0.3 }); }
  fxSlash(x, y, r, dir, color, up, rot = 0) { this.fx.push({ k: 'slash', x, y, r, dir, color, up, rot, life: 0.16, max: 0.16 }); }
  fxThrust(x, y, dir, color, len) { this.fx.push({ k: 'thrust', x, y, dir, color, len, life: 0.12, max: 0.12 }); }
  fxLine(x1, y1, x2, y2, color, w) { this.fx.push({ k: 'line', x1, y1, x2, y2, color, w, life: 0.3, max: 0.3 }); }
  fxDust(x, y) { for (let i = 0; i < 5; i++) this.fx.push({ k: 'dust', x: x + rand(-20, 20), y: y - 6, vx: rand(-120, 120), vy: rand(-80, -20), life: rand(0.3, 0.5), max: 0.5, r: rand(8, 14) }); }
  fxPetals(x, y, color) { for (let i = 0; i < 6; i++) this.fx.push({ k: 'petal', x, y, vx: rand(-200, 200), vy: rand(-260, -60), life: 0.8, max: 0.8, color, rot: rand(0, 6) }); }
  fxAfterimage(f) { this.fx.push({ k: 'ghost', x: f.x, y: f.y, ch: f.ch, facing: f.facing, anim: Object.assign({}, f.anim), life: 0.2, max: 0.2 }); }
  fxDragon(f) { this.fx.push({ k: 'blob', x: f.x - f.facing * 30 + rand(-10, 10), y: f.y - 60 + rand(-40, 40), vx: -f.facing * 100, vy: rand(-40, 40), life: 0.4, max: 0.4, color: f.ch.fx, r: rand(14, 24) }); }

  updateFx(dt) {
    for (const p of this.fx) { p.life -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'petal' || p.k === 'blob') p.vy += 600 * dt; } }
    this.fx = this.fx.filter(p => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 60 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  drawFx(ctx) {
    for (const p of this.fx) {
      const a = p.life / p.max;
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.4);
      switch (p.k) {
        case 'impact':
          Art.star(ctx, p.x, p.y, 34 * p.s * (1.2 - a * 0.4), 14 * p.s, 8, p.rot); Art.ink(ctx, '#fff', 4);
          Art.star(ctx, p.x, p.y, 18 * p.s, 8 * p.s, 8, p.rot + 0.3); ctx.fillStyle = p.color; ctx.fill(); break;
        case 'spark':
          ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); break;
        case 'blob': Art.ell(ctx, p.x, p.y, p.r * a, p.r * a); ctx.fillStyle = p.color; ctx.fill(); break;
        case 'ring': Art.ell(ctx, p.x, p.y, p.r * (1.2 - a), p.r * (1.2 - a) * 0.6); ctx.strokeStyle = p.color; ctx.lineWidth = 6 * a + 1; ctx.stroke(); break;
        case 'slash': {
          ctx.translate(p.x, p.y); ctx.scale(p.dir, p.up ? -1 : 1); ctx.rotate(p.rot);
          const r = p.r, sweep = (1 - a) * 0.6;
          ctx.beginPath(); ctx.arc(-r * 0.3, 0, r, -1.3 + sweep, 1.1 + sweep); ctx.arc(-r * 0.45, 0, r * 0.82, 1.1 + sweep, -1.3 + sweep, true); ctx.closePath();
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = p.color; ctx.lineWidth = 5; ctx.stroke(); break;
        }
        case 'thrust':
          ctx.translate(p.x, p.y); ctx.scale(p.dir, 1);
          ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(p.len * (1.2 - a * 0.4), 0); ctx.lineTo(0, 7); ctx.closePath();
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.stroke(); break;
        case 'line':
          ctx.strokeStyle = p.color; ctx.lineWidth = p.w * a; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = p.w * a * 0.4; ctx.stroke(); break;
        case 'dust': Art.ell(ctx, p.x, p.y, p.r * (1.5 - a * 0.5), p.r * (1.5 - a * 0.5)); Art.ink(ctx, '#f1f1f1', 2.5); break;
        case 'petal': ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.life * 8); Art.ell(ctx, 0, 0, 7, 4); ctx.fillStyle = p.color; ctx.fill(); break;
        case 'ghost': ctx.globalAlpha = a * 0.45; ctx.translate(p.x, p.y); ctx.scale(p.facing, 1);
          Art.chibi(ctx, p.ch, { t: 0, arm: p.anim.arm, wRot: p.anim.wRot, lean: p.anim.lean, eyes: 'angry', mouth: 'grit' }); break;
      }
      ctx.restore();
    }
    for (const t of this.texts) {
      const a = t.life / t.max, sc = t.crit ? 1 + Math.max(0, (a - 0.8)) * 3 : 1;
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(t.x, t.y); ctx.scale(sc, sc);
      Art.text(ctx, t.text, 0, 0, t.size, t.color); ctx.restore();
    }
  }

  drawProj(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y);
    const ang = Math.atan2(p.vy, p.vx);
    switch (p.kind) {
      case 'arrow': case 'bigArrow': {
        ctx.rotate(ang); const L = p.kind === 'bigArrow' ? 56 : 40;
        ctx.strokeStyle = INK; ctx.lineWidth = p.kind === 'bigArrow' ? 7 : 5; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.strokeStyle = p.color; ctx.lineWidth = p.kind === 'bigArrow' ? 3.5 : 2.5; ctx.stroke();
        Art.poly(ctx, [[0, -7], [14, 0], [0, 7]]); Art.ink(ctx, '#fff', 3);
        Art.poly(ctx, [[-L, 0], [-L - 8, -7], [-L + 6, 0], [-L - 8, 7]]); Art.ink(ctx, p.color, 2.5);
        if (p.kind === 'bigArrow') { ctx.globalAlpha = 0.5; ctx.fillStyle = p.color; ctx.fillRect(-L - 60, -3, 60, 6); }
        break;
      }
      case 'pellet': Art.ell(ctx, 0, 0, 8, 8); Art.ink(ctx, p.color, 3); break;
      case 'bolt': case 'orb': case 'orbBoss': case 'ember': {
        ctx.shadowColor = p.color; ctx.shadowBlur = 16;
        Art.ell(ctx, 0, 0, p.r, p.r); Art.ink(ctx, p.color, 3);
        Art.ell(ctx, -p.r * 0.3, -p.r * 0.3, p.r * 0.4, p.r * 0.4); ctx.fillStyle = '#fff'; ctx.fill(); break;
      }
      case 'fire': {
        ctx.rotate(ang); ctx.shadowColor = '#ff7b00'; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-20, -24, 6, -18); ctx.arc(6, 0, 18, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(-20, 24, -50, 0);
        Art.ink(ctx, '#ff5400', 3.5); Art.ell(ctx, 4, 0, 10, 10); ctx.fillStyle = '#ffd166'; ctx.fill(); break;
      }
      case 'wave': {
        const d = Math.sign(p.vx) || 1; ctx.scale(d, 1);
        ctx.beginPath(); ctx.moveTo(-30, 22); ctx.quadraticCurveTo(0, -46, 22, 22); ctx.closePath();
        ctx.globalAlpha = 0.9; Art.ink(ctx, p.color, 4);
        ctx.beginPath(); ctx.moveTo(-16, 22); ctx.quadraticCurveTo(2, -20, 12, 22); ctx.fillStyle = '#fff'; ctx.fill(); break;
      }
      case 'spear': {
        ctx.rotate(p.returning ? ang + Math.PI : ang); ctx.rotate(p.returning ? 0 : 0);
        const f = p.owner; ctx.translate(-40, 0); Art.weapon(ctx, f.ch.weapon, f.ch.fx, f.ch.look, { t: p.t }); break;
      }
      case 'star': {
        ctx.shadowColor = p.color; ctx.shadowBlur = 20;
        ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-p.vx * 0.06, -p.vy * 0.06); ctx.stroke();
        Art.star(ctx, 0, 0, 16, 7, 5, p.t * 10); Art.ink(ctx, '#fff8c2', 3); break;
      }
    }
    ctx.restore();
  }

  // ---------- render ----------
  draw(ctx) {
    ctx.save();
    if (this.shakeT > 0) ctx.translate(rand(-1, 1) * this.shakeAmt, rand(-1, 1) * this.shakeAmt);
    ctx.drawImage(this.bg, 0, 0);
    // shadows
    for (const u of this.units) {
      const h = STAGE.GROUND - u.y, s = Math.max(0.4, 1 - h / 400);
      ctx.save(); ctx.globalAlpha = 0.28; Art.ell(ctx, u.x, STAGE.GROUND + 4, u.w * 0.75 * s, 9 * s); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    }
    for (const o of this.objects) if (o instanceof Crater || o instanceof Fissure) o.draw(ctx);
    // draw enemy first, player on top
    const order = [...this.units].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const u of order) u.draw(ctx);
    for (const o of this.objects) if (!(o instanceof Crater || o instanceof Fissure) && o.layer !== 'none') o.draw(ctx);
    for (const p of this.projectiles) this.drawProj(ctx, p);
    this.drawFx(ctx);
    ctx.restore();

    HUD.draw(ctx, this);
    if (this.cutin) HUD.cutin(ctx, this, this.cutin);
  }
}

// ============================================================
//  HUD
// ============================================================
const HUD = {
  bar(ctx, x, y, w, h, pct, color, back, flip, ghost) {
    ctx.save();
    const sk = 14;
    const path = (ww) => { ctx.beginPath(); if (!flip) { ctx.moveTo(x + sk, y); ctx.lineTo(x + ww, y); ctx.lineTo(x + ww - sk, y + h); ctx.lineTo(x, y + h); } else { ctx.moveTo(x + w - sk, y); ctx.lineTo(x + w - ww, y); ctx.lineTo(x + w - ww + sk, y + h); ctx.lineTo(x + w, y + h); } ctx.closePath(); };
    path(w); ctx.fillStyle = back; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    if (ghost != null && ghost > pct) { path(Math.max(sk, w * ghost)); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    if (pct > 0) { path(Math.max(sk, w * pct)); ctx.fillStyle = color; ctx.fill(); }
    path(w); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  },
  ghost: new Map(),
  ghostOf(u) { let g = this.ghost.get(u); if (g == null) g = u.hp / u.maxHp; g = Math.max(u.hp / u.maxHp, g - 0.006); this.ghost.set(u, g); return g; },

  fighterPanel(ctx, W, u, right) {
    const x = right ? STAGE.W - 40 - 470 : 40, y = 24;
    const pc = u.ch ? portrait(u.ch, 84) : null;
    const px = right ? STAGE.W - 40 - 84 : 40;
    ctx.save();
    ctx.beginPath(); ctx.arc(px + 42, y + 42, 46, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    if (pc) ctx.drawImage(pc, px, y);
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(px + 42, y + 42, 42, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    const bx = right ? x : x + 96, bw = 374;
    const hpCol = u.hp / u.maxHp > 0.3 ? '#c6ff00' : '#ff3d4f';
    this.bar(ctx, bx, y + 22, bw, 26, u.hp / u.maxHp, hpCol, '#3a3346', right, this.ghostOf(u));
    Art.text(ctx, `${Math.ceil(u.hp)} / ${u.maxHp}`, right ? bx + bw - 70 : bx + 70, y + 36, 15, '#fff', { stroke: 4 });
    Art.text(ctx, u.name.toUpperCase(), right ? bx + bw : bx, y + 8, 20, '#fff', { align: right ? 'right' : 'left', stroke: 5 });
    if (u.ch) {
      const rar = RARITY[u.ch.rarity];
      Art.text(ctx, `${u.ch.rarity}  Lv.${u.level}`, right ? bx + bw - ctx.measureText(u.name.toUpperCase()).width - 20 : bx + ctx.measureText(u.name.toUpperCase()).width + 20, y + 9, 14, rar.color, { align: right ? 'right' : 'left', stroke: 4 });
    }
    // energy
    const full = u.energy >= 100;
    this.bar(ctx, right ? bx + bw * 0.35 : bx, y + 54, bw * 0.65, 14, u.energy / 100, full ? (Math.sin(W.time * 10) > 0 ? '#00f0ff' : '#ffffff') : '#00b7ff', '#2a2536', right);
    if (full) Art.text(ctx, 'ULT READY', right ? bx + bw * 0.35 - 10 : bx + bw * 0.65 + 10, y + 61, 14, '#00f0ff', { align: right ? 'right' : 'left', stroke: 4 });
    // status icons
    let sx = right ? bx + bw - 20 : bx + 10;
    const st = u.status || {}, icons = [];
    if (st.hex > 0) icons.push(['HEX', '#9b5de5']); if (st.shred > 0) icons.push(['DEF↓', '#4cc9f0']); if (st.bleed > 0) icons.push(['BLEED', '#ff4d8d']);
    if (st.slow > 0) icons.push(['SLOW', '#8d99ae']); if (st.swift > 0) icons.push(['SWIFT', '#7fffd4']); if (u.focusReady) icons.push(['FOCUS', '#4cc9f0']);
    for (const [t, c] of icons) { Art.text(ctx, t, sx, y + 84, 13, c, { align: right ? 'right' : 'left', stroke: 3.5 }); sx += (right ? -1 : 1) * (ctx.measureText(t).width + 12); }
  },

  bossBar(ctx, W, b) {
    const w = 480, x = STAGE.W - 40 - w, y = 46;
    Art.text(ctx, (b.enraged ? '★ ENRAGED  ' : '') + b.name, x + w, y - 16, 22, b.enraged ? '#ff3d7f' : '#ffd400', { align: 'right', stroke: 5 });
    this.bar(ctx, x, y, w, 30, b.hp / b.maxHp, b.enraged ? '#ff3d7f' : '#ff9f1c', '#2a1f36', true, this.ghostOf(b));
    Art.text(ctx, `${Math.ceil(b.hp)} / ${b.maxHp}`, x + w - 80, y + 16, 16, '#fff', { stroke: 4 });
  },

  skills(ctx, W, f) {
    const keys = ['U', 'I', 'O'], x0 = 40, y0 = STAGE.H - 92;
    for (let i = 0; i < 3; i++) {
      const sk = f.cls.skills[i], x = x0 + i * 78, cd = f.cds[i], ready = cd <= 0;
      ctx.save(); ctx.translate(x, y0); ctx.transform(1, 0, -0.18, 1, 0, 0);
      Art.rr(ctx, 0, 0, 66, 66, 10); Art.ink(ctx, ready ? f.ch.fx : '#3a3346', 4);
      if (!ready) { ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = '#000'; const h = 66 * (cd / sk.cd); ctx.fillRect(2, 66 - h, 62, h); ctx.restore(); }
      ctx.restore();
      Art.text(ctx, sk.icon, x + 27, y0 + 30, 28, '#fff', { stroke: 4, italic: false, font: 'sans-serif' });
      if (!ready) Art.text(ctx, cd.toFixed(1), x + 27, y0 + 33, 22, '#fff', { stroke: 5 });
      Art.text(ctx, keys[i], x + 4, y0 + 2, 15, '#ffd400', { stroke: 4 });
    }
    // basic attack hint
    const pat = f.cls.pattern.length, idx = f.comboIdx;
    Art.text(ctx, 'J', x0 + 250, y0 + 4, 15, '#ffd400', { stroke: 4 });
    for (let i = 0; i < pat; i++) { Art.ell(ctx, x0 + 268 + i * 18, y0 + 34, 6, 6); Art.ink(ctx, i < idx ? f.ch.fx : '#3a3346', 3); }
    Art.text(ctx, 'COMBO', x0 + 252, y0 + 58, 12, '#fff', { align: 'left', stroke: 3 });
    // ult
    const ux = x0 + 400, uy = y0 + 32, full = f.energy >= 100;
    ctx.save();
    Art.ell(ctx, ux, uy, 40, 40); Art.ink(ctx, full ? '#00f0ff' : '#2a2536', 5);
    ctx.beginPath(); ctx.arc(ux, uy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.energy / 100); ctx.strokeStyle = '#00b7ff'; ctx.lineWidth = 7; ctx.stroke();
    const g = GESTURES[f.gesture];
    if (Vision.active && full) { const pr = Vision.progress(f.gesture); ctx.beginPath(); ctx.arc(ux, uy, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr); ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 6; ctx.stroke(); }
    ctx.restore();
    Art.text(ctx, g.icon, ux, uy + 2, 34, '#fff', { italic: false, font: 'sans-serif', stroke: 2 });
    Art.text(ctx, 'ULT', ux, uy + 52, 14, full ? '#00f0ff' : '#888', { stroke: 4 });
    Art.text(ctx, Vision.active ? `${g.name} — or F+G+H+⏎` : 'Hold F+G+H, press ⏎', ux + 56, uy - 14, 14, full ? '#fff' : '#999', { align: 'left', stroke: 4 });
    if (Input.comboHeld()) Art.text(ctx, 'F G H held… press ENTER!', ux + 56, uy + 8, 14, '#ffd400', { align: 'left', stroke: 4 });
  },

  camera(ctx, W, f) {
    if (!Vision.active || !Save.data.settings.showCam) return;
    const w = 200, h = 150, x = STAGE.W - w - 24, y = STAGE.H - h - 24;
    ctx.save();
    Art.rr(ctx, x - 4, y - 4, w + 8, h + 8, 12); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); Art.rr(ctx, x, y, w, h, 9); ctx.clip();
    ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(Vision.video, 0, 0, w, h);
    ctx.restore();
    const g = GESTURES[f.gesture], v = Math.min(1, Vision.values[f.gesture] * (Save.data.settings.sensitivity || 1));
    ctx.fillStyle = '#000a'; ctx.fillRect(x, y + h - 26, w, 26);
    ctx.fillStyle = v >= Vision.thresholds[f.gesture] ? '#c6ff00' : '#00b7ff'; ctx.fillRect(x, y + h - 6, w * v, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + w * Vision.thresholds[f.gesture] - 1, y + h - 10, 3, 10);
    Art.text(ctx, `${g.icon} ${g.name}${Vision.hasFace ? '' : ' (no face)'}`, x + 8, y + h - 16, 13, '#fff', { align: 'left', stroke: 3 });
  },

  draw(ctx, W) {
    const P = W.player, E = W.enemy;
    this.fighterPanel(ctx, W, P, false);
    if (E.isBoss) this.bossBar(ctx, W, E);
    else if (E.isDummy) {
      Art.text(ctx, 'TRAINING DUMMY', STAGE.W - 40, 40, 22, '#fff', { align: 'right', stroke: 5 });
      Art.text(ctx, `DPS (5s): ${Math.round(E.dps)}`, STAGE.W - 40, 72, 20, '#c6ff00', { align: 'right', stroke: 5 });
      Art.text(ctx, `Total: ${P.stats.dealt}`, STAGE.W - 40, 100, 18, '#fff', { align: 'right', stroke: 4 });
    } else this.fighterPanel(ctx, W, E, true);

    // timer
    if (W.timer !== Infinity) {
      ctx.save(); ctx.translate(STAGE.W / 2, 50); ctx.transform(1, 0, -0.2, 1, 0, 0);
      Art.rr(ctx, -50, -32, 100, 64, 10); Art.ink(ctx, '#17151f', 4);
      ctx.restore();
      Art.text(ctx, String(Math.ceil(W.timer)), STAGE.W / 2, 52, 40, W.timer < 10 ? '#ff3d4f' : '#ffd400', { stroke: 6 });
    }
    if (W.mode === 'pve') {
      const live = Math.round(P.stats.dealt * 10 + P.stats.maxCombo * 150);
      Art.text(ctx, `SCORE ${live.toLocaleString()}`, STAGE.W / 2, 104, 18, '#fff', { stroke: 4 });
    }
    // combo
    if (P.combo >= 2) {
      const s = 1 + Math.max(0, P.comboTimer - 1.6) * 2;
      ctx.save(); ctx.translate(STAGE.W - 140, 250); ctx.rotate(-0.08); ctx.scale(s, s);
      Art.text(ctx, String(P.combo), 0, 0, 64, '#ffd400', { stroke: 9 });
      Art.text(ctx, 'HITS', 0, 44, 24, '#fff', { stroke: 5 });
      ctx.restore();
    }
    this.skills(ctx, W, P);
    this.camera(ctx, W, P);
    if (W.mode === 'practice') {
      const pr = W.cfg.practice || {};
      Art.text(ctx, `PRACTICE  ·  ${pr.noCooldowns ? 'No cooldowns ON' : 'Normal cooldowns'}  ·  ESC to exit`, STAGE.W / 2, 104, 16, '#c6ff00', { stroke: 4 });
    }

    // countdown / KO
    if (W.state === 'countdown') {
      const n = Math.ceil(W.countdown - 0.4);
      const txt = n > 0 ? String(n) : 'FIGHT!';
      const f = (W.countdown % 1);
      ctx.save(); ctx.translate(STAGE.W / 2, STAGE.H / 2 - 40); ctx.scale(1 + f * 0.4, 1 + f * 0.4);
      Art.text(ctx, txt, 0, 0, n > 0 ? 120 : 110, n > 0 ? '#fff' : '#c6ff00', { stroke: 14 }); ctx.restore();
    }
    if (W.state === 'fight' && W.time < 0.6 && W.mode !== 'practice') {
      ctx.save(); ctx.globalAlpha = 1 - W.time / 0.6; Art.text(ctx, 'FIGHT!', STAGE.W / 2, STAGE.H / 2 - 40, 110, '#c6ff00', { stroke: 14 }); ctx.restore();
    }
    if (W.state === 'ko') {
      const t = Math.min(1, W.koT * 3);
      ctx.save(); ctx.translate(STAGE.W / 2, STAGE.H / 2 - 40); ctx.rotate(-0.1); ctx.scale(2 - t, 2 - t); ctx.globalAlpha = t;
      Art.star(ctx, 0, 0, 220, 120, 14, 0); Art.ink(ctx, W.timeUp ? '#ffd400' : '#ff3d4f', 8);
      Art.text(ctx, W.timeUp ? 'TIME UP' : 'K.O.', 0, 0, 110, '#fff', { stroke: 14 });
      ctx.restore();
    }
  },

  cutin(ctx, W, c) {
    const f = c.f, t = c.t / c.dur;
    const slide = t < 0.2 ? easeOut(t / 0.2) : t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
    ctx.save();
    ctx.fillStyle = `rgba(10,8,20,${0.65 * slide})`; ctx.fillRect(0, 0, STAGE.W, STAGE.H);
    ctx.translate(0, STAGE.H / 2);
    ctx.save(); ctx.rotate(-0.12);
    ctx.fillStyle = f.ch.fx; ctx.fillRect(-100 + (1 - slide) * -1500, -120, STAGE.W + 300, 240);
    Art.halftone(ctx, -100 + (1 - slide) * -1500, -120, STAGE.W + 300, 240, 'rgba(255,255,255,0.25)', 16, 5, 1);
    ctx.fillStyle = INK; ctx.fillRect(-100 + (1 - slide) * -1500, -130, STAGE.W + 300, 12); ctx.fillRect(-100 + (1 - slide) * -1500, 118, STAGE.W + 300, 12);
    // speed lines
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
    for (let i = 0; i < 18; i++) { const y = -110 + (i * 53 % 220), x = ((i * 97 + c.t * 3000) % (STAGE.W + 400)) - 200; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 140, y); ctx.stroke(); }
    ctx.restore();
    // big character
    ctx.save(); ctx.translate(360 + (1 - slide) * -700, 230); ctx.scale(3.2, 3.2);
    Art.chibi(ctx, f.ch, { t: W.time, eyes: f.ch.cls === 'magic' ? 'happy' : 'angry', mouth: f.gesture === 'tongue' ? 'tongue' : f.gesture === 'mouth' ? 'open' : 'grit', arm: -1.2, wRot: 0 });
    ctx.restore();
    const g = GESTURES[f.gesture];
    Art.text(ctx, f.cls.ult.name.toUpperCase(), 760 + (1 - slide) * 900, -24, 64, '#fff', { stroke: 12 });
    Art.text(ctx, c.source === 'keys' && f.isPlayer ? 'F + G + H + ENTER!' : `${g.icon} ${g.name.toUpperCase()}!`, 760 + (1 - slide) * 1200, 44, 28, '#ffd400', { stroke: 7 });
    ctx.restore();
  },
};
