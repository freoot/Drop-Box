"""Fast version of build_all_108.py using EEVEE instead of Cycles.

~5-10x faster render time with acceptable quality for Q-style characters.
Usage: Blender --background --python build_all_108_fast.py -- --start 26 --end 108
"""
import sys
# Monkey-patch the render setup before importing the main module
# We'll just import and override setup_scene
_this_dir = __import__('pathlib').Path(__file__).parent
sys.path.insert(0, str(_this_dir))

from build_all_108 import *  # noqa: F401,F403
import bpy

def setup_scene_fast(rig):
    """EEVEE-based scene setup — much faster than Cycles."""
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 1

    # orthographic camera, 3/4 view
    bpy.ops.object.camera_add(location=(4.2, -7.0, 3.8))
    cam = bpy.context.object
    cam.rotation_euler = (Vector((0, 0, 1.5)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 3.6
    scene.camera = cam

    # three-point lighting
    for loc, energy, size in [
        ((3.5, -4.5, 6.0), 800, 5),
        ((-4.5, -2.5, 3.5), 450, 4),
        ((0, 4.5, 5.0), 900, 3.5),
    ]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.shape = 'DISK'
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0, 0, 1.4)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()

    # EEVEE setup
    scene.render.engine = 'BLENDER_EEVEE'
    # Try to set quality settings that exist in this Blender version
    try: scene.eevee.taa_render_samples = 8
    except: pass
    try: scene.eevee.use_bloom = True
    except: pass
    try:
        scene.eevee.bloom_threshold = 0.8
        scene.eevee.bloom_knee = 0.5
        scene.eevee.bloom_radius = 6
        scene.eevee.bloom_intensity = 0.3
    except: pass
    try: scene.eevee.use_soft_shadows = True
    except: pass
    try:
        scene.eevee.shadow_cube_size = '1024'
        scene.eevee.shadow_map_size = '1024'
    except: pass

    scene.world.color = (0.22, 0.22, 0.25)
    scene.render.resolution_x = 704
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    return scene, cam

# Override the setup_scene function
import build_all_108 as _mod
_mod.setup_scene = setup_scene_fast

if __name__ == '__main__':
    _mod.main()
