'use strict';
// ============================================================
//  Boot + main loop
// ============================================================
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function fit() {
    const s = Math.min(window.innerWidth / STAGE.W, window.innerHeight / STAGE.H);
    document.documentElement.style.setProperty('--s', s);
  }
  window.addEventListener('resize', fit); fit();

  Save.load();
  Input.init();
  UI.init();
  UI.show('home');
  if (Save.data.settings.camera) Vision.start().then(() => { if (UI.screen === 'home' || UI.screen === 'settings') UI.rerender(); });

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const W = Battle.current;
    if (!W || W.finished) return;
    W.paused = !W.paused;
    if (W.paused) { UI.root.innerHTML = SCREENS.pause(); } else UI.root.innerHTML = '';
  });
  // auto-pause when the tab loses focus mid-fight
  document.addEventListener('visibilitychange', () => {
    const W = Battle.current;
    if (document.hidden && W && !W.finished && !W.paused) { W.paused = true; UI.root.innerHTML = SCREENS.pause(); }
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    Vision.update(dt);
    const W = Battle.current;
    if (W) {
      W.update(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      W.draw(ctx);
    }
    UI.tick(dt);
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
