'use strict';
// ============================================================
//  Fighter: stats, passives, actions (basic / skills / ult)
// ============================================================

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const rand = (a, b) => a + Math.random() * (b - a);

// Idle weapon pose per class: [arm angle, weapon rotation relative to arm]
const IDLE_POSE = { melee: [0.9, -0.5], heavy: [0.6, -2.4], ranged: [0.1, 0], magic: [0.6, -2.0], polearm: [0.7, -1.6] };

// Action factory. ev: [[time, fn(f, W, a)], ...]
function Act(o) {
  return Object.assign({ t: 0, dur: 0.3, tick: null, superArmor: false, invuln: false, onEnd: null, name: '' }, o,
    { ev: (o.ev || []).map(e => ({ t: e[0], fn: e[1], done: false })) });
}

class Fighter {
  constructor(W, ch, opts = {}) {
    this.W = W; this.ch = ch; this.cls = CLASSES[ch.cls];
    this.team = opts.team || 0;
    this.name = opts.name || ch.name;
    this.ctrl = opts.ctrl || null;
    this.isPlayer = !!opts.isPlayer;
    const lvl = opts.level || 1, dupes = opts.dupes || 0;
    const mul = 1 + 0.05 * (lvl - 1) + 0.03 * dupes;
    const b = this.cls.base;
    this.level = lvl; this.dupes = dupes;
    this.maxHp = Math.round(b.hp * mul); this.hp = this.maxHp;
    this.baseAtk = b.atk * mul; this.baseDef = b.def;
    this.baseCrit = b.crit; this.critDmg = b.critDmg;
    this.passive = this.cls.passives[opts.passiveIdx || 0].id;
    this.unique = ch.unique;
    this.gesture = ch.gesture;

    this.x = opts.x || 300; this.y = STAGE.GROUND; this.vx = 0; this.vy = 0; this.kbx = 0;
    this.w = 56; this.h = 112; this.facing = opts.facing || 1; this.onGround = true;
    this.action = null; this.stun = 0; this.invulnT = 0; this.held = null;
    this.comboIdx = 0; this.comboT = 0; this.atkCd = 0;
    this.cds = [0, 0, 0]; this.energy = opts.energy || 0;
    this.status = { hex: 0, shred: 0, bleed: 0, slow: 0, swift: 0 };
    this.swiftCycle = 0; this.idleT = 0; this.focusReady = false;
    this.parrying = false; this.spinBlock = false; this.spearOut = false;
    this.flash = 0; this.t = Math.random() * 10; this.walk = 0; this.dead = false; this.deadT = 0;
    this.combo = 0; this.comboTimer = 0;
    this.stats = { dealt: 0, taken: 0, maxCombo: 0, hits: 0, ults: 0, skills: 0 };
    this.input = { move: 0 };
    this.anim = {};
    this.noCooldowns = !!opts.noCooldowns;
  }

  // ---------- derived stats ----------
  atkPower() { let a = this.baseAtk; if (this.passive === 'bruteAS' || this.passive === 'bruteMS') a *= 1.2; if (this.status.hex > 0) a *= 0.9; return a; }
  atkSpeed() { let s = 1; if (this.passive === 'atkspd') s *= 1.15; if (this.passive === 'bruteAS') s *= 0.85; if (this.status.hex > 0) s *= 0.85; return s; }
  moveSpeed() { let m = this.cls.move; if (this.passive === 'bruteMS') m *= 0.85; if (this.status.hex > 0) m *= 0.85; if (this.status.slow > 0) m *= 0.6; if (this.status.swift > 0) m *= 1.1; return m; }
  critRate() { return this.baseCrit + (this.passive === 'eagle' ? 0.2 : 0); }
  defense() { return this.baseDef * (this.status.shred > 0 ? 0.85 : 1); }
  superArmor() { return !!(this.action && (this.action.superArmor || this.action.invuln)); }
  get invuln() { return this.invulnT > 0 || !!(this.action && this.action.invuln) || this.dead; }
  get cy() { return this.y - this.h / 2; }

  // ---------- update ----------
  update(dt) {
    const W = this.W;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 5);
    this.invulnT = Math.max(0, this.invulnT - dt);
    for (const k in this.status) this.status[k] = Math.max(0, this.status[k] - dt);
    for (let i = 0; i < 3; i++) this.cds[i] = this.noCooldowns ? 0 : Math.max(0, this.cds[i] - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.comboT = Math.max(0, this.comboT - dt); if (this.comboT === 0) this.comboIdx = 0;
    this.comboTimer = Math.max(0, this.comboTimer - dt); if (this.comboTimer === 0) this.combo = 0;
    if (this.noCooldowns) this.energy = 100;
    this.energy = Math.min(100, this.energy + dt * 0.8);
    // passives over time
    if (this.passive === 'swift') {
      this.swiftCycle += dt;
      if (this.swiftCycle >= 30) { this.swiftCycle = 0; this.status.swift = 10; W.pop(this.x, this.y - 140, 'TAILWIND', '#7fffd4', 22); }
      if (this.W.time < 0.1 && this.swiftCycle < 0.1) this.status.swift = 10;
    }
    if (this.passive === 'focus') { this.idleT += dt; if (this.idleT >= 3 && !this.focusReady) { this.focusReady = true; W.pop(this.x, this.y - 140, 'FOCUS', '#4cc9f0', 20); } }
    if (this.status.bleed > 0) {
      this._bleedT = (this._bleedT || 0) + dt;
      if (this._bleedT >= 0.5) { this._bleedT = 0; W.damage(this._bleedSrc || this, this, 0.2, { dot: true, tag: 'dot', noEnergy: true }); }
    }

    this.parrying = false; this.spinBlock = false;
    const [ia, iw] = IDLE_POSE[this.ch.cls];
    this.anim = { arm: ia, wRot: iw, arm2: null, lean: 0, squash: 1, eyes: 'open', mouth: 'smile', draw: false, aura: null };

    if (this.dead) { this.deadT += dt; this.anim.eyes = 'hurt'; this.anim.mouth = 'open'; this.physics(dt); return; }
    if (this.held) { this.anim.eyes = 'hurt'; this.anim.mouth = 'open'; return; }

    const inp = this.ctrl && W.state === 'fight' ? this.ctrl.get(this, W) : { move: 0, skill: [] };
    this.input = inp;
    // buffer skill presses for a moment so they fire as soon as the current action ends
    if (inp.skill) for (let i = 0; i < 3; i++) if (inp.skill[i]) this.buf = { i, t: 0.35 };
    if (this.buf && (this.buf.t -= dt) <= 0) this.buf = null;

    if (this.stun > 0) {
      this.stun -= dt; this.vx = 0;
      this.anim.eyes = 'hurt'; this.anim.mouth = 'open'; this.anim.lean = -0.15; this.anim.arm = 1.5;
      if (inp.ult) this.tryUlt(inp);
    } else if (this.action) {
      this.runAction(dt);
      if (inp.ult && !this.action?.isUlt) this.tryUlt(inp);
    } else {
      this.control(dt, inp);
    }
    this.physics(dt);
  }

  runAction(dt) {
    const a = this.action;
    a.t += dt;
    for (const e of a.ev) if (!e.done && a.t >= e.t) { e.done = true; e.fn(this, this.W, a); if (this.action !== a) return; }
    if (a.tick) a.tick(this, dt, a);
    if (this.action === a && a.t >= a.dur) { this.action = null; if (a.onEnd) a.onEnd(this, this.W, a); }
  }

  control(dt, inp) {
    const W = this.W, foe = W.opponentOf(this);
    if (foe) this.facing = Math.sign(foe.x - this.x) || this.facing;
    this.vx = (inp.move || 0) * this.moveSpeed();
    if (inp.move) { this.walk += dt * 13; }
    if (inp.jump && this.onGround) { this.vy = -780; this.onGround = false; this.W.fxDust(this.x, this.y); }
    if (inp.ult) { if (this.tryUlt(inp)) return; }
    for (let i = 0; i < 3; i++) if (((inp.skill && inp.skill[i]) || (this.buf && this.buf.i === i)) && this.cds[i] <= 0) { this.buf = null; this.useSkill(i); return; }
    if (inp.attack && this.atkCd <= 0) this.basicAttack();
  }

  physics(dt) {
    if (!this.onGround || this.vy < 0) this.vy += STAGE.GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y >= STAGE.GROUND) {
      if (!this.onGround && this.vy > 500) this.W.fxDust(this.x, STAGE.GROUND);
      this.y = STAGE.GROUND; this.vy = 0; this.onGround = true;
    } else this.onGround = false;
    this.x += (this.vx + this.kbx) * dt;
    this.kbx *= Math.pow(0.004, dt); if (Math.abs(this.kbx) < 8) this.kbx = 0;
    this.x = clamp(this.x, STAGE.LEFT + this.w / 2, STAGE.RIGHT - this.w / 2);
  }

  noteAttack() {
    this.idleT = 0;
  }

  tryUlt(inp) {
    if (this.energy < 100 || this.dead || this.held || this.W.cutin) return false;
    this.energy = 0; this.stun = 0; this.stats.ults++;
    if (this.action && this.action.onEnd) this.action.onEnd(this, this.W, this.action);
    this.action = null; this.vx = 0; this.invulnT = 1.2;
    this.W.startCutin(this, inp && inp.ultSource, () => { this.action = ULTS[this.ch.cls](this, this.W); this.action.isUlt = true; });
    return true;
  }

  useSkill(i) {
    const sk = this.cls.skills[i];
    this.cds[i] = sk.cd; this.noteAttack(); this.stats.skills++;
    this.vx = 0;
    this.action = SKILLS[sk.id](this, this.W);
  }

  basicAttack() {
    const pat = this.cls.pattern, idx = this.comboIdx % pat.length;
    this.noteAttack();
    this.action = BASIC[this.ch.cls](this, this.W, idx, pat[idx], idx === pat.length - 1);
    this.atkCd = this.action.dur * 0.92;
    this.comboIdx = idx + 1; this.comboT = this.action.dur + 0.55;
    if (this.comboIdx >= pat.length) this.comboIdx = 0;
    this.vx = 0;
  }

  // called by World when this fighter is hit (after damage applied)
  onHurt(src, opts) {
    this.flash = 1;
    if (opts.stun && !this.superArmor()) {
      this.stun = Math.max(this.stun, opts.stun);
      if (this.action) { if (this.action.onEnd) this.action.onEnd(this, this.W, this.action); this.action = null; }
    }
  }

  die() { this.dead = true; this.action = null; this.vy = -500; this.kbx = this.facing * -300; }

  // ---------- render ----------
  draw(ctx) {
    const a = this.anim;
    const pose = {
      t: this.t, walk: this.walk, moving: Math.abs(this.vx) > 5 && this.onGround && !this.action, air: !this.onGround,
      arm: a.arm, arm2: a.arm2, wRot: a.wRot, lean: a.lean + (this.dead ? -Math.min(1.4, this.deadT * 4) : 0), squash: a.squash,
      eyes: a.eyes, mouth: a.mouth, draw: a.draw, aura: a.aura, weaponHidden: this.spearOut,
    };
    if (this.status.swift > 0 && !pose.aura) pose.aura = '#7fffd466';
    ctx.save(); ctx.translate(this.x, this.y);
    if (a.alpha != null) ctx.globalAlpha = a.alpha;
    Art.flashDraw(ctx, this.flash, 260, 240, 130, 200, o => { o.scale(this.facing, 1); Art.chibi(o, this.ch, pose); });
    ctx.restore();
    // statuses
    if (this.stun > 0.25 && !this.dead) Art.anger(ctx, this.x + 26, this.y - 150 + Math.sin(this.t * 10) * 3, 1.2);
    if (this.parrying) { ctx.save(); ctx.globalAlpha = 0.6; Art.ell(ctx, this.x + this.facing * 30, this.y - 60, 30, 60); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
    if (this.spinBlock) {
      ctx.save(); ctx.translate(this.x, this.y - 60); ctx.rotate(this.t * 20); ctx.globalAlpha = 0.5;
      ctx.strokeStyle = this.ch.fx; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 80, 0, 4.5); ctx.stroke(); ctx.restore();
    }
    if (this.focusReady && !this.dead) { ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(this.t * 8) * 0.3; Art.star(ctx, this.x, this.y - 165, 9, 4, 4, this.t * 3); ctx.fillStyle = '#4cc9f0'; ctx.fill(); ctx.restore(); }
  }
}

// ---------- helpers for actions ----------
function arrowProj(f, W, mult, o = {}) {
  return W.addProj(f, Object.assign({
    kind: 'arrow', x: f.x + f.facing * 34, y: f.y - 58, vx: f.facing * 1050, vy: 0, r: 10, mult, life: 1.2,
    tag: 'basic', stun: 0.18, kb: [90, 0], color: f.ch.fx,
  }, o));
}
function swingPose(f, a, from, to, start = 0.1, end = 0.5) {
  const p = clamp((a.t / a.dur - start) / (end - start), 0, 1);
  f.anim.arm = lerp(from, to, easeOut(p)); f.anim.wRot = 0;
  f.anim.eyes = 'angry'; f.anim.mouth = 'grit';
}

// ---------- basic attacks ----------
const BASIC = {
  melee(f, W, idx, mult, fin) {
    const dur = (fin ? 0.42 : 0.28) / f.atkSpeed();
    const up = idx % 2 === 1;
    return Act({ name: 'basic', dur, ev: [[dur * 0.35, () => {
      W.addHitbox(f, { dx: 58, dy: 56, w: fin ? 125 : 100, h: 74, life: 0.07, mult, tag: 'basic', kb: fin ? [480, 280] : [140, 0], stun: fin ? 0.5 : 0.22 });
      W.fxSlash(f.x + f.facing * 52, f.y - 60, fin ? 70 : 56, f.facing, f.ch.fx, up);
    }]], tick(f, dt, a) {
      if (fin) { f.anim.arm = 0; f.anim.wRot = 0; f.anim.lean = 0.2; f.vx = a.t < dur * 0.4 ? f.facing * 320 : 0; f.anim.eyes = 'angry'; f.anim.mouth = 'open'; }
      else up ? swingPose(f, a, 1.2, -1.9) : swingPose(f, a, -2.0, 1.1);
    } });
  },
  heavy(f, W, idx, mult, fin) {
    const dur = (fin ? 0.7 : 0.44) / f.atkSpeed();
    return Act({ name: 'basic', dur, superArmor: fin, ev: [[dur * 0.45, () => {
      W.addHitbox(f, { dx: 70, dy: 56, w: fin ? 160 : 130, h: 96, life: 0.08, mult, tag: 'basic', kb: fin ? [360, 520] : [200, 0], stun: fin ? 0.6 : 0.28 });
      W.fxSlash(f.x + f.facing * 64, f.y - 60, fin ? 90 : 72, f.facing, f.ch.fx, false);
      if (fin) { W.shake(8, 0.2); W.fxDust(f.x + f.facing * 80, f.y); }
    }]], tick(f, dt, a) { swingPose(f, a, -2.6, 1.3, 0.15, 0.48); if (fin) f.anim.squash = a.t < dur * 0.4 ? 0.92 : 1.05; } });
  },
  ranged(f, W, idx, mult, fin) {
    const dur = 0.3 / f.atkSpeed();
    return Act({ name: 'basic', dur, ev: [[dur * 0.45, () => {
      if (fin && f.unique === 'ricochet') {
        [-160, 0, 160].forEach(vy => arrowProj(f, W, mult * 0.6, { kind: 'pellet', vy, r: 9 }));
      } else if (fin) arrowProj(f, W, mult, { kind: 'bigArrow', pierce: true, r: 14, kb: [260, 80], stun: 0.35, vx: f.facing * 1250 });
      else arrowProj(f, W, mult, f.ch.weapon === 'slingshot' ? { kind: 'pellet' } : {});
    }]], tick(f, dt, a) { f.anim.arm = 0; f.anim.wRot = 0; f.anim.draw = a.t < a.dur * 0.45; f.anim.eyes = 'angry'; } });
  },
  magic(f, W, idx, mult, fin) {
    const dur = 0.32 / f.atkSpeed();
    return Act({ name: 'basic', dur, ev: [[dur * 0.45, () => {
      W.addProj(f, { kind: fin ? 'orb' : 'bolt', x: f.x + f.facing * 40, y: f.y - 70, vx: f.facing * 700, vy: 0, r: fin ? 18 : 11,
        mult, life: 1.4, homing: 1.4, speed: 700, tag: 'basic', stun: fin ? 0.35 : 0.18, kb: fin ? [220, 120] : [70, 0], color: f.ch.fx });
    }]], tick(f, dt, a) { swingPose(f, a, -0.8, -0.2, 0, 0.45); f.anim.wRot = -0.6; f.anim.mouth = 'open'; } });
  },
  polearm(f, W, idx, mult, fin) {
    const dur = (fin ? 0.48 : 0.3) / f.atkSpeed();
    return Act({ name: 'basic', dur, ev: [[dur * 0.4, () => {
      if (fin) {
        W.addHitbox(f, { dx: 70, dy: 56, w: 200, h: 100, life: 0.08, mult, tag: 'basic', kb: [420, 300], stun: 0.5 });
        W.fxSlash(f.x + f.facing * 70, f.y - 60, 100, f.facing, f.ch.fx, false);
      } else {
        W.addHitbox(f, { dx: 100, dy: 58, w: 150, h: 44, life: 0.07, mult, tag: 'basic', kb: [150, 0], stun: 0.22 });
        W.fxThrust(f.x + f.facing * 60, f.y - 58, f.facing, f.ch.fx, 120);
      }
    }]], tick(f, dt, a) {
      if (fin) swingPose(f, a, -2.2, 1.0);
      else { f.anim.arm = 0.1; f.anim.wRot = -0.1; f.anim.lean = 0.12; f.vx = a.t < a.dur * 0.4 ? f.facing * 160 : 0; }
    } });
  },
};

// ---------- skills ----------
const SKILLS = {
  // ===== Blade =====
  dashThrust(f, W) {
    return Act({ name: 'dash', dur: 0.42, ev: [[0, (f, W, a) => {
      a.sx = f.x;
      W.addHitbox(f, { dx: 44, dy: 56, w: 110, h: 76, life: 0.27, mult: 2.2, tag: 'skill', kb: [400, 200], stun: 0.5 });
    }]], tick(f, dt, a) {
      f.vx = a.t < 0.27 ? f.facing * 980 : 0; f.anim.arm = 0; f.anim.wRot = 0; f.anim.lean = 0.25; f.anim.eyes = 'angry'; f.anim.mouth = 'grit';
      if (a.t < 0.27) W.fxAfterimage(f);
    }, onEnd(f, W, a) {
      if (f.unique === 'afterimage' && a.sx != null) {
        const sx = a.sx, ex = f.x, y = f.y;
        W.later(0.18, () => {
          W.addHitbox(f, { fixed: true, x: (sx + ex) / 2, y: y - 56, w: Math.abs(ex - sx) + 90, h: 80, life: 0.08, mult: 1.3, tag: 'skill', kb: [220, 160], stun: 0.4 });
          W.fxLine(sx, y - 56, ex, y - 56, '#ff2e2e', 14);
        });
      }
    } });
  },
  parry(f, W) {
    return Act({ name: 'parry', dur: 0.6, tick(f, dt, a) {
      f.parrying = a.t < 0.45; f.anim.arm = -0.6; f.anim.wRot = -1.1; f.anim.eyes = 'angry'; f.anim.mouth = 'flat';
    } });
  },
  barrage(f, W) {
    const ev = [];
    for (let i = 0; i < 7; i++) ev.push([0.1 + i * 0.1, () => {
      W.addHitbox(f, { dx: 64, dy: 56 + rand(-12, 12), w: 110, h: 64, life: 0.06, mult: 0.55, tag: 'skill', kb: [i === 6 ? 380 : 50, i === 6 ? 200 : 0], stun: i === 6 ? 0.45 : 0.28 });
      W.fxThrust(f.x + f.facing * 50, f.y - 56 + rand(-16, 16), f.facing, f.ch.fx, 90);
    }]);
    return Act({ name: 'barrage', dur: 0.95, ev, tick(f, dt, a) {
      f.anim.arm = Math.sin(a.t * 60) * 0.25; f.anim.wRot = 0; f.anim.lean = 0.15; f.vx = f.facing * 40; f.anim.eyes = 'angry'; f.anim.mouth = 'open';
    } });
  },

  // ===== Heavy =====
  smash(f, W) {
    const waves = (mult) => {
      [-1, 1].forEach(d => W.addProj(f, { kind: 'wave', x: f.x + d * 50, y: STAGE.GROUND - 22, vx: d * 640, vy: 0, r: 26, mult, life: 0.9,
        tag: 'skill', kb: [150, 520], stun: 0.5, ground: true, color: f.ch.fx }));
    };
    const ev = [[0.02, f => { f.vy = -440; }], [0.42, (f, W) => {
      W.addHitbox(f, { dx: 60, dy: 34, w: 160, h: 76, life: 0.08, mult: 1.5, tag: 'skill', kb: [200, 460], stun: 0.5 });
      waves(2.2); W.shake(12, 0.3); W.fxDust(f.x + f.facing * 70, f.y); W.fxRing(f.x + f.facing * 70, f.y, 110, f.ch.fx);
    }]];
    if (f.unique === 'aftershock') ev.push([0.75, () => { waves(1.2); W.shake(6, 0.2); }]);
    return Act({ name: 'smash', dur: f.unique === 'aftershock' ? 0.95 : 0.8, superArmor: true, ev,
      tick(f, dt, a) { swingPose(f, a, -2.7, 1.3, 0.2, 0.52); } });
  },
  grab(f, W) {
    return Act({ name: 'grab', dur: 0.45, ev: [[0.12, (f, W, a) => {
      W.addHitbox(f, { dx: 48, dy: 56, w: 86, h: 90, life: 0.15, mult: 0, grab: true, parryable: false, tag: 'skill', onHit: tgt => SKILLS._slam(f, W, tgt) });
    }]], tick(f, dt, a) { f.anim.arm = -0.1; f.anim.arm2 = -0.2; f.anim.wRot = -2.4; f.vx = a.t < 0.2 ? f.facing * 260 : 0; f.anim.eyes = 'angry'; f.anim.mouth = 'grit'; } });
  },
  _slam(f, W, tgt) {
    if (!(tgt instanceof Fighter)) { W.damage(f, tgt, 2.2, { tag: 'skill', parryable: false, stun: 0.4 }); W.shake(10, 0.25); return; }
    tgt.held = f; tgt.stun = 1.2; tgt.vy = 0; tgt.kbx = 0;
    if (tgt.action && tgt.action.onEnd) tgt.action.onEnd(tgt, W, tgt.action);
    tgt.action = null;
    const release = () => { if (tgt.held === f) tgt.held = null; };
    f.action = Act({ name: 'slam', dur: 0.8, invuln: true, ev: [[0.47, (f, W) => {
      release(); tgt.y = STAGE.GROUND; tgt.x = clamp(f.x + f.facing * 72, STAGE.LEFT + 30, STAGE.RIGHT - 30);
      W.damage(f, tgt, 3.0, { tag: 'skill', parryable: false, kb: [300, 380], stun: 0.7 });
      W.shake(16, 0.35); W.fxDust(tgt.x, STAGE.GROUND); W.fxRing(tgt.x, STAGE.GROUND, 130, f.ch.fx);
      if (f.unique === 'quake') [-1, 1].forEach(d => W.addProj(f, { kind: 'wave', x: tgt.x + d * 40, y: STAGE.GROUND - 22, vx: d * 700, r: 26, mult: 1.4, life: 0.8, tag: 'skill', kb: [150, 480], stun: 0.4, ground: true, color: f.ch.fx }));
    }]], tick(f, dt, a) {
      if (a.t < 0.35) {
        const th = a.t / 0.35 * Math.PI * 0.55;
        tgt.x = f.x + f.facing * Math.cos(th) * 58; tgt.y = f.y - 20 - Math.sin(th) * 120;
        f.anim.arm = -0.3 - th * 2; f.anim.arm2 = -0.3 - th * 2;
      } else if (a.t < 0.47) {
        const p = (a.t - 0.35) / 0.12;
        tgt.x = f.x + f.facing * lerp(10, 72, p); tgt.y = lerp(f.y - 140, STAGE.GROUND, p * p);
        f.anim.arm = lerp(-3.4, 0.8, p); f.anim.arm2 = f.anim.arm;
      }
      f.anim.wRot = -2.4; f.anim.eyes = 'angry'; f.anim.mouth = 'open';
    }, onEnd: release });
  },
  spin(f, W) {
    return Act({ name: 'spin', dur: 1.6, superArmor: true, ev: [[0.05, () => {
      W.addHitbox(f, { dx: 0, dy: 56, w: 180, h: 100, life: 1.5, mult: 0.55, rehit: 0.2, tag: 'skill', kb: [130, 40], stun: 0.25 });
    }]], tick(f, dt, a) {
      f.vx = (f.input.move || 0) * f.moveSpeed() * 0.7;
      f.anim.arm = a.t * 26; f.anim.wRot = 0; f.anim.eyes = 'closed'; f.anim.mouth = 'open';
      if (Math.random() < 0.5) W.fxSpark(f.x + rand(-80, 80), f.y - rand(20, 100), f.ch.fx);
    } });
  },

  // ===== Ranged =====
  backshot(f, W) {
    return Act({ name: 'backshot', dur: 0.5, ev: [[0, f => { f.vy = -330; }], [0.22, (f, W) => {
      arrowProj(f, W, 2.2, { kind: 'bigArrow', r: 14, tag: 'skill', stun: 0.4, kb: [300, 80], vx: f.facing * 1200, pierce: true });
      W.fxRing(f.x + f.facing * 40, f.y - 58, 40, f.ch.fx);
    }]], tick(f, dt, a) { f.vx = a.t < 0.22 ? -f.facing * 820 : 0; f.anim.arm = 0; f.anim.wRot = 0; f.anim.draw = a.t < 0.22; f.anim.eyes = 'angry'; } });
  },
  strangle(f, W) {
    return Act({ name: 'strangle', dur: 0.78, ev: [
      [0.1, (f, W, a) => W.addHitbox(f, { dx: 44, dy: 56, w: 84, h: 90, life: 0.12, mult: 0.4, tag: 'skill', stun: 0.7, kb: [0, 0], onHit: tgt => { a.caught = tgt; } })],
      [0.52, (f, W, a) => {
        if (a.caught && !a.caught.dead) {
          W.damage(f, a.caught, 1.6, { tag: 'skill', kb: [1000, 300], stun: 0.5, parryable: false });
          W.fxRing(a.caught.x, a.caught.y - 60, 70, f.ch.fx); W.shake(8, 0.2);
        }
      }]], tick(f, dt, a) {
      f.anim.arm = -1.2; f.anim.wRot = 1.4; f.anim.arm2 = -1.0; f.anim.eyes = 'angry'; f.anim.mouth = 'grit';
      if (a.caught && a.t < 0.52 && a.caught instanceof Fighter && !a.caught.dead) { a.caught.x = f.x + f.facing * 46; a.caught.stun = Math.max(a.caught.stun, 0.2); }
    } });
  },
  volley(f, W) {
    const n = f.unique === 'moonvolley' ? 11 : 8, ev = [];
    for (let i = 0; i < n; i++) ev.push([0.1 + i * 0.085, () => arrowProj(f, W, 0.5, { tag: 'skill', vy: rand(-70, 70), homing: i >= 8 ? 2.2 : 0, speed: 1000, color: i >= 8 ? '#e0d4ff' : f.ch.fx })]);
    return Act({ name: 'volley', dur: 0.2 + n * 0.085, ev, tick(f, dt, a) { f.anim.arm = Math.sin(a.t * 50) * 0.08; f.anim.wRot = 0; f.anim.draw = Math.sin(a.t * 70) > 0; f.anim.eyes = 'angry'; f.anim.mouth = 'open'; } });
  },

  // ===== Magic =====
  fireball(f, W) {
    return Act({ name: 'fireball', dur: 0.45, ev: [[0.2, (f, W) => {
      W.addProj(f, { kind: 'fire', x: f.x + f.facing * 40, y: f.y - 72, vx: f.facing * 520, vy: -40, r: 20, mult: 2.2, life: 3, homing: 3.0, speed: 520,
        tag: 'skill', kb: [240, 180], stun: 0.45, color: '#ff7b00',
        onHit: (tgt, p) => {
          W.fxBurst(p.x, p.y, '#ff7b00', 14); W.fxRing(p.x, p.y, 60, '#ffb703');
          if (f.unique === 'embers') {
            tgt.status.bleed = 3; tgt._bleedSrc = f;
            for (let i = 0; i < 3; i++) W.addProj(f, { kind: 'ember', x: p.x, y: p.y, vx: rand(-260, 260), vy: rand(-520, -300), r: 9, mult: 0.4, life: 1.3, gravity: true, tag: 'skill', stun: 0.12, kb: [60, 0], color: '#ffb703', delay: 0.18 });
          }
        } });
    }]], tick(f, dt, a) { swingPose(f, a, -1.2, -0.1, 0, 0.45); f.anim.wRot = -0.6; f.anim.mouth = 'open'; } });
  },
  summon(f, W) {
    return Act({ name: 'summon', dur: 0.5, ev: [[0.25, (f, W) => {
      for (let i = 0; i < 3; i++) W.addObj(new Minion(W, f, f.x + f.facing * (20 + i * 26), i));
      W.fxRing(f.x + f.facing * 40, f.y - 20, 70, f.ch.fx);
    }]], tick(f, dt, a) { f.anim.arm = -1.6; f.anim.wRot = -0.2; f.anim.eyes = 'happy'; f.anim.mouth = 'open'; } });
  },
  cloud(f, W) {
    return Act({ name: 'cloud', dur: 0.45, ev: [[0.2, (f, W) => {
      const tgt = W.opponentOf(f); if (tgt) W.addObj(new ThunderCloud(W, f, tgt, f.unique === 'storm' ? 7 : 5));
    }]], tick(f, dt, a) { f.anim.arm = -2.0; f.anim.wRot = 0; f.anim.mouth = 'open'; } });
  },

  // ===== Polearm =====
  leap(f, W) {
    return Act({ name: 'leap', dur: 1.3, ev: [[0, (f, W, a) => { f.vy = -880; f.onGround = false; }]], tick(f, dt, a) {
      if (!a.landed) {
        f.vx = f.facing * 440;
        f.anim.arm = f.vy < 0 ? -2.6 : lerp(-2.6, 1.2, clamp(f.vy / 700, 0, 1)); f.anim.wRot = 0; f.anim.eyes = 'angry'; f.anim.mouth = 'grit';
        if (a.t > 0.15 && f.onGround) {
          a.landed = true; f.vx = 0; a.dur = a.t + 0.28;
          W.addHitbox(f, { dx: 60, dy: 34, w: 200, h: 90, life: 0.08, mult: 2.4, tag: 'skill', kb: [260, 440], stun: 0.55 });
          W.shake(12, 0.25); W.fxDust(f.x + f.facing * 70, f.y); W.fxRing(f.x + f.facing * 70, f.y, 120, f.ch.fx);
          if (f.unique === 'crater') W.addObj(new Crater(W, f, f.x + f.facing * 70));
        }
      } else { f.vx = 0; f.anim.arm = 1.2; f.anim.wRot = 0; f.anim.squash = 0.9; }
    } });
  },
  spinBlock(f, W) {
    return Act({ name: 'spinBlock', dur: 1.4, ev: [[0.05, () => {
      W.addHitbox(f, { dx: 0, dy: 60, w: 160, h: 120, life: 1.3, mult: 0.35, rehit: 0.25, tag: 'skill', kb: [80, 0], stun: 0.15 });
    }]], tick(f, dt, a) { f.spinBlock = true; f.anim.arm = -0.4; f.anim.wRot = a.t * 24; f.anim.eyes = 'angry'; f.anim.mouth = 'flat'; } });
  },
  throw(f, W) {
    return Act({ name: 'throw', dur: 0.38, ev: [[0.15, (f, W) => {
      f.spearOut = true;
      W.addProj(f, { kind: 'spear', x: f.x + f.facing * 30, y: f.y - 60, vx: f.facing * 1150, vy: 0, r: 18, mult: 1.5, life: 3, pierce: true,
        boomerang: { dist: 540, sx: f.x }, tag: 'skill', kb: [260, 100], stun: 0.35, color: f.ch.fx,
        onReturnHit: f.unique === 'tether' ? (tgt) => { if (tgt instanceof Fighter) { tgt.kbx = Math.sign(f.x - tgt.x) * 900; tgt.stun = Math.max(tgt.stun, 0.45); } } : null });
    }]], tick(f, dt, a) { swingPose(f, a, -2.2, 0, 0, 0.4); } });
  },
};

// ---------- ultimates ----------
const ULTS = {
  melee(f, W) {
    const ev = [];
    for (let i = 0; i < 8; i++) ev.push([0.08 + i * 0.13, (f, W) => {
      const t = W.opponentOf(f); if (!t) return;
      const side = i % 2 ? -1 : 1, off = t.w / 2 + 50;
      f.x = clamp(t.x + side * off, STAGE.LEFT + 30, STAGE.RIGHT - 30); f.y = STAGE.GROUND; f.facing = Math.sign(t.x - f.x) || 1;
      W.damage(f, t, 0.8, { tag: 'ult', stun: 0.6, kb: [20, 0], parryable: false, noEnergy: true });
      W.fxSlash(t.x, t.y - 60, 90, f.facing, f.ch.fx, i % 2 === 0, rand(-0.8, 0.8));
      W.fxPetals(t.x, t.y - 60, f.ch.fx);
    }]);
    ev.push([1.3, (f, W) => {
      const t = W.opponentOf(f); if (!t) return;
      W.damage(f, t, 2.5, { tag: 'ult', stun: 0.8, kb: [650, 420], parryable: false, noEnergy: true });
      W.fxLine(t.x - 200, t.y - 140, t.x + 200, t.y + 20, f.ch.fx, 18); W.shake(18, 0.4); W.hitstop(0.15);
    }]);
    return Act({ name: 'ult', dur: 1.6, invuln: true, ev, tick(f, dt, a) {
      f.anim.alpha = a.t < 1.25 ? 0.4 + Math.random() * 0.5 : 1; f.anim.arm = Math.sin(a.t * 40); f.anim.wRot = 0; f.anim.eyes = 'angry'; f.anim.mouth = 'grit'; f.anim.aura = f.ch.fx + '88';
    } });
  },
  heavy(f, W) {
    return Act({ name: 'ult', dur: 1.8, invuln: true, ev: [[0.05, f => { f.vy = -1150; f.onGround = false; }]], tick(f, dt, a) {
      f.anim.aura = f.ch.fx + '88'; f.anim.eyes = 'angry'; f.anim.mouth = 'open';
      if (!a.landed) {
        f.anim.arm = f.vy < 0 ? -2.8 : 1.3; f.anim.wRot = 0;
        if (a.t > 0.2 && f.onGround) {
          a.landed = true; a.dur = a.t + 0.5;
          W.shake(26, 0.6); W.hitstop(0.12); W.addObj(new Fissure(W, f.x, f.ch.fx));
          for (const e of W.enemiesOf(f)) W.damage(f, e, e.onGround === false ? 2.5 : 5.0, { tag: 'ult', stun: 1.0, kb: [250, 520], parryable: false, noEnergy: true });
        }
      } else { f.anim.arm = 1.3; f.anim.squash = 0.88; }
    } });
  },
  ranged(f, W) {
    const ev = [];
    for (let i = 0; i < 12; i++) ev.push([0.25 + i * 0.09, (f, W) => {
      const t = W.opponentOf(f); if (!t) return;
      W.addProj(f, { kind: 'star', x: t.x + rand(-100, 100), y: -40, vx: rand(-60, 60), vy: 1400, r: 16, mult: 0.65, life: 1.5, tag: 'ult', stun: 0.3, kb: [40, 0], parryable: false, noEnergy: true, color: f.ch.fx, fall: true });
    }]);
    return Act({ name: 'ult', dur: 1.6, invuln: true, ev: [[0.1, (f, W) => W.fxRing(f.x, f.y - 120, 90, f.ch.fx)], ...ev],
      tick(f, dt, a) { f.anim.arm = -1.3; f.anim.wRot = 0; f.anim.draw = a.t < 0.25; f.anim.aura = f.ch.fx + '88'; f.anim.eyes = 'angry'; } });
  },
  magic(f, W) {
    return Act({ name: 'ult', dur: 1.2, invuln: true, ev: [[0.2, (f, W) => { const t = W.opponentOf(f); W.addObj(new Meteor(W, f, t ? t.x : f.x + f.facing * 300)); }]],
      tick(f, dt, a) { f.anim.arm = -2.2; f.anim.wRot = 0; f.anim.aura = f.ch.fx + '88'; f.anim.mouth = 'tongue'; f.anim.eyes = 'happy'; } });
  },
  polearm(f, W) {
    return Act({ name: 'ult', dur: 1.35, invuln: true, ev: [[0.3, (f, W) => {
      W.addHitbox(f, { dx: 50, dy: 60, w: 180, h: 130, life: 0.75, mult: 6.0, tag: 'ult', kb: [800, 380], stun: 0.9, parryable: false, noEnergy: true });
    }]], tick(f, dt, a) {
      f.anim.aura = f.ch.fx + '88'; f.anim.arm = 0; f.anim.wRot = 0; f.anim.lean = 0.3; f.anim.eyes = 'angry'; f.anim.mouth = 'grit';
      f.vx = a.t > 0.3 && a.t < 1.05 ? f.facing * 1500 : 0;
      if (a.t > 0.3 && a.t < 1.05) W.fxDragon(f);
    } });
  },
};

// ---------- summoned / spawned objects ----------
class Minion {
  constructor(W, owner, x, i) { this.W = W; this.owner = owner; this.x = x; this.y = STAGE.GROUND; this.vy = -300 - i * 80; this.life = 7; this.i = i; this.t = 0; this.facing = owner.facing; }
  update(dt) {
    const W = this.W; this.t += dt; this.life -= dt;
    const tgt = W.opponentOf(this.owner);
    this.vy += STAGE.GRAVITY * 0.8 * dt; this.y += this.vy * dt;
    if (this.y >= STAGE.GROUND) { this.y = STAGE.GROUND; this.vy = -220 - Math.random() * 120; }
    if (tgt) {
      this.facing = Math.sign(tgt.x - this.x) || 1;
      this.x += this.facing * (240 + this.i * 25) * dt;
      if (Math.abs(tgt.x - this.x) < tgt.w / 2 + 14 && Math.abs((tgt.y - tgt.h / 2) - (this.y - 15)) < tgt.h / 2 + 20 && !tgt.invuln) {
        W.damage(this.owner, tgt, 0.7, { tag: 'skill', stun: 0.3, kb: [200, 240], projectile: true, fromX: this.x });
        W.fxBurst(this.x, this.y - 15, this.owner.ch.fx, 10); return false;
      }
    }
    if (this.life <= 0) { W.fxBurst(this.x, this.y - 15, '#ffffff', 6); return false; }
    return true;
  }
  draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.facing, 1); Art.sprite(ctx, this.owner.ch.fx, this.t + this.i); ctx.restore(); }
}

class ThunderCloud {
  constructor(W, owner, tgt, strikes) { this.W = W; this.owner = owner; this.tgt = tgt; this.x = tgt.x; this.y = 150; this.strikes = strikes; this.timer = 0.9; this.warn = 0; this.t = 0; this.bolt = 0; }
  update(dt) {
    const W = this.W; this.t += dt;
    if (!this.tgt.dead) this.x += clamp(this.tgt.x - this.x, -280 * dt, 280 * dt);
    this.timer -= dt; this.bolt = Math.max(0, this.bolt - dt);
    if (this.timer <= 0.3 && this.timer + dt > 0.3) this.warn = 0.3;
    this.warn = Math.max(0, this.warn - dt);
    if (this.timer <= 0) {
      this.timer = 1.0; this.strikes--; this.bolt = 0.18; this.boltX = this.x;
      if (Math.abs(this.tgt.x - this.x) < 60 + this.tgt.w / 2 * 0.5 && !this.tgt.dead) W.damage(this.owner, this.tgt, 0.8, { tag: 'skill', stun: 0.2, kb: [0, 0], parryable: false, projectile: true });
      W.fxSpark(this.x, STAGE.GROUND - 10, '#fff36b'); W.shake(4, 0.1);
      if (this.strikes <= 0) return this.bolt > 0 || false;
    }
    return this.strikes > 0 || this.bolt > 0;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    const c = this.warn > 0 ? '#fff6a0' : '#5c6b8a';
    [[-34, 6, 26], [0, -6, 34], [34, 6, 26], [0, 14, 30]].forEach(([x, y, r]) => { Art.ell(ctx, x, y, r, r * 0.8); Art.ink(ctx, c, 4); });
    ctx.restore();
    if (this.bolt > 0) {
      ctx.save(); ctx.strokeStyle = '#fff36b'; ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 20; ctx.lineWidth = 7;
      ctx.beginPath(); let x = this.boltX, y = this.y + 20; ctx.moveTo(x, y);
      while (y < STAGE.GROUND) { y += 50; x += rand(-25, 25); ctx.lineTo(x, Math.min(y, STAGE.GROUND)); }
      ctx.stroke(); ctx.restore();
    }
  }
}

class Crater {
  constructor(W, owner, x) { this.W = W; this.owner = owner; this.x = x; this.life = 3; this.tick = 0; }
  update(dt) {
    this.life -= dt; this.tick -= dt;
    for (const e of this.W.enemiesOf(this.owner)) if (Math.abs(e.x - this.x) < 110 && e.y >= STAGE.GROUND - 5) {
      if (e.status) e.status.slow = Math.max(e.status.slow, 0.4);
      if (this.tick <= 0) { this.W.damage(this.owner, e, 0.3, { tag: 'skill', noEnergy: true, parryable: false }); }
    }
    if (this.tick <= 0) this.tick = 0.5;
    return this.life > 0;
  }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = Math.min(1, this.life);
    Art.ell(ctx, this.x, STAGE.GROUND + 4, 110, 16); ctx.fillStyle = '#3d2b1f'; ctx.fill();
    ctx.strokeStyle = '#ffbe0b'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
}

class Meteor {
  constructor(W, owner, x) { this.W = W; this.owner = owner; this.tx = x; this.t = 0; this.fall = 0.85; this.boom = 0; }
  update(dt) {
    this.t += dt;
    if (this.t >= this.fall && !this.hit) {
      this.hit = true; this.W.shake(28, 0.6); this.W.hitstop(0.1);
      this.W.fxBurst(this.tx, STAGE.GROUND - 40, '#ff7b00', 40); this.W.fxRing(this.tx, STAGE.GROUND - 30, 200, '#ffb703');
      for (const e of this.W.enemiesOf(this.owner)) if (Math.abs(e.x - this.tx) < 170 + e.w / 2)
        this.W.damage(this.owner, e, 6.0, { tag: 'ult', stun: 1.0, kb: [500, 600], parryable: false, noEnergy: true, fromX: this.tx });
    }
    return this.t < this.fall + 0.6;
  }
  draw(ctx) {
    const p = clamp(this.t / this.fall, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(this.t * 30) * 0.2;
    Art.ell(ctx, this.tx, STAGE.GROUND + 2, 170 * (0.4 + p * 0.6), 20); ctx.strokeStyle = '#ff3d3d'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    if (p < 1) {
      const x = lerp(this.tx - 500, this.tx, p), y = lerp(-200, STAGE.GROUND - 60, p * p);
      ctx.save(); ctx.shadowColor = '#ff7b00'; ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.moveTo(x - 160, y - 140); ctx.lineTo(x - 20, y - 60); ctx.lineTo(x + 20, y + 40); ctx.closePath(); ctx.fillStyle = '#ffb70388'; ctx.fill();
      Art.ell(ctx, x, y, 70, 64); Art.ink(ctx, '#ff5400', 6); Art.ell(ctx, x - 14, y - 14, 30, 26); ctx.fillStyle = '#ffd166'; ctx.fill();
      ctx.restore();
    }
  }
}

class Fissure {
  constructor(W, x, color) { this.x = x; this.color = color; this.t = 0; }
  update(dt) { this.t += dt; return this.t < 1.2; }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = 1 - this.t / 1.2; ctx.shadowColor = this.color; ctx.shadowBlur = 20; ctx.strokeStyle = this.color; ctx.lineWidth = 6;
    const rng = mulberry32(Math.floor(this.x));
    for (const d of [-1, 1]) { ctx.beginPath(); let x = this.x, y = STAGE.GROUND; ctx.moveTo(x, y); while (Math.abs(x - this.x) < 700) { x += d * (40 + rng() * 40); y = STAGE.GROUND + rng() * 30 - 10; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
  }
}

// ============================================================
//  AI controller
// ============================================================
const AI_RANGE = { melee: 85, heavy: 105, ranged: 430, magic: 380, polearm: 140 };

class AIController {
  constructor(skill = 0.5) { this.skill = clamp(skill, 0.1, 1); this.think = 0; this.out = { move: 0, attack: false, jump: false, skill: [false, false, false], ult: false }; this.jitter = 0; }
  get(f, W) {
    const o = this.out;
    o.jump = false; o.skill = [false, false, false]; o.ult = false;
    this.think -= W.dt;
    if (this.think > 0) return o;
    this.think = lerp(0.32, 0.08, this.skill) + Math.random() * 0.08;
    const t = W.opponentOf(f); if (!t) { o.move = 0; o.attack = false; return o; }
    const dx = t.x - f.x, dist = Math.abs(dx) - (t.w - 56) / 2, dir = Math.sign(dx) || 1;
    const cls = f.ch.cls, want = AI_RANGE[cls] + this.jitter;
    if (Math.random() < 0.1) this.jitter = rand(-30, 30);

    // dodge incoming projectiles / ground waves
    const threat = W.projectiles.find(p => p.owner.team !== f.team && Math.abs(p.x - f.x) < 220 && Math.sign(p.vx) === Math.sign(f.x - p.x));
    if (threat && f.onGround && Math.random() < this.skill * 0.7) {
      if (cls === 'polearm' && f.cds[1] <= 0 && Math.random() < 0.6) { o.skill[1] = true; return o; }
      o.jump = true;
    }
    if (t.action && t.action.isUlt === undefined && cls === 'melee' && dist < 140 && t.action.name !== 'parry' && f.cds[1] <= 0 && Math.random() < this.skill * 0.35) { o.skill[1] = true; return o; }
    if (f.energy >= 100 && dist < 500 && Math.random() < 0.5 + this.skill * 0.3) { o.ult = true; return o; }

    // skill choices
    const r = Math.random(), use = i => f.cds[i] <= 0 && r < 0.25 + this.skill * 0.35;
    const S = {
      melee:   [dist > 150 && dist < 380, false, dist < 100],
      heavy:   [dist < 230, dist < 80, dist < 150],
      ranged:  [dist < 170, dist < 75, dist > 180],
      magic:   [true, dist > 120, true],
      polearm: [dist > 160 && dist < 340, false, dist > 200],
    }[cls];
    for (let i = 0; i < 3; i++) if (S[i] && use(i)) { o.skill[i] = true; return o; }

    // spacing
    const kite = (cls === 'ranged' || cls === 'magic') && dist < 170;
    if (kite) o.move = -dir;
    else if (dist > want) o.move = dir;
    else if (dist < want * 0.5 && cls !== 'melee' && cls !== 'heavy') o.move = -dir;
    else o.move = Math.random() < 0.15 ? -dir : 0;
    o.attack = dist <= want + 20 && Math.random() < 0.55 + this.skill * 0.45;
    if (o.attack && (cls === 'ranged' || cls === 'magic')) o.move = kite ? -dir : 0;
    if (Math.random() < 0.03) o.jump = true;
    return o;
  }
}
