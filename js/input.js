'use strict';
// ============================================================
//  Keyboard input
//  Move: A/D or ←/→   Jump: W / ↑ / Space   Attack: J
//  Skills: U / I / O  (also 1 / 2 / 3)
//  Ultimate (no camera): hold F + G + H, then press Enter
// ============================================================

const Input = {
  down: new Set(),
  pressed: new Set(),
  ultQueued: false,

  init() {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && Battle.current) e.preventDefault();
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (k === 'enter' && this.down.has('f') && this.down.has('g') && this.down.has('h')) this.ultQueued = true;
    });
    window.addEventListener('keyup', e => this.down.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.down.clear(); this.pressed.clear(); });
  },
  isDown(...keys) { return keys.some(k => this.down.has(k)); },
  wasPressed(...keys) { return keys.some(k => this.pressed.has(k)); },
  comboHeld() { return this.down.has('f') && this.down.has('g') && this.down.has('h'); },
  consumeUlt() { const u = this.ultQueued; this.ultQueued = false; return u; },
  endFrame() { this.pressed.clear(); },
};

// Controller used by the human player's fighter.
class PlayerController {
  constructor(gesture) { this.gesture = gesture; }
  get() {
    const I = Input;
    let move = 0;
    if (I.isDown('a', 'arrowleft')) move -= 1;
    if (I.isDown('d', 'arrowright')) move += 1;
    const ultKey = I.consumeUlt();
    const ultCam = Vision.consume(this.gesture);
    return {
      move,
      jump: I.wasPressed('w', 'arrowup', ' '),
      attack: I.isDown('j'),
      skill: [I.wasPressed('u', '1'), I.wasPressed('i', '2'), I.wasPressed('o', '3')],
      ult: ultKey || ultCam,
      ultSource: ultCam ? 'camera' : 'keys',
    };
  }
}
