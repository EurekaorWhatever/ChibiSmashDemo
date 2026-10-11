'use strict';
// ============================================================
//  Computer vision: face gestures for Ultimates
//  Uses MediaPipe Face Landmarker (blendshapes) loaded from CDN.
//  Gestures: tongue, blink, mouth, smile, wink, brows
//
//  MediaPipe's "tongueOut" blendshape is weak, so tongue detection
//  also samples the colour inside the open mouth: a pink/red fill
//  (tongue) vs. a dark cavity or white teeth.
// ============================================================

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const Vision = {
  status: 'off',          // off | loading | ready | error
  error: '',
  video: null,
  landmarker: null,
  stream: null,
  hasFace: false,
  values: { tongue: 0, blink: 0, mouth: 0, smile: 0, wink: 0, brows: 0 },
  thresholds: { tongue: 0.5, blink: 0.55, mouth: 0.55, smile: 0.6, wink: 0.5, brows: 0.55 },
  heldFor: {},            // seconds each gesture has been held
  fired: {},              // edge-triggered flags, consumed by controllers
  latched: {},            // true while still held after firing (prevents repeat)
  _lastTs: 0,
  _sample: null,

  get active() { return this.status === 'ready'; },

  async start() {
    if (this.status === 'loading' || this.status === 'ready') return;
    this.status = 'loading'; this.error = '';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        throw new Error('Camera API not available. Open the game via http://localhost (see README).');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      this.video = document.createElement('video');
      this.video.playsInline = true; this.video.muted = true;
      this.video.srcObject = this.stream;
      await this.video.play();

      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const opts = delegate => ({
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1,
      });
      try { this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch (e) { this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts('CPU')); }

      this._sample = document.createElement('canvas');
      this._sample.width = 320; this._sample.height = 240;
      this.status = 'ready';
      Save.data.settings.camera = true; Save.write();
    } catch (e) {
      console.warn('Vision failed:', e);
      this.status = 'error';
      this.error = e && e.message ? e.message : String(e);
      this.stop(false);
    }
  },

  stop(persist = true) {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.landmarker = null;
    if (this.status !== 'error') this.status = 'off';
    this.hasFace = false;
    for (const k in this.values) this.values[k] = 0;
    if (persist) { Save.data.settings.camera = false; Save.write(); }
  },

  // Called every animation frame with dt seconds.
  update(dt) {
    if (this.status !== 'ready' || !this.video || this.video.readyState < 2) return;
    const now = performance.now();
    if (now - this._lastTs >= 33) {           // ~30 fps detection
      this._lastTs = now;
      let res;
      try { res = this.landmarker.detectForVideo(this.video, now); } catch (e) { return; }
      this.hasFace = !!(res && res.faceBlendshapes && res.faceBlendshapes.length);
      if (this.hasFace) this._compute(res);
      else for (const k in this.values) this.values[k] *= 0.5;
    }
    const sens = Save.data.settings.sensitivity || 1;
    for (const g in GESTURES) {
      const on = this.values[g] * sens >= this.thresholds[g];
      if (on) {
        this.heldFor[g] = (this.heldFor[g] || 0) + dt;
        if (!this.latched[g] && this.heldFor[g] >= GESTURES[g].hold) { this.fired[g] = true; this.latched[g] = true; }
      } else { this.heldFor[g] = 0; this.latched[g] = false; }
    }
  },

  _compute(res) {
    const bs = {};
    for (const c of res.faceBlendshapes[0].categories) bs[c.categoryName] = c.score;
    const L = bs.eyeBlinkLeft || 0, R = bs.eyeBlinkRight || 0;
    const jaw = bs.jawOpen || 0;
    const v = this.values;
    v.blink = Math.min(L, R);
    v.wink = Math.max(0, Math.abs(L - R) - 0.1) * 1.3 * (Math.max(L, R) > 0.45 ? 1 : 0);
    v.mouth = jaw;
    v.smile = ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2;
    v.brows = ((bs.browInnerUp || 0) * 0.6 + ((bs.browOuterUpLeft || 0) + (bs.browOuterUpRight || 0)) * 0.2);
    let tongue = (bs.tongueOut || 0) * 1.5;
    if (jaw > 0.12 && res.faceLandmarks && res.faceLandmarks[0]) tongue = Math.max(tongue, this._tongueByColor(res.faceLandmarks[0]));
    v.tongue = v.tongue * 0.4 + Math.min(1, tongue) * 0.6;   // smooth
  },

  // Sample pixels inside the lip gap (13 = upper inner lip, 14 = lower inner lip).
  _tongueByColor(lm) {
    const c = this._sample, ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(this.video, 0, 0, c.width, c.height);
    const up = lm[13], lo = lm[14], l = lm[78], r = lm[308];
    const mw = Math.abs(r.x - l.x) * c.width;
    const cx = (up.x + lo.x) / 2 * c.width;
    const y0 = up.y * c.height + 1, y1 = lo.y * c.height - 1;   // inside the lip gap only
    const w = Math.max(2, mw * 0.4), h = y1 - y0;
    if (h < 3) return 0;
    let data;
    try { data = ctx.getImageData(Math.round(cx - w / 2), Math.round(y0), Math.round(w), Math.round(h)).data; } catch (e) { return 0; }
    let pink = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i + 1], B = data[i + 2];
      total++;
      const bright = (R + G + B) / 3;
      if (bright > 55 && R > G * 1.28 && R > B * 1.1 && R - G > 35) pink++;
    }
    return total ? Math.min(1, (pink / total) * 1.6) : 0;
  },

  consume(g) { if (this.fired[g]) { this.fired[g] = false; return true; } return false; },
  clearFired() { this.fired = {}; },
  progress(g) { return Math.min(1, (this.heldFor[g] || 0) / GESTURES[g].hold); },
};
