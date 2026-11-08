"""Re-render only the portrait PNGs for all 108 heroes.
Much faster than full sheet re-render (1 frame vs 8 frames per hero).
Usage: Blender --background --python rerender_portraits.py -- --start 1 --end 108
"""
import sys, bpy
_this_dir = __import__('pathlib').Path(__file__).parent
sys.path.insert(0, str(_this_dir))

from build_all_108_fast import *  # noqa: F401,F403
import build_all_108 as _mod

# Override main to only render portraits (skip sheets)
def main_portraits_only():
    manifest = []
    for (rank, name, epithet, weapon, headgear, body_type, complexion, beard, face_mark, gender) in SEATS:
        if rank < start_rank or rank > end_rank:
            continue
        hero_id = f'hero-{rank:03d}'
        try:
            rig, quality = build_character(rank, name, epithet, weapon, headgear, body_type, complexion, beard, face_mark, gender)
            scene, cam = setup_scene(rig)

            # render portrait only
            portrait_path = PORTRAIT_DIR / f'{hero_id}-portrait.png'
            render_portrait(rig, scene, str(portrait_path))

            manifest.append({
                'id': hero_id, 'rank': rank, 'name': name, 'epithet': epithet,
                'quality': quality, 'portrait': f'portraits/{hero_id}-portrait.png',
                'status': 'portrait_rerendered',
            })
            print(f'  {hero_id} portrait OK')

        except Exception as e:
            print(f'ERROR {hero_id}: {e}')
            manifest.append({'id': hero_id, 'rank': rank, 'status': 'failed', 'error': str(e)})

    (OUT / 'manifest_portraits.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    ok = sum(1 for m in manifest if m['status'] == 'portrait_rerendered')
    print(f'\nDone: {ok}/{len(manifest)} portraits re-rendered.')

_mod.main = main_portraits_only

if __name__ == '__main__':
    main_portraits_only()
