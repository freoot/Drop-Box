#!/usr/bin/env python3
"""Integrate Blender-generated 108-hero sheets and portraits into data/portraits.js.

For each hero in the CHAR-108 manifest:
  - If the hero already has a Q-version premium entry in SHUIHU_ART (hero-001, 003, 004, 006,
    009, 013, 014, 022, 030, 036, 037, 059), keep the existing art (those are hand-crafted).
  - Otherwise, add a new entry pointing to the generated sheet and portrait.

Existing entries are NEVER overwritten — we only add missing ones.

Run: python3 tools/blender/char108/integrate_portraits.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / 'assets' / 'releases' / 'CHAR-108' / 'manifest.json'
PORTRAITS_JS = ROOT / 'data' / 'portraits.js'

# Premium heroes that keep their hand-crafted art (do not overwrite)
PREMIUM_KEEP = {
    'hero-001', 'hero-003', 'hero-004', 'hero-006', 'hero-009',
    'hero-013', 'hero-014', 'hero-022', 'hero-030', 'hero-036',
    'hero-037', 'hero-059',
}

def load_manifest():
    if not MANIFEST.exists():
        print(f'ERROR: manifest not found at {MANIFEST}')
        return []
    data = json.loads(MANIFEST.read_text())
    return [h for h in data if h.get('status') == 'generated_pending_review']

def parse_portraits_js():
    """Parse existing portraits.js to find which hero IDs are already defined."""
    text = PORTRAITS_JS.read_text()
    existing = set(re.findall(r'"(hero-\d+)"\s*:\s*\{', text))
    return existing, text

def build_entry(hero):
    """Build a JS object literal for one hero."""
    hid = hero['id']
    sheet_path = f"assets/releases/CHAR-108/{hero['sheet']}"
    portrait_path = f"assets/releases/CHAR-108/{hero['portrait']}"
    quality_label = {
        'diamond': '暗金', 'red': '红', 'purple': '紫', 'blue': '蓝'
    }.get(hero['quality'], '')
    return f'''  "{hid}": {{
    "portrait": "{portrait_path}",
    "status": "Q 版程序化立绘 · {quality_label}品质 · {hero['weapon']}",
    "motion": "七帧动作条：待机、两帧步行、出招、名将技、受击、倒地",
    "frames": {{
      "sheet": "{sheet_path}",
      "frameWidth": 704,
      "frameHeight": 512,
      "order": [
        "idle",
        "walkA",
        "walkB",
        "attack",
        "skill",
        "hit",
        "down"
      ]
    }},
    "artSource": "local_blender_procedural",
    "productionBatch": "CHAR-108"
  }}'''

def main():
    heroes = load_manifest()
    if not heroes:
        print('No generated heroes found in manifest.')
        return

    existing, text = parse_portraits_js()

    # Find heroes to add (not in PREMIUM_KEEP and not already existing)
    to_add = [h for h in heroes if h['id'] not in PREMIUM_KEEP and h['id'] not in existing]

    if not to_add:
        print(f'All {len(heroes)} generated heroes already present in portraits.js (or are premium keep).')
        return

    print(f'Existing hero entries: {len(existing)}')
    print(f'Generated heroes in manifest: {len(heroes)}')
    print(f'New heroes to add: {len(to_add)}')
    print(f'Premium kept (unchanged): {len(PREMIUM_KEEP & existing)}')

    # Insert new entries before the final closing brace of the SHUIHU_ART object.
    # The file ends with:
    #   }
    # };
    # We insert new entries right before the last `};`

    # Find the position of the closing `};` of SHUIHU_ART
    # Match the last `};` that closes the object
    close_match = list(re.finditer(r'\n\};', text))
    if not close_match:
        print('ERROR: could not find closing "};" of SHUIHU_ART')
        return

    # The last `};` should close the main object
    last_close = close_match[-1]
    insert_pos = last_close.start()

    # Build new entries
    new_entries = ',\n'.join(build_entry(h) for h in sorted(to_add, key=lambda h: h['id']))

    # Insert with a comma before if there isn't one already
    before = text[:insert_pos]
    after = text[insert_pos:]

    # Ensure the line before has a trailing comma
    before = before.rstrip()
    if not before.endswith(','):
        before += ','
    before += '\n'

    new_text = before + new_entries + '\n' + after

    PORTRAITS_JS.write_text(new_text)
    print(f'\nUpdated {PORTRAITS_JS}')
    print(f'Added {len(to_add)} new hero entries:')
    for h in sorted(to_add, key=lambda h: h['id']):
        print(f'  {h["id"]} · {h["epithet"]}·{h["name"]} · {h["quality"]} · {h["weapon"]}')

    print(f'\nTotal entries after integration: {len(existing) + len(to_add)}')

if __name__ == '__main__':
    main()
