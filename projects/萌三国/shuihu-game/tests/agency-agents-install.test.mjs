import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const agentsDir = path.join(root, '.claude', 'agents');
const manifestPath = path.join(root, '.claude', 'agency-agents', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

test('manifest pins the upstream revision and records every agent', () => {
  assert.equal(manifest.repository, 'https://github.com/msitarzewski/agency-agents');
  assert.match(manifest.revision, /^[0-9a-f]{40}$/);
  assert.equal(manifest.count, manifest.agents.length);
  assert.ok(manifest.count > 0);
});

test('installed agents match the recorded hashes byte for byte', () => {
  for (const agent of manifest.agents) {
    const file = path.join(agentsDir, agent.installed);
    assert.ok(fs.lstatSync(file).isFile(), `${agent.installed} must be a regular file`);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), agent.sha256, agent.installed);
  }
});

test('agents directory holds no unrecorded or missing files', () => {
  const installed = fs.readdirSync(agentsDir).sort();
  assert.deepEqual(installed, manifest.agents.map(a => a.installed).sort());
});

test('every agent has Claude Code frontmatter with a name and description', () => {
  for (const agent of manifest.agents) {
    const text = fs.readFileSync(path.join(agentsDir, agent.installed), 'utf8');
    assert.ok(text.startsWith('---\n'), `${agent.installed} must start with frontmatter`);
    const fm = text.slice(4, text.indexOf('\n---', 4));
    assert.match(fm, /^name: .+/m, `${agent.installed} name`);
    assert.match(fm, /^description: .+/m, `${agent.installed} description`);
  }
});

test('the game development roles used by this project are installed', () => {
  for (const file of ['game-designer.md', 'godot-gameplay-scripter.md', 'blender-addon-engineer.md', 'unity-architect.md'])
    assert.ok(fs.existsSync(path.join(agentsDir, file)), file);
});

test('upstream MIT license ships with the install', () => {
  const license = fs.readFileSync(path.join(root, '.claude', 'agency-agents', 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Permission is hereby granted/);
});
