import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function loadBGM() {
  const store = new Map();
  const listeners = new Map();
  let audioEl = null;
  class AudioMock {
    constructor() {
      this.src = '';
      this.loop = false;
      this.volume = 1;
      this.preload = '';
      this._listeners = {};
      audioEl = this;
    }
    addEventListener(evt, fn) {
      (this._listeners[evt] ||= []).push(fn);
    }
    play() { return Promise.resolve(); }
    pause() {}
  }
  const ctx = vm.createContext({
    window: {},
    document: {
      addEventListener(evt, fn) { (listeners[evt] ||= []).push(fn); },
      readyState: 'loading',
    },
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k),
    },
    Audio: AudioMock,
    console,
    requestAnimationFrame: () => 0,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'bgm.js'), 'utf8'), ctx, { filename: 'bgm.js' });
  // bgm.js exposes BGM on window; also copy to ctx top level for convenience
  ctx.BGM = ctx.window.BGM;
  return { ctx, store, listeners, getAudio: () => audioEl };
}

test('BGM object is exposed on window', () => {
  const { ctx } = loadBGM();
  assert.ok(ctx.BGM);
  assert.equal(typeof ctx.BGM.play, 'function');
  assert.equal(typeof ctx.BGM.stop, 'function');
  assert.equal(typeof ctx.BGM.setVolume, 'function');
  assert.equal(typeof ctx.BGM.setEnabled, 'function');
  assert.equal(typeof ctx.BGM.isEnabled, 'function');
  assert.equal(typeof ctx.BGM.getVolume, 'function');
  assert.equal(typeof ctx.BGM.currentTrack, 'function');
  assert.equal(typeof ctx.BGM.init, 'function');
});

test('default state: enabled, volume 0.35, no current track', () => {
  const { ctx } = loadBGM();
  assert.equal(ctx.BGM.isEnabled(), true);
  assert.equal(ctx.BGM.getVolume(), 0.35);
  assert.equal(ctx.BGM.currentTrack(), null);
});

test('setEnabled toggles and persists to localStorage', () => {
  const { ctx, store } = loadBGM();
  ctx.BGM.setEnabled(false);
  assert.equal(ctx.BGM.isEnabled(), false);
  const saved = JSON.parse(store.get('shuihu-bgm-v1'));
  assert.equal(saved.enabled, false);

  ctx.BGM.setEnabled(true);
  assert.equal(ctx.BGM.isEnabled(), true);
  const saved2 = JSON.parse(store.get('shuihu-bgm-v1'));
  assert.equal(saved2.enabled, true);
});

test('setVolume clamps and persists', () => {
  const { ctx, store } = loadBGM();
  ctx.BGM.setVolume(0.7);
  assert.equal(ctx.BGM.getVolume(), 0.7);
  const saved = JSON.parse(store.get('shuihu-bgm-v1'));
  assert.equal(saved.volume, 0.7);

  // clamp above 1
  ctx.BGM.setVolume(2.0);
  assert.equal(ctx.BGM.getVolume(), 1);

  // clamp below 0
  ctx.BGM.setVolume(-0.5);
  assert.equal(ctx.BGM.getVolume(), 0);
});

test('play sets current track name', () => {
  const { ctx } = loadBGM();
  ctx.BGM.play('city');
  // Before first gesture, track is remembered but not playing
  assert.equal(ctx.BGM.currentTrack(), 'city');
});

test('stop clears current track', () => {
  const { ctx } = loadBGM();
  ctx.BGM.play('battle');
  assert.equal(ctx.BGM.currentTrack(), 'battle');
  ctx.BGM.stop();
  assert.equal(ctx.BGM.currentTrack(), null);
});

test('audio files exist on disk', () => {
  const city = path.join(root, 'assets/releases/CHAR-108/audio/liangshan_city.mp3');
  const battle = path.join(root, 'assets/releases/CHAR-108/audio/battle_theme.mp3');
  assert.ok(fs.existsSync(city), 'city theme mp3 missing');
  assert.ok(fs.existsSync(battle), 'battle theme mp3 missing');
  // must be at least 5 seconds of audio
  const citySize = fs.statSync(city).size;
  const battleSize = fs.statSync(battle).size;
  assert.ok(citySize > 50000, `city theme too small: ${citySize} bytes`);
  assert.ok(battleSize > 50000, `battle theme too small: ${battleSize} bytes`);
});

test('bgm.js is referenced in index.html', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('bgm.js'), 'index.html must include bgm.js');
});
