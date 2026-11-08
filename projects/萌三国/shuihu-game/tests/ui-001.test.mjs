import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'game.css'), 'utf8');

test('UI-001: legacy unprefixed building classes are removed (no duplicate overlay)', () => {
  // cityPage outputs city-tavern / city-market / city-heroes etc., not the old .tavern/.market/.train.
  // The old unprefixed rules layered on top of the new ones; removing them cancels the overlay.
  assert.doesNotMatch(css, /\.building\.tavern\{/, 'old .building.tavern must be removed');
  assert.doesNotMatch(css, /\.building\.market\{/, 'old .building.market must be removed');
  assert.doesNotMatch(css, /\.building\.train\{/, 'old .building.train must be removed');
  assert.doesNotMatch(css, /\.building\.tower\{[^}]*top:46%/, 'old .building.tower position removed');
  assert.doesNotMatch(css, /\.building\.arena\{[^}]*top:64%/, 'old .building.arena position removed');
  // New prefixed classes still exist.
  assert.match(css, /\.building\.city-tavern\{/, 'city-tavern kept');
  assert.match(css, /\.building\.city-market\{/, 'city-market kept');
});

test('UI-001: city hotspots and background use the same coordinate system', () => {
  // cityPage renders hotspots as % left/top inside .city-stage; the background is the same .city-stage.
  // Verify the JS hotspots are % positioned and the CSS stage is 16:9 with the q scene.
  const gameCode = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  assert.match(gameCode, /CITY_HOTSPOTS=\[/);
  assert.match(gameCode, /style="left:\$\{h\.x\}%;top:\$\{h\.y\}%"/);
  assert.match(css, /\.city-stage\{[^}]*aspect-ratio:16\/9/, 'city-stage keeps 16:9 aspect');
  assert.match(css, /\.city-q \.building\.city-spot\{[^}]*transform:translate\(-50%,-50%\)/, 'spot centred on its % anchor');
});

test('UI-001: city stage fills viewport height and scrolls horizontally on phones', () => {
  // The stage scroll wrapper allows horizontal pan; the stage itself is wider than 100% on narrow screens.
  assert.match(css, /\.city-stage-scroll\{[^}]*overflow:auto/, 'scroll wrapper allows pan');
  assert.match(css, /\.city-stage\{[^}]*width:max\(100%,660px\)/, 'stage widens beyond viewport');
  // City-q background is the q scene, not the old painted fallback used for scaling.
  assert.ok(css.includes("assets/q/scenes/city-q.jpg"), 'city-stage uses the q scene background');
});

test('UI-001: phone pan hint is discoverable on narrow screens', () => {
  // cityPage outputs the hint; CSS shows it only on narrow screens.
  const gameCode = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  assert.match(gameCode, /city-pan-hint/, 'cityPage renders a pan hint element');
  assert.match(gameCode, /左右滑动巡寨/, 'hint text tells users to swipe');
  assert.match(css, /\.city-pan-hint\{display:none\}/, 'hint hidden by default');
  assert.match(css, /@media\(max-width:600px\)\{\.city-pan-hint\{display:block/, 'hint shown on phones');
});
