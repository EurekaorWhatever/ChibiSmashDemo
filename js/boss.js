'use strict';
// ============================================================
//  PvE boss: "Gloomhorn, Ether Tyrant"  +  practice dummy
// ============================================================

class Boss {
  constructor(W, opts = {}) {
    this.W = W; this.team = 1; this.isBoss = true; this.name = 'GLOOMHORN';
    this.maxHp = opts.hp || 7000; this.hp = this.maxHp;
    this.x = opts.x || 950; this.y = STAGE.GROUND; this.w = 210; this.h = 250; this.facing = -1;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.onGround = true;
    this.atk = 24; this.def = 20; this.critDmg = 0.5;
    this.status = { hex: 0, shred: 0, bleed: 0, slow: 0, swift: 0 };
    this.state = 'idle'; this.stateT = 0; this.wait = 1.6; this.pattern = null; this.anim = 0; this.flash = 0;
    this.dead = false; this.deadT = 0; this.stun = 0; this.enraged = false; this.lastPattern = null;
    this.stats = { dealt: 0, taken: 0, maxCombo: 0, hits: 0 };
    this.noDeath = !!opts.noDeath;
  }
  atkPower() { return this.atk * (this.enraged ? 1.15 : 1) * (this.status.hex > 0 ? 0.9 : 1); }
  critRate() { return 0.05; }
  defense() { return this.def * (this.status.shred > 0 ? 0.85 : 1); }
  superArmor() { return true; }
  get invuln() { return this.dead; }
  get cy() { return this.y - this.h / 2; }
  get speedMul() { return (this.enraged ? 1.3 : 1) * (this.status.slow > 0 ? 0.7 : 1) * (this.status.hex > 0 ? 0.85 : 1); }

  onHurt(src, opts) {
    this.flash = 0.3;
    if (!this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true; this.W.pop(this.x, this.y - 300, 'ENRAGED!', '#ff3d7f', 44); this.W.shake(14, 0.5);
    }
    if (opts.stun >= 0.8 && this.state !== 'attack') { this.stun = Math.max(this.stun, 0.5); } // big hits stagger
  }
  die() { this.dead = true; this.state = 'dead'; }

  update(dt) {
    const W = this.W;
    this.anim += dt; this.flash = Math.max(0, this.flash - dt * 7);
    for (const k in this.status) this.status[k] = Math.max(0, this.status[k] - dt);
    if (this.status.bleed > 0) { this._bleedT = (this._bleedT || 0) + dt; if (this._bleedT >= 0.5) { this._bleedT = 0; W.damage(this._bleedSrc || this, this, 0.2, { dot: true, noEnergy: true }); } }
    this.x += this.kbx * dt * 0.15; this.kbx *= Math.pow(0.01, dt);
    this.x = clamp(this.x, STAGE.LEFT + this.w / 2, STAGE.RIGHT - this.w / 2);
    if (this.dead) { this.deadT += dt; return; }
    if (W.state !== 'fight') return;
    const p = W.opponentOf(this); if (!p) return;
    if (this.stun > 0) { this.stun -= dt; return; }
    this.stateT += dt;
    const sm = this.speedMul;

    if (this.state === 'idle') {
      this.facing = Math.sign(p.x - this.x) || this.facing;
      const dist = Math.abs(p.x - this.x);
      if (dist > 260) this.x += this.facing * 90 * sm * dt;
      if (this.stateT >= this.wait / sm) this.choose(p);
    } else if (this.state === 'windup') {
      if (this.pattern === 'charge') this.x -= this.facing * 30 * dt;
      if (this.stateT >= this.windup / sm) { this.state = 'attack'; this.stateT = 0; this.startAttack(p); }
    } else if (this.state === 'attack') {
      this.attackTick(dt, p);
    } else if (this.state === 'recover') {
      if (this.stateT >= 0.7 / sm) { this.state = 'idle'; this.stateT = 0; this.wait = rand(0.5, 1.2) * (this.enraged ? 0.7 : 1); }
    }
  }

  choose(p) {
    const dist = Math.abs(p.x - this.x);
    let opts = dist < 300 ? ['slam', 'slam', 'volley', 'charge', 'rain'] : ['charge', 'volley', 'rain', 'slam'];
    if (this.enraged) opts.push('beam', 'rain');
    opts = opts.filter(o => o !== this.lastPattern);
    this.pattern = opts[Math.floor(Math.random() * opts.length)]; this.lastPattern = this.pattern;
    this.state = 'windup'; this.stateT = 0;
    this.windup = { slam: 0.85, charge: 0.75, volley: 0.6, rain: 0.5, beam: 0.9 }[this.pattern];
    this.W.pop(this.x, this.y - 290, { slam: 'SLAM!', charge: 'CHARGE!', volley: 'VOLLEY', rain: 'DEBRIS', beam: 'BEAM!' }[this.pattern], '#ffd400', 26);
  }

  startAttack(p) {
    const W = this.W;
    this.atkT = 0; this.hitDone = false;
    if (this.pattern === 'slam') {
      W.shake(18, 0.4); W.fxDust(this.x + this.facing * 140, STAGE.GROUND); W.fxRing(this.x + this.facing * 140, STAGE.GROUND, 160, '#ff9f1c');
      W.addHitbox(this, { dx: 140, dy: 50, w: 220, h: 110, life: 0.1, mult: 2.0, tag: 'boss', kb: [420, 480], stun: 0.6 });
      const n = this.enraged ? 2 : 1;
      for (let k = 0; k < n; k++) W.later(k * 0.45, () => [-1, 1].forEach(d => W.addProj(this, { kind: 'wave', x: this.x + d * 120, y: STAGE.GROUND - 24, vx: d * 620, r: 28, mult: 1.6, life: 1.6, tag: 'boss', kb: [180, 500], stun: 0.5, ground: true, color: '#ff9f1c' })));
    } else if (this.pattern === 'volley') {
      const n = this.enraged ? 7 : 5;
      for (let i = 0; i < n; i++) W.later(i * 0.12, () => {
        // ballistic arc that lands on (tx, ground) after T seconds with half gravity
        const tx = p.x + rand(-160, 160), T = 1.0, g = STAGE.GRAVITY * 0.5, y0 = this.y - 200;
        W.addProj(this, { kind: 'orbBoss', x: this.x, y: y0, vx: (tx - this.x) / T, vy: (STAGE.GROUND - y0 - 0.5 * g * T * T) / T, r: 18, mult: 1.0, life: 2.5, gravity: 0.5, tag: 'boss', stun: 0.3, kb: [120, 160], color: '#ff3d7f', fall: true });
      });
    } else if (this.pattern === 'rain') {
      const n = this.enraged ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const x = clamp(p.x + (i - (n - 1) / 2) * 130 + rand(-30, 30), STAGE.LEFT + 20, STAGE.RIGHT - 20);
        W.addObj(new Debris(W, this, x, 0.9 + i * 0.08));
      }
    } else if (this.pattern === 'beam') {
      this.beamX = this.x + this.facing * 100;
    }
  }

  attackTick(dt, p) {
    const W = this.W; this.atkT += dt;
    const sm = this.speedMul;
    if (this.pattern === 'charge') {
      this.x += this.facing * 1050 * sm * dt;
      if (!this.hitDone) {
        const hit = Math.abs(p.x - this.x) < this.w / 2 + p.w / 2 - 20 && p.y > STAGE.GROUND - 150;
        if (hit && !p.invuln) { W.damage(this, p, 1.8, { tag: 'boss', kb: [700, 360], stun: 0.6 }); this.hitDone = true; }
      }
      if (Math.random() < 0.4) W.fxDust(this.x - this.facing * 90, STAGE.GROUND);
      const atWall = (this.facing > 0 && this.x >= STAGE.RIGHT - this.w / 2 - 1) || (this.facing < 0 && this.x <= STAGE.LEFT + this.w / 2 + 1);
      if (atWall || this.atkT > 1.6) { W.shake(12, 0.3); this.state = 'recover'; this.stateT = 0; }
    } else if (this.pattern === 'beam') {
      // low beam sweeps across the floor from the boss outward — jump over it
      const dur = 1.2;
      const prog = this.atkT / dur;
      this.beamX = this.x + this.facing * (100 + prog * 1200);
      if (!this.hitDone && !p.invuln && p.y > STAGE.GROUND - 70 && Math.sign(p.x - this.x) === this.facing && Math.abs(p.x - this.beamX) < 40) {
        W.damage(this, p, 2.2, { tag: 'boss', kb: [300, 300], stun: 0.6, projectile: true, parryable: false }); this.hitDone = true;
      }
      if (this.atkT > dur) { this.state = 'recover'; this.stateT = 0; }
    } else {
      if (this.atkT > 0.4) { this.state = 'recover'; this.stateT = 0; }
    }
  }

  draw(ctx) {
    const W = this.W;
    if (this.state === 'attack' && this.pattern === 'beam') {
      ctx.save(); ctx.shadowColor = '#ff3d7f'; ctx.shadowBlur = 25;
      const y = STAGE.GROUND - 30;
      ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 26; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(this.x + this.facing * 60, this.y - 175); ctx.lineTo(this.beamX, y); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.stroke();
      Art.star(ctx, this.beamX, y, 50, 20, 8, this.anim * 10); ctx.fillStyle = '#ff9fe6'; ctx.fill();
      ctx.restore();
    }
    if (this.state === 'windup') {
      ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(this.stateT * 30) * 0.15;
      if (this.pattern === 'slam') { ctx.fillStyle = '#ff3d3d'; ctx.fillRect(this.x + this.facing * 140 - 110, STAGE.GROUND - 110, 220, 110); }
      if (this.pattern === 'charge') { ctx.fillStyle = '#ff3d3d'; const x0 = this.x, x1 = this.facing > 0 ? STAGE.RIGHT : STAGE.LEFT; ctx.fillRect(Math.min(x0, x1), STAGE.GROUND - 150, Math.abs(x1 - x0), 150); }
      if (this.pattern === 'beam') { ctx.fillStyle = '#ff3d7f'; const x0 = this.x, x1 = this.facing > 0 ? STAGE.RIGHT : STAGE.LEFT; ctx.fillRect(Math.min(x0, x1), STAGE.GROUND - 60, Math.abs(x1 - x0), 60); }
      ctx.restore();
    }
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.dead) { ctx.globalAlpha = Math.max(0, 1 - this.deadT / 2); ctx.translate(Math.sin(this.deadT * 50) * 6, this.deadT * 30); }
    Art.flashDraw(ctx, this.flash, 520, 400, 260, 360, o => Art.boss(o, this));
    ctx.restore();
    if (this.stun > 0) Art.anger(ctx, this.x + 60, this.y - 290, 2);
  }
}

class Debris {
  constructor(W, owner, x, delay) { this.W = W; this.owner = owner; this.x = x; this.t = 0; this.delay = delay; this.rot = rand(0, 6); }
  update(dt) {
    this.t += dt;
    if (this.t >= this.delay && !this.hit) {
      this.hit = true; this.W.fxDust(this.x, STAGE.GROUND); this.W.shake(5, 0.1);
      const p = this.W.opponentOf(this.owner);
      if (p && !p.invuln && Math.abs(p.x - this.x) < 55 + p.w / 2) this.W.damage(this.owner, p, 1.3, { tag: 'boss', kb: [150, 250], stun: 0.45, projectile: true });
    }
    return this.t < this.delay + 0.35;
  }
  draw(ctx) {
    const p = clamp(this.t / this.delay, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.35 + p * 0.4;
    Art.ell(ctx, this.x, STAGE.GROUND + 2, 60 * (0.3 + p * 0.7), 10); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    if (p < 1) {
      const y = lerp(-80, STAGE.GROUND - 30, p * p);
      ctx.save(); ctx.translate(this.x, y); ctx.rotate(this.rot + p * 4);
      Art.poly(ctx, [[-30, -20], [10, -32], [34, -4], [22, 26], [-24, 22]]); Art.ink(ctx, '#5a4870', 5);
      ctx.strokeStyle = '#ff9fe6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(8, 4); ctx.stroke();
      ctx.restore();
    }
  }
}

class Dummy {
  constructor(W, x) {
    this.W = W; this.team = 1; this.isDummy = true; this.name = 'TRAINING DUMMY';
    this.maxHp = 99999; this.hp = this.maxHp; this.x = x; this.y = STAGE.GROUND; this.w = 70; this.h = 150; this.facing = -1;
    this.def = 0; this.status = { hex: 0, shred: 0, bleed: 0, slow: 0, swift: 0 };
    this.hitT = 0; this.dead = false; this.onGround = true; this.stun = 0; this.kbx = 0;
    this.stats = { dealt: 0, taken: 0 };
    this.dpsWindow = []; this.anim = 0;
  }
  atkPower() { return 0; } critRate() { return 0; } defense() { return 0; } superArmor() { return true; }
  get invuln() { return false; }
  get cy() { return this.y - this.h / 2; }
  onHurt(src, opts) { this.hitT = 0.4; }
  die() { this.hp = this.maxHp; }
  update(dt) {
    this.anim += dt; this.hitT = Math.max(0, this.hitT - dt);
    for (const k in this.status) this.status[k] = Math.max(0, this.status[k] - dt);
    if (this.status.bleed > 0) { this._bleedT = (this._bleedT || 0) + dt; if (this._bleedT >= 0.5) { this._bleedT = 0; this.W.damage(this._bleedSrc || this, this, 0.2, { dot: true, noEnergy: true }); } }
    if (this.hp < this.maxHp * 0.5) this.hp = this.maxHp;
    const now = this.W.time; this.dpsWindow = this.dpsWindow.filter(e => now - e.t < 5);
  }
  get dps() { return this.dpsWindow.reduce((s, e) => s + e.d, 0) / 5; }
  draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); Art.dummy(ctx, this.anim, this.hitT); ctx.restore(); }
}
