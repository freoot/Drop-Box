import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../pelican.html', import.meta.url), 'utf8');
const source = html.match(/<script>(.*?)<\/script>/s)[1];
function openPage(reduced = false) {
  const classes = new Set();
  const nodes = new Map();
  const frames = new Map();
  let nextId = 1;
  let changePreference;
  const scene = { classList: {
    toggle: (key, on) => on ? classes.add(key) : classes.delete(key),
    contains: key => classes.has(key)
  }};
  function querySelector(selector) {
    if (selector === 'article') return scene;
    assert.ok(html.includes('id="' + selector.slice(1) + '"'), selector);
    if (!nodes.has(selector)) nodes.set(selector, {
      setAttribute(key, value) { this[key] = value; }
    });
    return nodes.get(selector);
  }
  runInNewContext(source, {
    document: { querySelector },
    matchMedia: () => ({
      matches: reduced,
      addEventListener: (_, listener) => { changePreference = listener; }
    }),
    requestAnimationFrame: callback => {
      frames.set(nextId, callback);
      return nextId++;
    },
    cancelAnimationFrame: id => frames.delete(id)
  });
  return {
    classes, frames, querySelector, changePreference,
    advance(time) {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(time);
      }
    }
  };
}

test('Reduced motion starts on a complete still; play and pause preserve the pose', () => {
  const page = openPage(true);
  const button = page.querySelector('#motion');
  const foot = page.querySelector('#near-foot');
  assert.ok(page.classes.has('paused'));
  assert.equal(button.textContent, '继续骑行');
  assert.equal(page.frames.size, 0);
  const initialPose = foot.transform;
  button.onclick();
  page.advance(10);
  page.advance(50);
  assert.equal(button.textContent, '暂停动画');
  assert.notEqual(foot.transform, initialPose);
  button.onclick();
  const stoppedPose = foot.transform;
  page.advance(5000);
  assert.equal(foot.transform, stoppedPose);
  button.onclick();
  page.advance(7000);
  assert.equal(foot.transform, stoppedPose);
  page.changePreference({ matches: true });
  assert.equal(page.frames.size, 0);
  assert.ok(page.classes.has('paused'));
});

function coordinates(value) {
  return value.match(/-?\d+(?:\.\d+)?/g).map(Number);
}
test('Both ankles follow opposite crank ends for a complete revolution', () => {
  const page = openPage();
  for (let time = 0; time <= 1880; time += 40) {
    page.advance(time);
    const ends = coordinates(page.querySelector('#crank').d);
    const [fx, fy, nx, ny] = ends;
    assert.ok(Math.abs(Math.hypot(nx - fx, ny - fy) - 56) < 0.001);
    assert.ok(Math.abs(fx + nx - 1376) < 0.001);
    assert.ok(Math.abs(fy + ny - 950) < 0.001);
    for (const [side, x, y] of [['far', fx, fy], ['near', nx, ny]]) {
      const foot = page.querySelector('#' + side + '-foot');
      const leg = page.querySelector('#' + side + '-leg');
      assert.deepEqual(coordinates(foot.transform), [x, y]);
      const [hx, hy, kx, ky, ax, ay] = coordinates(leg.d);
      assert.equal(ax, x - 8);
      assert.equal(ay, y - 10);
      assert.ok(Math.abs(Math.hypot(hx - kx, hy - ky) - 96) < 0.001);
      assert.ok(Math.abs(Math.hypot(ax - kx, ay - ky) - 96) < 0.001);
    }
  }
});

test('Both wheels animate in the visible scene so the pause selector reaches them', () => {
  const wheel = /<g class="wheel">\s*<use href="#wheel"\s*\/>\s*<\/g>/g;
  assert.equal([...html.matchAll(wheel)].length, 2);
  const definitions = [...html.matchAll(/<defs>([\s\S]*?)<\/defs>/g)];
  assert.ok(definitions.every(([markup]) => !markup.includes('class="wheel"')));
});
