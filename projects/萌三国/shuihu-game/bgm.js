/* Background music system for 是好汉就上山.
 * Two tracks: city theme (梁山主城) and battle theme (战斗).
 * Plays after first user gesture (browser autoplay policy).
 * Volume slider in 玩法 → 设置.
 * Uses HTMLAudioElement with loop; no Web Audio API dependency.
 */
(() => {
  const TRACKS = {
    city: 'assets/releases/CHAR-108/audio/liangshan_city.mp3',
    battle: 'assets/releases/CHAR-108/audio/battle_theme.mp3',
  };
  const STORE_KEY = 'shuihu-bgm-v1';
  const DEFAULT_VOL = 0.35;

  let audio = null;
  let currentTrack = null;
  let enabled = true;
  let volume = DEFAULT_VOL;
  let started = false;  // has the user interacted yet?

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (typeof saved.enabled === 'boolean') enabled = saved.enabled;
      if (typeof saved.volume === 'number') volume = Math.max(0, Math.min(1, saved.volume));
    } catch (e) { /* ignore */ }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ enabled, volume }));
    } catch (e) { /* ignore */ }
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');
    audio.loop = true;
    audio.volume = enabled ? volume : 0;
    audio.preload = 'auto';
    audio.addEventListener('error', () => {
      // track missing or format issue — silence gracefully
      audio.volume = 0;
    });
    return audio;
  }

  function play(track) {
    if (!enabled) { currentTrack = track; return; }
    if (!started) { currentTrack = track; return; }
    if (track === currentTrack && audio && !audio.paused) return;

    const el = ensureAudio();
    const src = TRACKS[track];
    if (!src) return;

    if (el.src !== src) {
      el.src = src;
    }
    currentTrack = track;
    el.volume = volume;
    const p = el.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked; will retry on next gesture */ });
  }

  function stop() {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    currentTrack = null;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = enabled ? volume : 0;
    save();
  }

  function setEnabled(on) {
    enabled = !!on;
    if (audio) audio.volume = enabled ? volume : 0;
    if (enabled && currentTrack && started) {
      play(currentTrack);
    } else if (!enabled) {
      stop();
    }
    save();
  }

  // Start on first user gesture (browser autoplay policy)
  function onFirstGesture() {
    if (started) return;
    started = true;
    if (enabled && currentTrack) {
      play(currentTrack);
    }
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
    window.removeEventListener('touchstart', onFirstGesture);
  }

  function init() {
    load();
    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture);
    window.addEventListener('touchstart', onFirstGesture, { passive: true });
  }

  // Page-based track switching — called from game.js render flow
  // city (default), battle (during combat), journey (route map — reuse city softer)
  window.BGM = {
    init,
    play,
    stop,
    setVolume,
    setEnabled,
    isEnabled: () => enabled,
    getVolume: () => volume,
    currentTrack: () => currentTrack,
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
