'use strict';
// ============================================================
//  Art: procedural chibi rendering in a ZZZ-like pop style —
//  giant heads, stubby bodies, thick ink outlines, flat colours,
//  comic effects. Everything is drawn with Canvas 2D paths.
// ============================================================

const INK = '#17151f';

const Art = {
  // ---------- primitives ----------
  ink(ctx, fill, lw = 4) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  },
  ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); },
  poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); },
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  },
  limb(ctx, x1, y1, x2, y2, color, w) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = INK; ctx.lineWidth = w + 7; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  },
  shade(hex, amt) {
    let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  },
  star(ctx, x, y, r1, r2, n, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  },
  text(ctx, str, x, y, size, fill, opts = {}) {
    ctx.font = `${opts.weight || 900} ${opts.italic === false ? '' : 'italic'} ${size}px ${opts.font || 'Rubik, sans-serif'}`;
    ctx.textAlign = opts.align || 'center'; ctx.textBaseline = opts.base || 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = opts.stroke || Math.max(3, size / 5); ctx.strokeStyle = opts.strokeColor || INK; ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  },
  // comic "anger mark" (ZZZ reference)
  anger(ctx, x, y, s, color = '#ff3b4f') {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(3, -9); ctx.quadraticCurveTo(3, -3, 9, -3); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },

  // ---------- chibi ----------
  // pose: { t, walk, moving, air, arm, arm2, wRot, lean, squash, eyes, mouth, weaponHidden, draw, alpha, aura }
  chibi(ctx, ch, p) {
    const L = ch.look;
    ctx.save();
    if (p.alpha != null) ctx.globalAlpha *= p.alpha;
    const sq = p.squash || 1;
    ctx.scale(1 + (1 - sq) * 0.6, sq);
    ctx.rotate(p.lean || 0);
    const t = p.t || 0;
    const bob = p.air ? 0 : p.moving ? -Math.abs(Math.sin(p.walk * 2)) * 4 : Math.sin(t * 3.2) * 1.6;

    if (p.aura) {
      ctx.save(); ctx.globalAlpha *= 0.35 + Math.sin(t * 12) * 0.1;
      this.ell(ctx, 0, -60, 52, 72); ctx.fillStyle = p.aura; ctx.fill(); ctx.restore();
    }

    // legs
    const sw = p.moving && !p.air ? Math.sin(p.walk) * 10 : 0;
    const legY = -27 + bob;
    const legs = p.air
      ? [[-8, legY, -14, -10], [7, legY, 14, -14]]
      : [[-7, legY, -7 - sw, -5], [7, legY, 7 + sw, -5]];
    legs.forEach(([x1, y1, x2, y2], i) => {
      this.limb(ctx, x1, y1, x2, y2, i === 0 ? this.shade(L.outfit, -0.25) : L.outfit, 9);
      this.ell(ctx, x2 + 3, y2 + 1, 9, 6); this.ink(ctx, L.outfit2, 3.5);
    });

    // back arm
    const sh2 = [-11, -50 + bob], a2 = p.arm2 != null ? p.arm2 : 1.95 + Math.sin(t * 3) * 0.05;
    const h2 = [sh2[0] + Math.cos(a2) * 16, sh2[1] + Math.sin(a2) * 16];
    this.limb(ctx, sh2[0], sh2[1], h2[0], h2[1], this.shade(L.outfit, -0.2), 8);
    this.ell(ctx, h2[0], h2[1], 5.5, 5.5); this.ink(ctx, L.skin, 3);

    // body
    ctx.beginPath();
    ctx.moveTo(-14, -56 + bob); ctx.lineTo(14, -56 + bob); ctx.lineTo(19, -24 + bob);
    ctx.quadraticCurveTo(0, -20 + bob, -19, -24 + bob); ctx.closePath();
    this.ink(ctx, L.outfit, 4);
    ctx.beginPath(); ctx.moveTo(-17, -32 + bob); ctx.lineTo(17, -32 + bob); ctx.lineTo(19, -24 + bob);
    ctx.quadraticCurveTo(0, -20 + bob, -19, -24 + bob); ctx.closePath(); this.ink(ctx, L.outfit2, 3);
    this.poly(ctx, [[-6, -56 + bob], [6, -56 + bob], [0, -46 + bob]]); this.ink(ctx, L.accent, 3);

    // weapon + front arm
    const sh = [10, -50 + bob], a = p.arm != null ? p.arm : 0.9;
    const hand = [sh[0] + Math.cos(a) * 17, sh[1] + Math.sin(a) * 17];
    if (!p.weaponHidden) {
      ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(a + (p.wRot || 0));
      this.weapon(ctx, ch.weapon, ch.fx, L, p);
      ctx.restore();
    }
    this.limb(ctx, sh[0], sh[1], hand[0], hand[1], L.outfit, 8);
    this.ell(ctx, hand[0], hand[1], 6, 6); this.ink(ctx, L.skin, 3);

    // head
    this.head(ctx, ch, 3, -86 + bob, p);

    ctx.restore();
  },

  // Draw something white-flashed via an offscreen buffer (fn draws relative to the anchor).
  _off: null,
  flashDraw(ctx, flash, w, h, ax, ay, fn) {
    if (!(flash > 0)) { fn(ctx); return; }
    const c = this._off || (this._off = document.createElement('canvas'));
    if (c.width < w) c.width = w; if (c.height < h) c.height = h;
    const o = c.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, c.width, c.height);
    o.save(); o.translate(ax, ay); fn(o); o.restore();
    o.globalCompositeOperation = 'source-atop'; o.globalAlpha = Math.min(1, flash) * 0.6;
    o.fillStyle = '#fff'; o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
    ctx.drawImage(c, 0, 0, w, h, -ax, -ay, w, h);
  },

  head(ctx, ch, hx, hy, p) {
    const L = ch.look, st = L.style;
    // back hair
    ctx.save();
    if (st === 'bob' || st === 'messy') { this.ell(ctx, hx - 4, hy + 4, 37, 31); this.ink(ctx, L.hair2, 4); }
    if (st === 'long') {
      this.rr(ctx, hx - 42, hy - 8, 66, 74, 18); this.ink(ctx, L.hair2, 4);
    }
    if (st === 'twin') {
      [[-38, 0.25], [30, -0.2]].forEach(([dx, r]) => {
        this.ell(ctx, hx + dx, hy + 26, 12, 28, r); this.ink(ctx, L.hair, 4);
        this.ell(ctx, hx + dx + (dx < 0 ? 4 : -4), hy + 2, 6, 5); this.ink(ctx, L.accent, 3);
      });
    }
    if (st === 'pony') {
      ctx.beginPath(); ctx.moveTo(hx - 26, hy - 18);
      ctx.quadraticCurveTo(hx - 72, hy - 6, hx - 58, hy + 40);
      ctx.quadraticCurveTo(hx - 48, hy + 12, hx - 28, hy + 4); ctx.closePath(); this.ink(ctx, L.hair, 4);
      this.ell(ctx, hx - 30, hy - 8, 6, 7); this.ink(ctx, L.accent, 3);
    }
    if (st === 'spiky') {
      this.poly(ctx, [[hx - 20, hy - 24], [hx - 52, hy - 22], [hx - 34, hy - 8], [hx - 56, hy + 4], [hx - 34, hy + 10], [hx - 44, hy + 24], [hx - 20, hy + 16]]);
      this.ink(ctx, L.hair2, 4);
    }
    ctx.restore();

    // face
    this.ell(ctx, hx, hy, 32, 29); this.ink(ctx, L.skin, 4);
    // ear
    this.ell(ctx, hx - 24, hy + 6, 5, 7); this.ink(ctx, L.skin, 3);

    // accessories behind top hair
    if (L.acc === 'catears') {
      [[-22, -0.3], [14, 0.25]].forEach(([dx, r]) => {
        ctx.save(); ctx.translate(hx + dx, hy - 22); ctx.rotate(r);
        this.poly(ctx, [[-11, 4], [0, -22], [11, 4]]); this.ink(ctx, L.hair, 4);
        this.poly(ctx, [[-5, 1], [0, -12], [5, 1]]); ctx.fillStyle = '#ffb3c7'; ctx.fill();
        ctx.restore();
      });
    }
    if (L.acc === 'horns') {
      [[-16, -1], [16, 1]].forEach(([dx, s]) => {
        ctx.beginPath(); ctx.moveTo(hx + dx - 6, hy - 22);
        ctx.quadraticCurveTo(hx + dx + s * 4, hy - 50, hx + dx + s * 14, hy - 52);
        ctx.quadraticCurveTo(hx + dx + s * 6, hy - 38, hx + dx + 6, hy - 22); ctx.closePath();
        this.ink(ctx, L.accent, 3.5);
      });
    }

    // eyes
    this.face(ctx, ch, hx, hy, p);

    // top hair + bangs
    ctx.beginPath();
    if (st === 'spiky' || st === 'messy') {
      const n = st === 'spiky' ? 9 : 7;
      for (let i = 0; i <= n * 2; i++) {
        const ang = -i / (n * 2) * Math.PI, r = i % 2 ? (st === 'spiky' ? 44 : 39) : 34;
        ctx.lineTo(hx + Math.cos(ang) * r, hy - 3 + Math.sin(ang) * r * 0.92);
      }
    } else ctx.ellipse(hx, hy - 3, 34, 31, 0, 0, Math.PI, true);
    // back side lock, then bangs left -> right
    ctx.lineTo(hx - 36, hy + 16); ctx.lineTo(hx - 27, hy + 6);
    const bangs = [[-22, -12], [-17, 1], [-11, -9], [-4, 3], [2, -10], [9, 2], [15, -9], [22, 1], [27, -8], [34, -3]];
    bangs.forEach(([x, y]) => ctx.lineTo(hx + x, hy + y));
    ctx.closePath();
    this.ink(ctx, L.hair, 4);
    // hair shine
    ctx.save(); ctx.globalAlpha *= 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(hx + 2, hy - 6, 22, 18, 0, -2.5, -1.8); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hx + 2, hy - 6, 22, 18, 0, -1.55, -1.15); ctx.stroke();
    ctx.restore();

    // accessories on top
    if (L.acc === 'ahoge') {
      ctx.beginPath(); ctx.moveTo(hx + 2, hy - 32);
      ctx.bezierCurveTo(hx - 2, hy - 56, hx + 26, hy - 54, hx + 14, hy - 40);
      ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = L.hair; ctx.lineWidth = 4; ctx.stroke();
    }
    if (L.acc === 'cap') {
      ctx.beginPath(); ctx.ellipse(hx, hy - 12, 35, 25, 0, Math.PI, 0); ctx.closePath(); this.ink(ctx, L.outfit2, 4);
      this.ell(ctx, hx + 30, hy - 12, 21, 5.5); this.ink(ctx, this.shade(L.outfit2, -0.35), 3.5);
      this.ell(ctx, hx + 2, hy - 26, 6, 6); this.ink(ctx, L.accent, 3);
    }
    if (L.acc === 'headphones') {
      ctx.beginPath(); ctx.ellipse(hx - 2, hy - 2, 36, 35, 0, -2.9, -0.4);
      ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = L.accent; ctx.lineWidth = 4.5; ctx.stroke();
      this.rr(ctx, hx - 40, hy - 10, 14, 24, 6); this.ink(ctx, L.outfit2, 3.5);
    }
    if (L.acc === 'goggles') {
      ctx.beginPath(); ctx.ellipse(hx, hy - 4, 34, 30, 0, -3.05, -0.1);
      ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = L.outfit2; ctx.lineWidth = 4; ctx.stroke();
      [[-6, -24], [16, -24]].forEach(([dx, dy]) => {
        this.ell(ctx, hx + dx, hy + dy, 10, 8); this.ink(ctx, '#bdf4ff', 3.5);
        this.ell(ctx, hx + dx - 3, hy + dy - 2, 3, 2); ctx.fillStyle = '#fff'; ctx.fill();
      });
    }
    if (L.acc === 'halo') {
      ctx.save(); ctx.shadowColor = '#fff6a0'; ctx.shadowBlur = 12;
      this.ell(ctx, hx, hy - 46 + Math.sin((p.t || 0) * 2) * 2, 22, 6);
      ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    }
  },

  face(ctx, ch, hx, hy, p) {
    const L = ch.look, ey = hy + 8, e = p.eyes || 'open';
    const blink = e === 'open' && ((p.t || 0) % 3.7) < 0.12;
    const eyes = [[hx - 6, 1], [hx + 16, 0.82]];
    eyes.forEach(([x, s], i) => {
      ctx.save();
      if (e === 'closed' || blink) {
        ctx.beginPath(); ctx.moveTo(x - 7 * s, ey); ctx.quadraticCurveTo(x, ey + 5, x + 7 * s, ey);
        ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.stroke();
      } else if (e === 'happy') {
        ctx.beginPath(); ctx.moveTo(x - 7 * s, ey + 3); ctx.quadraticCurveTo(x, ey - 7, x + 7 * s, ey + 3);
        ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.stroke();
      } else if (e === 'hurt') {
        const d = i === 0 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x - 6 * d * s, ey - 6); ctx.lineTo(x + 5 * d * s, ey); ctx.lineTo(x - 6 * d * s, ey + 6);
        ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.stroke();
      } else {
        // big anime eye
        this.ell(ctx, x, ey, 7 * s, 10); ctx.fillStyle = INK; ctx.fill();
        this.ell(ctx, x, ey + 1, 5.4 * s, 8); ctx.fillStyle = L.eye; ctx.fill();
        this.ell(ctx, x, ey + 5, 4.5 * s, 3.5); ctx.fillStyle = this.shade(L.eye, 0.45); ctx.fill();
        this.ell(ctx, x, ey + 1, 2.4 * s, 4); ctx.fillStyle = this.shade(L.eye, -0.6); ctx.fill();
        this.ell(ctx, x - 2 * s, ey - 3, 2.3, 2.8); ctx.fillStyle = '#fff'; ctx.fill();
        this.ell(ctx, x + 2 * s, ey + 4, 1.1, 1.1); ctx.fill();
        // upper lash
        ctx.beginPath(); ctx.moveTo(x - 8 * s, ey - 6); ctx.quadraticCurveTo(x, ey - 13, x + 8 * s, ey - 7);
        ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.stroke();
        if (e === 'angry') {
          ctx.beginPath(); const d = i === 0 ? 1 : -1;
          ctx.moveTo(x - 8 * s * d, ey - 15); ctx.lineTo(x + 7 * s * d, ey - 9); ctx.lineWidth = 3.5; ctx.stroke();
        }
      }
      ctx.restore();
    });
    // blush
    ctx.save(); ctx.globalAlpha *= 0.4; ctx.fillStyle = '#ff7f9a';
    this.ell(ctx, hx - 13, hy + 18, 6, 3); ctx.fill(); this.ell(ctx, hx + 23, hy + 18, 5, 3); ctx.fill(); ctx.restore();
    // mouth
    const mx = hx + 7, my = hy + 20, m = p.mouth || 'smile';
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    if (m === 'smile') { ctx.beginPath(); ctx.arc(mx, my - 3, 4, 0.3, Math.PI - 0.3); ctx.stroke(); }
    else if (m === 'flat') { ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.lineTo(mx + 4, my); ctx.stroke(); }
    else if (m === 'open' || m === 'tongue') {
      this.ell(ctx, mx, my, 5.5, m === 'tongue' ? 4 : 5.5); this.ink(ctx, '#6b1d2a', 2.5);
      if (m === 'tongue') {
        ctx.beginPath(); ctx.moveTo(mx - 4, my + 1); ctx.lineTo(mx - 4, my + 8); ctx.arc(mx, my + 8, 4, Math.PI, 0, true); ctx.lineTo(mx + 4, my + 1);
        this.ink(ctx, '#ff6f91', 2.5);
      } else { this.ell(ctx, mx, my + 3, 3.5, 2); ctx.fillStyle = '#ff6f91'; ctx.fill(); }
    } else if (m === 'grit') {
      this.rr(ctx, mx - 6, my - 3, 12, 7, 2); this.ink(ctx, '#fff', 2.4);
      ctx.beginPath(); ctx.moveTo(mx - 6, my + 0.5); ctx.lineTo(mx + 6, my + 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    } else if (m === 'o') { this.ell(ctx, mx, my, 3, 3.5); this.ink(ctx, '#6b1d2a', 2.4); }
  },

  // weapon drawn from the hand, pointing along +x
  weapon(ctx, w, fx, L, p) {
    const steel = '#eef3ff', dark = '#3a3a48', wood = '#9c6b3f';
    const edge = () => { ctx.strokeStyle = fx; ctx.lineWidth = 2; ctx.stroke(); };
    switch (w) {
      case 'sword':
        this.rr(ctx, -8, -3.5, 14, 7, 2); this.ink(ctx, dark, 3);
        this.rr(ctx, 5, -9, 5, 18, 2); this.ink(ctx, L.accent, 3);
        this.poly(ctx, [[10, -4.5], [54, -4.5], [64, 0], [54, 4.5], [10, 4.5]]); this.ink(ctx, steel, 3.5);
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(56, 0); edge(); break;
      case 'rapier':
        this.rr(ctx, -8, -3, 12, 6, 2); this.ink(ctx, dark, 3);
        this.ell(ctx, 6, 0, 5, 9); this.ink(ctx, L.accent, 3);
        this.poly(ctx, [[10, -2], [70, -0.6], [74, 0], [70, 0.6], [10, 2]]); this.ink(ctx, steel, 3);
        break;
      case 'katana':
        this.rr(ctx, -12, -3.5, 18, 7, 2); this.ink(ctx, '#c1121f', 3);
        this.ell(ctx, 7, 0, 3, 8); this.ink(ctx, INK, 2);
        ctx.beginPath(); ctx.moveTo(10, -3.5); ctx.quadraticCurveTo(44, -8, 72, -6); ctx.lineTo(66, 1); ctx.quadraticCurveTo(40, 2, 10, 3.5); ctx.closePath();
        this.ink(ctx, steel, 3.5); ctx.beginPath(); ctx.moveTo(14, 0); ctx.quadraticCurveTo(40, -2, 64, -2); edge(); break;
      case 'hammer':
        this.rr(ctx, -14, -3.5, 62, 7, 3); this.ink(ctx, wood, 3);
        this.rr(ctx, 40, -18, 26, 36, 5); this.ink(ctx, '#8d99ae', 4);
        this.rr(ctx, 40, -6, 26, 12, 2); this.ink(ctx, L.outfit2 || fx, 3); break;
      case 'mace':
        this.rr(ctx, -12, -3.5, 50, 7, 3); this.ink(ctx, dark, 3);
        this.star(ctx, 50, 0, 22, 13, 8, (p.t || 0)); this.ink(ctx, '#adb5bd', 3.5);
        this.ell(ctx, 50, 0, 12, 12); this.ink(ctx, fx, 3); break;
      case 'claymore':
        this.rr(ctx, -14, -4, 20, 8, 2); this.ink(ctx, dark, 3);
        this.rr(ctx, 4, -15, 7, 30, 2); this.ink(ctx, L.outfit2 || fx, 3);
        this.poly(ctx, [[11, -9], [82, -9], [96, 0], [82, 9], [11, 9]]); this.ink(ctx, steel, 4);
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(84, 0); edge(); break;
      case 'bow':
        ctx.beginPath(); ctx.arc(-6, 0, 34, -1.15, 1.15); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke();
        ctx.strokeStyle = wood; ctx.lineWidth = 4.5; ctx.stroke();
        { const ex = -6 + Math.cos(1.15) * 34, ey = Math.sin(1.15) * 34, pull = p.draw ? -14 : 0;
          ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(pull, 0); ctx.lineTo(ex, ey); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
          if (p.draw) { ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(36, 0); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); } }
        break;
      case 'crossbow':
        this.rr(ctx, -10, -4, 46, 8, 3); this.ink(ctx, dark, 3);
        ctx.beginPath(); ctx.arc(20, 0, 24, -1.3, 1.3); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke();
        ctx.strokeStyle = L.outfit2 || fx; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(20 + Math.cos(1.3) * 24, -Math.sin(1.3) * 24); ctx.lineTo(8, 0); ctx.lineTo(20 + Math.cos(1.3) * 24, Math.sin(1.3) * 24);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        this.poly(ctx, [[8, -2], [42, -2], [48, 0], [42, 2], [8, 2]]); this.ink(ctx, fx, 2); break;
      case 'slingshot':
        this.rr(ctx, -4, -3.5, 22, 7, 3); this.ink(ctx, wood, 3);
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(30, -12); ctx.moveTo(16, 0); ctx.lineTo(30, 12);
        ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = wood; ctx.lineWidth = 4.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(30, -12); ctx.lineTo(p.draw ? 4 : 22, 0); ctx.lineTo(30, 12); ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 2; ctx.stroke(); break;
      case 'staff':
        this.rr(ctx, -24, -3, 72, 6, 3); this.ink(ctx, wood, 3);
        ctx.save(); ctx.shadowColor = fx; ctx.shadowBlur = 16;
        this.star(ctx, 54, 0, 13, 6, 4, (p.t || 0) * 2); this.ink(ctx, L.outfit2 || fx, 3); ctx.restore();
        this.ell(ctx, 54, 0, 5, 5); ctx.fillStyle = '#fff'; ctx.fill(); break;
      case 'orb':
        ctx.save(); ctx.shadowColor = fx; ctx.shadowBlur = 20;
        this.ell(ctx, 18, -6 + Math.sin((p.t || 0) * 4) * 3, 13, 13); this.ink(ctx, fx, 3.5); ctx.restore();
        this.ell(ctx, 14, -10 + Math.sin((p.t || 0) * 4) * 3, 4, 3); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(18, -6, 22, 6, (p.t || 0) * 3, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); break;
      case 'book':
        ctx.save(); ctx.rotate(-(p.arm || 0) * 0.7);
        this.poly(ctx, [[2, -12], [16, -8], [30, -12], [30, 10], [16, 14], [2, 10]]); this.ink(ctx, '#fffaf0', 3);
        ctx.beginPath(); ctx.moveTo(16, -8); ctx.lineTo(16, 14); ctx.stroke();
        this.rr(ctx, 0, -14, 32, 30, 4); ctx.strokeStyle = '#6a4c93'; ctx.lineWidth = 2; ctx.stroke();
        ctx.shadowColor = fx; ctx.shadowBlur = 14; this.star(ctx, 16, -22, 7, 3, 4, (p.t || 0) * 3); ctx.fillStyle = fx; ctx.fill();
        ctx.restore(); break;
      case 'spear':
        this.rr(ctx, -34, -3, 98, 6, 3); this.ink(ctx, wood, 3);
        this.poly(ctx, [[62, -7], [86, 0], [62, 7], [66, 0]]); this.ink(ctx, steel, 3.5);
        this.rr(ctx, 56, -4, 7, 8, 2); this.ink(ctx, L.accent, 2.5); break;
      case 'lance':
        this.rr(ctx, -30, -4, 30, 8, 3); this.ink(ctx, dark, 3);
        this.ell(ctx, 4, 0, 6, 14); this.ink(ctx, L.outfit2 || fx, 3);
        this.poly(ctx, [[8, -10], [94, -1.5], [98, 0], [94, 1.5], [8, 10]]); this.ink(ctx, steel, 3.5);
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(88, 0); edge(); break;
      case 'halberd':
        this.rr(ctx, -34, -3, 104, 6, 3); this.ink(ctx, dark, 3);
        this.poly(ctx, [[68, -6], [92, 0], [68, 6]]); this.ink(ctx, steel, 3);
        ctx.beginPath(); ctx.moveTo(54, -3); ctx.quadraticCurveTo(58, -28, 74, -30); ctx.lineTo(70, -3); ctx.closePath(); this.ink(ctx, steel, 3.5);
        this.poly(ctx, [[54, 3], [62, 14], [66, 3]]); this.ink(ctx, L.accent, 3); break;
    }
  },

  // ---------- minion (magic summon) ----------
  sprite(ctx, color, t, s = 1) {
    ctx.save(); ctx.scale(s, s);
    const b = Math.abs(Math.sin(t * 10)) * -5;
    this.poly(ctx, [[-12, -18 + b], [-14, -34 + b], [-4, -22 + b]]); this.ink(ctx, color, 3);
    this.poly(ctx, [[12, -18 + b], [14, -34 + b], [4, -22 + b]]); this.ink(ctx, color, 3);
    this.ell(ctx, 0, -12 + b, 16, 13); this.ink(ctx, color, 3.5);
    this.ell(ctx, 0, -9 + b, 10, 7); ctx.fillStyle = '#fff'; ctx.fill();
    this.ell(ctx, -4, -10 + b, 2, 3); ctx.fillStyle = INK; ctx.fill(); this.ell(ctx, 5, -10 + b, 2, 3); ctx.fill();
    ctx.restore();
  },

  // ---------- training dummy ----------
  dummy(ctx, t, hitT) {
    ctx.save(); ctx.rotate(Math.sin(hitT * 30) * hitT * 0.6);
    this.rr(ctx, -5, -80, 10, 80, 3); this.ink(ctx, '#9c6b3f', 3.5);
    this.rr(ctx, -40, -88, 80, 10, 4); this.ink(ctx, '#9c6b3f', 3.5);
    this.ell(ctx, 0, -60, 26, 32); this.ink(ctx, '#e9d8a6', 4);
    this.ell(ctx, 0, -120, 30, 28); this.ink(ctx, '#e9d8a6', 4);
    [22, 14, 6].forEach((r, i) => { this.ell(ctx, 0, -60, r, r); ctx.fillStyle = i % 2 ? '#fff' : '#e63946'; ctx.fill(); });
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(-14, -126); ctx.lineTo(-6, -118); ctx.moveTo(-6, -126); ctx.lineTo(-14, -118);
    ctx.moveTo(6, -126); ctx.lineTo(14, -118); ctx.moveTo(14, -126); ctx.lineTo(6, -118);
    ctx.moveTo(-8, -106); ctx.quadraticCurveTo(0, -110, 8, -106); ctx.stroke();
    ctx.restore();
  },

  // ---------- boss: "Gloomhorn, Ether Tyrant" ----------
  boss(ctx, b) {
    const t = b.anim, s = b.state, enr = b.enraged;
    const body = enr ? '#3d1a5b' : '#2b2140', glow = enr ? '#ff3d7f' : '#ff9f1c';
    ctx.save();
    const breathe = Math.sin(t * 2.5) * 4;
    const wind = (s === 'windup') ? Math.sin(b.stateT * 40) * 2 : 0;
    ctx.translate(wind, 0);
    let squash = 1;
    if (s === 'windup' && b.pattern === 'slam') squash = 1 - Math.min(0.15, b.stateT * 0.2);
    ctx.scale(1 + (1 - squash), squash);
    // legs
    [[-50, 1], [50, -1]].forEach(([x]) => { this.rr(ctx, x - 22, -60, 44, 60, 14); this.ink(ctx, this.shade(body, -0.3), 5); });
    // body
    ctx.beginPath();
    ctx.moveTo(-110, -60); ctx.quadraticCurveTo(-130, -200 - breathe, 0, -240 - breathe);
    ctx.quadraticCurveTo(130, -200 - breathe, 110, -60); ctx.quadraticCurveTo(0, -36, -110, -60); ctx.closePath();
    this.ink(ctx, body, 6);
    // cracks
    ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 18; ctx.strokeStyle = glow; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-70, -90); ctx.lineTo(-50, -120); ctx.lineTo(-62, -150); ctx.moveTo(70, -80); ctx.lineTo(56, -112); ctx.lineTo(74, -140);
    ctx.moveTo(-10, -70); ctx.lineTo(8, -96); ctx.lineTo(-4, -116); ctx.stroke(); ctx.restore();
    // horns
    [[-1], [1]].forEach(([d]) => {
      ctx.beginPath(); ctx.moveTo(d * 50, -215 - breathe); ctx.quadraticCurveTo(d * 110, -280, d * 130, -310);
      ctx.quadraticCurveTo(d * 96, -250, d * 80, -200 - breathe); ctx.closePath(); this.ink(ctx, '#f1e3c6', 5);
    });
    // eye
    const ex = b.facing * 18, ey = -175 - breathe;
    this.ell(ctx, ex, ey, 46, 38); this.ink(ctx, '#fff7e6', 5);
    ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = s === 'windup' ? 30 : 10;
    this.ell(ctx, ex + b.facing * 10, ey + 2, 24, 26); ctx.fillStyle = glow; ctx.fill(); ctx.restore();
    this.ell(ctx, ex + b.facing * 12, ey + 2, 8, 18); ctx.fillStyle = INK; ctx.fill();
    this.ell(ctx, ex + b.facing * 2, ey - 10, 7, 6); ctx.fillStyle = '#fff'; ctx.fill();
    if (s === 'windup' || enr) { // angry lid
      ctx.beginPath(); ctx.moveTo(ex - 50, ey - 40); ctx.lineTo(ex + 50, ey - 22); ctx.lineTo(ex + 50, ey - 46); ctx.lineTo(ex - 50, ey - 46); ctx.closePath(); this.ink(ctx, body, 5);
    }
    // mouth (teeth)
    ctx.beginPath(); ctx.moveTo(-50 + ex, -112); ctx.quadraticCurveTo(ex, -88, 50 + ex, -112); ctx.quadraticCurveTo(ex, -100, -50 + ex, -112);
    this.ink(ctx, '#fff', 4);
    // arms / fists
    const armUp = (s === 'windup' && b.pattern === 'slam') ? -1 : (s === 'attack' && b.pattern === 'slam') ? 0.4 : 0;
    [[-1], [1]].forEach(([d]) => {
      const fx = d * 140, fy = -110 + armUp * 110 + Math.sin(t * 3 + d) * 4;
      this.limb(ctx, d * 95, -150, fx, fy, body, 22);
      this.ell(ctx, fx, fy, 34, 30); this.ink(ctx, this.shade(body, 0.15), 5);
      ctx.strokeStyle = glow; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx - 18, fy - 6); ctx.lineTo(fx + 18, fy - 6); ctx.stroke();
    });
    ctx.restore();
  },

  // ---------- backgrounds (pre-rendered) ----------
  makeBG(kind) {
    const c = document.createElement('canvas'); c.width = STAGE.W; c.height = STAGE.H;
    const ctx = c.getContext('2d');
    if (kind === 'hollow') this.bgHollow(ctx); else if (kind === 'dojo') this.bgDojo(ctx); else this.bgCity(ctx);
    return c;
  },
  halftone(ctx, x0, y0, w, h, color, step = 14, maxR = 5, dir = 1) {
    ctx.fillStyle = color;
    for (let y = y0; y < y0 + h; y += step) for (let x = x0; x < x0 + w; x += step) {
      const f = dir > 0 ? (x - x0) / w : 1 - (x - x0) / w;
      const r = maxR * f * (0.6 + 0.4 * ((y - y0) / h));
      if (r > 0.4) { ctx.beginPath(); ctx.arc(x + ((y / step) % 2 ? step / 2 : 0), y, r, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  bgCity(ctx) {
    const W = STAGE.W, G = STAGE.GROUND, rng = mulberry32(7);
    const sky = ctx.createLinearGradient(0, 0, 0, G);
    sky.addColorStop(0, '#3fa7ff'); sky.addColorStop(0.7, '#a8dcff'); sky.addColorStop(1, '#e6f6ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, G);
    this.halftone(ctx, 0, 0, W, 260, 'rgba(255,255,255,0.25)', 18, 6, -1);
    // far skyline
    for (let x = -20; x < W; x += 60 + rng() * 40) {
      const h = 160 + rng() * 220, w = 50 + rng() * 60;
      ctx.fillStyle = '#9fc7e8'; ctx.fillRect(x, G - 80 - h, w, h + 80);
    }
    // mid buildings with ink outlines
    const pal = ['#f4efe6', '#ffd9a8', '#ffe8e8', '#e6f0ff', '#fff4c2'];
    for (let x = -30; x < W + 30;) {
      const w = 110 + rng() * 120, h = 180 + rng() * 200;
      this.rr(ctx, x, G - h, w, h + 10, 4); this.ink(ctx, pal[Math.floor(rng() * pal.length)], 4);
      for (let wy = G - h + 24; wy < G - 70; wy += 36)
        for (let wx = x + 14; wx < x + w - 24; wx += 30) {
          ctx.fillStyle = rng() < 0.25 ? '#ffe066' : '#5b7fa6'; ctx.fillRect(wx, wy, 16, 20);
        }
      if (rng() < 0.6) { // signboard
        const sw = 70 + rng() * 40, sx = x + w / 2 - sw / 2, sy = G - h + 30 + rng() * 60;
        const col = ['#ff3d7f', '#c6ff00', '#ffb800', '#00e5ff'][Math.floor(rng() * 4)];
        this.rr(ctx, sx, sy, sw, 34, 6); this.ink(ctx, col, 4);
        this.text(ctx, ['24H', 'RAMEN', 'ZERO', 'VIDEO', 'BOBA', 'ARCADE'][Math.floor(rng() * 6)], sx + sw / 2, sy + 18, 18, '#fff', { stroke: 4 });
      }
      x += w + 6 + rng() * 20;
    }
    // street
    ctx.fillStyle = '#ccd3db'; ctx.fillRect(0, G - 8, W, 24);
    ctx.fillStyle = '#2b2b36'; ctx.fillRect(0, G + 16, W, STAGE.H - G);
    ctx.fillStyle = INK; ctx.fillRect(0, G - 10, W, 4); ctx.fillRect(0, G + 14, W, 4);
    ctx.fillStyle = '#ffd400';
    for (let x = 20; x < W; x += 120) { ctx.save(); ctx.translate(x, G + 62); ctx.transform(1, 0, -0.5, 1, 0, 0); ctx.fillRect(0, 0, 60, 10); ctx.restore(); }
    this.halftone(ctx, 0, G + 20, W, STAGE.H - G - 20, 'rgba(0,0,0,0.25)', 12, 3.5, 1);
  },
  bgHollow(ctx) {
    const W = STAGE.W, G = STAGE.GROUND, rng = mulberry32(13);
    const sky = ctx.createLinearGradient(0, 0, 0, G);
    sky.addColorStop(0, '#12061f'); sky.addColorStop(0.6, '#3b0f4f'); sky.addColorStop(1, '#8e2a6b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, G);
    // ether vortex
    ctx.save(); ctx.translate(W / 2, 220);
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); ctx.ellipse(0, 0, 80 + i * 55, 30 + i * 18, -0.15, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,${80 + i * 15},200,${0.35 - i * 0.03})`; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
    // ruined buildings
    for (let x = -20; x < W;) {
      const w = 80 + rng() * 110, h = 120 + rng() * 260;
      ctx.beginPath(); ctx.moveTo(x, G); ctx.lineTo(x, G - h); ctx.lineTo(x + w * 0.4, G - h - 20 * rng()); ctx.lineTo(x + w * 0.6, G - h + 30); ctx.lineTo(x + w, G - h + 10); ctx.lineTo(x + w, G); ctx.closePath();
      this.ink(ctx, '#24123a', 4);
      for (let wy = G - h + 40; wy < G - 30; wy += 40) if (rng() < 0.5) { ctx.fillStyle = '#ff3d7f55'; ctx.fillRect(x + 12 + rng() * (w - 40), wy, 14, 18); }
      x += w + rng() * 50;
    }
    // floating cubes
    for (let i = 0; i < 14; i++) {
      const x = rng() * W, y = 60 + rng() * 360, s = 6 + rng() * 14;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rng() * 6);
      this.rr(ctx, -s, -s, s * 2, s * 2, 2); this.ink(ctx, '#ff9fe6', 2.5); ctx.restore();
    }
    ctx.fillStyle = '#1a0d26'; ctx.fillRect(0, G, W, STAGE.H - G);
    ctx.fillStyle = INK; ctx.fillRect(0, G - 2, W, 5);
    ctx.save(); ctx.shadowColor = '#ff3d7f'; ctx.shadowBlur = 12; ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) { let x = rng() * W, y = G + 10; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 80; y += 15 + rng() * 15; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
  },
  bgDojo(ctx) {
    const W = STAGE.W, G = STAGE.GROUND;
    ctx.fillStyle = '#20242e'; ctx.fillRect(0, 0, W, G);
    ctx.strokeStyle = '#2f3542'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, G); ctx.stroke(); }
    for (let y = 0; y < G; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.save(); ctx.globalAlpha = 0.35; this.text(ctx, 'TRAINING ROOM', W / 2, 300, 96, '#c6ff00', { stroke: 12 }); ctx.restore();
    this.halftone(ctx, 0, 0, W, G, 'rgba(198,255,0,0.08)', 22, 6, 1);
    ctx.fillStyle = '#c6ff00'; ctx.fillRect(0, G - 4, W, 6);
    ctx.fillStyle = '#14161c'; ctx.fillRect(0, G + 2, W, STAGE.H - G);
    for (let x = 0; x < W; x += 80) { ctx.fillStyle = (x / 80) % 2 ? '#1b1e26' : '#14161c'; ctx.fillRect(x, G + 2, 80, STAGE.H - G); }
  },
};
