import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const ctx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'data/portraits.js'), 'utf8'), ctx);
const ART = ctx.window.SHUIHU_ART;
const Q = { 'hero-006': 'linchong', 'hero-009': 'huarong', 'hero-003': 'wuyong', 'hero-001': 'songjiang', 'hero-013': 'luzhishen', 'hero-014': 'wusong', 'hero-022': 'likui', 'hero-004': 'gongsunsheng', 'hero-030': 'zhangshun', 'hero-036': 'yanqing', 'hero-037': 'zhuwu', 'hero-059': 'husanniang' };
const SRC = { linchong: 'linchong-actions.jpg', huarong: 'huarong-actions.jpg', wuyong: 'wuyong-actions.jpg' };

// Minimal decoder for 8-bit RGBA non-interlaced PNGs (what Pillow writes).
function decodePNG(file) {
  const buf = fs.readFileSync(path.join(root, file));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', file);
  let off = 8, w, h, depth, color, interlace; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12]; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  assert.equal(depth, 8, file); assert.equal(color, 6, 'RGBA: ' + file); assert.equal(interlace, 0, file);
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, alpha: (x, y) => px[(y * w + x) * 4 + 3] };
}

test('three heroes use the new Q portraits and 7-frame strips; old assets stay as fallback', () => {
  for (const [id, name] of Object.entries(Q)) {
    const a = ART[id];
    assert.equal(a.portrait, `assets/q/${name}-portrait.png`);
    assert.deepEqual([...a.frames.order], ['idle', 'walkA', 'walkB', 'attack', 'skill', 'hit', 'down']);
    for (const f of [a.fallbackPortrait, a.actions].filter(Boolean)) assert.ok(fs.existsSync(path.join(root, f)), `fallback kept: ${f}`);
    const src = SRC[name] ? `assets/q/${SRC[name]}` : fs.readdirSync(path.join(root,'assets/q/heroes')).find(f=>f.startsWith(name)) && 'assets/q/heroes';
    assert.ok(src && fs.existsSync(path.join(root, src)), `approved source kept for ${name}`);
  }
});

test('frame strips: exact dimensions, transparent background, shared ground line, every frame drawn', () => {
  for (const [id] of Object.entries(Q)) {
    const f = ART[id].frames, img = decodePNG(f.sheet), n = f.order.length;
    assert.equal(img.w, f.frameWidth * n); assert.equal(img.h, f.frameHeight);
    assert.equal(f.frameWidth, 704); assert.equal(f.frameHeight, 512);
    const grounds = [];
    for (let i = 0; i < n; i++) {
      const x0 = i * f.frameWidth;
      for (const [x, y] of [[0, 0], [f.frameWidth - 1, 0], [0, f.frameHeight - 1], [f.frameWidth - 1, f.frameHeight - 1]]) assert.equal(img.alpha(x0 + x, y), 0, `${id} frame ${i} corner opaque`);
      let opaque = 0, bottom = -1, top = f.frameHeight;
      for (let y = 0; y < f.frameHeight; y += 1) for (let x = 0; x < f.frameWidth; x += 2) if (img.alpha(x0 + x, y) > 20) { opaque++; bottom = Math.max(bottom, y); top = Math.min(top, y); }
      assert.ok(opaque > 3000, `${id} frame ${f.order[i]} is empty`);
      assert.ok(top > 0, `${id} frame ${f.order[i]} clipped at the top`);
      grounds.push(bottom);
    }
    assert.ok(Math.max(...grounds) - Math.min(...grounds) <= 2, `${id} ground lines differ: ${grounds}`);
  }
});

test('new portraits are 1024 square RGBA with transparent corners', () => {
  for (const id of Object.keys(Q)) {
    const img = decodePNG(ART[id].portrait);
    assert.equal(img.w, 1024); assert.equal(img.h, 1024);
    assert.equal(img.alpha(0, 0), 0); assert.equal(img.alpha(1023, 1023), 0);
  }
});

test('battle art falls back to the old atlas when a hero has no frame strip', () => {
  const g = vm.createContext({ window: {}, document: { querySelector: () => ({ dataset: {}, style: {}, classList: { add() {}, remove() {} } }), addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, confirm: () => true, console, Element: class {} });
  for (const f of ['data/shuihu.js', 'data/portraits.js', 'data/journey.js', 'journey.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), g);
  const run = e => vm.runInContext(e, g);
  assert.match(run("artHTML(heroMeta('hero-006'),'unit-art')"), /frame-strip[^"]*" style="background-image:url\('assets\/q\/linchong-sheet\.png'\)/);
  assert.match(run("artHTML(heroMeta('hero-006'))"), /assets\/q\/linchong-portrait\.png/);
  run("delete ART['hero-006'].frames");
  assert.match(run("artHTML(heroMeta('hero-006'),'unit-art')"), /action-atlas/);
  assert.equal(run("framePosition(ART['hero-009'],'down')"), '100.0000% 0');
  assert.equal(run("framePosition(ART['hero-009'],'walkB')"), '33.3333% 0');
});
