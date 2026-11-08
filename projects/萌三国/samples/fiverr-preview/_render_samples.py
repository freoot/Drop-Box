"""
Fiverr preview 3D showcase samples — treasure chest + hero bust.
Blender 5.x headless bpy script. No external assets.
"""
import bpy
import math
import os
from mathutils import Vector, Euler

OUT_DIR = "/Users/user/Documents/Codex/youxi/meng/samples/fiverr-preview"
os.makedirs(OUT_DIR, exist_ok=True)

# Prefer EEVEE for speed/reliability headless on Mac; fallback Cycles
ENGINE = "BLENDER_EEVEE"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Clear orphan meshes/materials
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)
    for block in bpy.data.lights:
        if block.users == 0:
            bpy.data.lights.remove(block)
    for block in bpy.data.cameras:
        if block.users == 0:
            bpy.data.cameras.remove(block)


def make_mat(name, color, metallic=0.0, roughness=0.45, emission=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission[3] if len(emission) > 3 else 0.4
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def add_box(name, size, location, rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if mat:
        assign_mat(obj, mat)
    return obj


def add_cylinder(name, radius, depth, location, rotation=(0, 0, 0), mat=None, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_uv_sphere(name, radius, location, mat=None, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=location
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_plane(name, size, location, rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_plane_add(size=size, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def setup_studio(bg_color=(0.92, 0.93, 0.95, 1.0)):
    """Camera + 3-point lights + soft backdrop."""
    # World
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    wn = world.node_tree.nodes
    wl = world.node_tree.links
    wn.clear()
    wout = wn.new("ShaderNodeOutputWorld")
    bg = wn.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = bg_color
    bg.inputs["Strength"].default_value = 0.85
    wl.new(bg.outputs["Background"], wout.inputs["Surface"])

    # Camera
    bpy.ops.object.camera_add(location=(3.6, -4.2, 2.4), rotation=(math.radians(68), 0, math.radians(40)))
    cam = bpy.context.active_object
    cam.name = "ShowcaseCam"
    cam.data.lens = 50
    bpy.context.scene.camera = cam

    # Key light
    bpy.ops.object.light_add(type="AREA", location=(3.5, -2.0, 4.0))
    key = bpy.context.active_object
    key.name = "KeyLight"
    key.data.energy = 250
    key.data.size = 2.5
    key.rotation_euler = (math.radians(50), math.radians(10), math.radians(40))

    # Fill
    bpy.ops.object.light_add(type="AREA", location=(-3.0, -1.5, 2.5))
    fill = bpy.context.active_object
    fill.name = "FillLight"
    fill.data.energy = 80
    fill.data.size = 3.0
    fill.rotation_euler = (math.radians(60), 0, math.radians(-50))

    # Rim
    bpy.ops.object.light_add(type="AREA", location=(-1.5, 3.0, 3.5))
    rim = bpy.context.active_object
    rim.name = "RimLight"
    rim.data.energy = 120
    rim.data.size = 2.0
    rim.rotation_euler = (math.radians(-40), math.radians(20), math.radians(180))

    # Floor / backdrop (infinite-ish soft plane)
    floor_mat = make_mat("FloorMat", (0.88, 0.89, 0.91), roughness=0.7)
    add_plane("Floor", 20, (0, 0, 0), mat=floor_mat)

    return cam


def configure_render(filepath, res_x=1280, res_y=1280):
    scene = bpy.context.scene
    scene.render.engine = ENGINE
    # EEVEE settings (Blender 4+/5 API)
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 32
        except Exception:
            pass
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.filepath = filepath
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    # Color management
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "None"
    except Exception:
        try:
            scene.view_settings.view_transform = "Filmic"
        except Exception:
            pass


def build_treasure_chest():
    clear_scene()
    setup_studio(bg_color=(0.94, 0.92, 0.88, 1.0))

    wood = make_mat("Wood", (0.42, 0.24, 0.10), roughness=0.55)
    wood_dark = make_mat("WoodDark", (0.28, 0.14, 0.06), roughness=0.6)
    metal = make_mat("Metal", (0.72, 0.62, 0.28), metallic=0.85, roughness=0.28)
    metal_dark = make_mat("MetalDark", (0.35, 0.32, 0.28), metallic=0.7, roughness=0.4)
    gold = make_mat("Gold", (0.95, 0.78, 0.25), metallic=0.9, roughness=0.22)
    gem = make_mat("Gem", (0.15, 0.55, 0.85), metallic=0.1, roughness=0.15, emission=(0.2, 0.5, 0.9, 0.3))

    # Body
    body = add_box("ChestBody", (1.6, 1.0, 0.9), (0, 0, 0.45), mat=wood)
    # Lid (slightly open)
    lid = add_box("ChestLid", (1.65, 1.05, 0.28), (0, -0.05, 1.05), rotation=(math.radians(-28), 0, 0), mat=wood_dark)
    # Lid top trim
    add_box("LidTrim", (1.7, 1.1, 0.08), (0, -0.12, 1.18), rotation=(math.radians(-28), 0, 0), mat=metal)

    # Metal bands
    for i, x in enumerate((-0.55, 0.0, 0.55)):
        add_box(f"BandFront{i}", (0.12, 1.02, 0.92), (x, 0, 0.45), mat=metal)
        add_box(f"BandTop{i}", (0.12, 1.08, 0.1), (x, -0.08, 1.12), rotation=(math.radians(-28), 0, 0), mat=metal)

    # Latch
    add_box("LatchPlate", (0.35, 0.08, 0.28), (0, -0.52, 0.55), mat=metal_dark)
    add_box("LatchHook", (0.18, 0.1, 0.12), (0, -0.55, 0.72), mat=gold)
    # Lock gem
    add_uv_sphere("LockGem", 0.07, (0, -0.58, 0.55), mat=gem, segments=12, rings=6)

    # Corner feet
    for sx, sy in ((-0.7, -0.4), (0.7, -0.4), (-0.7, 0.4), (0.7, 0.4)):
        add_box(f"Foot_{sx}_{sy}", (0.18, 0.18, 0.12), (sx, sy, 0.06), mat=metal_dark)

    # Coins spilling out (simple cylinders)
    for i, (cx, cy, cz, rz) in enumerate([
        (0.15, -0.35, 0.95, 0.3),
        (-0.1, -0.4, 0.92, -0.2),
        (0.05, -0.28, 1.0, 0.5),
        (0.25, -0.22, 0.88, -0.4),
        (-0.2, -0.25, 0.9, 0.1),
    ]):
        add_cylinder(f"Coin{i}", 0.08, 0.02, (cx, cy, cz), rotation=(math.radians(90), 0, rz), mat=gold, vertices=12)

    # Frame camera a bit tighter on chest
    cam = bpy.data.objects.get("ShowcaseCam")
    if cam:
        cam.location = (2.8, -3.2, 1.9)
        cam.rotation_euler = (math.radians(72), 0, math.radians(38))
        cam.data.lens = 55

    out = os.path.join(OUT_DIR, "3d_prop_treasure_chest.png")
    configure_render(out, 1280, 1280)
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {out}")
    return out


def build_hero_bust():
    clear_scene()
    setup_studio(bg_color=(0.90, 0.91, 0.94, 1.0))

    skin = make_mat("Skin", (0.86, 0.68, 0.55), roughness=0.5)
    hair = make_mat("Hair", (0.12, 0.08, 0.06), roughness=0.65)
    cloth = make_mat("Cloth", (0.18, 0.32, 0.55), roughness=0.55)
    cloth_accent = make_mat("ClothAccent", (0.75, 0.55, 0.18), roughness=0.4)
    armor = make_mat("Armor", (0.55, 0.58, 0.62), metallic=0.75, roughness=0.32)
    leather = make_mat("Leather", (0.35, 0.20, 0.10), roughness=0.6)
    eye_w = make_mat("EyeWhite", (0.95, 0.95, 0.96), roughness=0.3)
    eye_i = make_mat("Iris", (0.25, 0.45, 0.75), roughness=0.2)
    belt = make_mat("Belt", (0.22, 0.14, 0.08), roughness=0.55)

    # Torso (slightly tapered via scale after cube)
    torso = add_box("Torso", (0.85, 0.45, 1.0), (0, 0, 1.1), mat=cloth)
    # Shoulders / armor plates
    add_box("ShoulderL", (0.35, 0.4, 0.28), (-0.55, 0, 1.55), mat=armor)
    add_box("ShoulderR", (0.35, 0.4, 0.28), (0.55, 0, 1.55), mat=armor)
    # Chest plate
    add_box("ChestPlate", (0.7, 0.38, 0.55), (0, -0.05, 1.25), mat=armor)
    # Belt
    add_box("Belt", (0.88, 0.48, 0.12), (0, 0, 0.65), mat=belt)
    add_box("Buckle", (0.18, 0.1, 0.14), (0, -0.26, 0.65), mat=cloth_accent)

    # Arms (upper)
    add_cylinder("ArmL", 0.12, 0.7, (-0.75, 0, 1.15), rotation=(0, math.radians(15), 0), mat=leather, vertices=10)
    add_cylinder("ArmR", 0.12, 0.7, (0.75, 0, 1.15), rotation=(0, math.radians(-15), 0), mat=leather, vertices=10)

    # Neck
    add_cylinder("Neck", 0.12, 0.22, (0, 0, 1.7), mat=skin, vertices=12)

    # Head
    head = add_uv_sphere("Head", 0.32, (0, 0, 2.05), mat=skin, segments=16, rings=10)
    # Hair cap
    add_uv_sphere("Hair", 0.34, (0, -0.02, 2.12), mat=hair, segments=14, rings=8)
    # Flatten front of hair slightly by adding bangs box
    add_box("Bangs", (0.5, 0.18, 0.12), (0, -0.28, 2.18), mat=hair)

    # Eyes
    add_uv_sphere("EyeWL", 0.055, (-0.1, -0.28, 2.08), mat=eye_w, segments=10, rings=6)
    add_uv_sphere("EyeWR", 0.055, (0.1, -0.28, 2.08), mat=eye_w, segments=10, rings=6)
    add_uv_sphere("IrisL", 0.03, (-0.1, -0.32, 2.08), mat=eye_i, segments=8, rings=4)
    add_uv_sphere("IrisR", 0.03, (0.1, -0.32, 2.08), mat=eye_i, segments=8, rings=4)

    # Nose
    add_box("Nose", (0.06, 0.08, 0.08), (0, -0.32, 2.0), mat=skin)

    # Mouth (simple)
    add_box("Mouth", (0.12, 0.03, 0.03), (0, -0.31, 1.9), mat=make_mat("Lip", (0.7, 0.35, 0.35), roughness=0.4))

    # Cape / scarf accent
    add_box("Scarf", (0.7, 0.25, 0.08), (0, -0.15, 1.62), mat=cloth_accent)
    add_box("Cape", (0.9, 0.15, 0.9), (0, 0.28, 1.15), mat=make_mat("Cape", (0.45, 0.12, 0.12), roughness=0.6))

    # Simple sword hilt peeking (prop flavor)
    add_cylinder("Hilt", 0.04, 0.35, (0.55, -0.15, 0.85), rotation=(math.radians(90), 0, math.radians(20)), mat=armor, vertices=10)
    add_box("Guard", (0.18, 0.04, 0.06), (0.55, -0.32, 0.85), rotation=(0, 0, math.radians(20)), mat=cloth_accent)

    # Pedestal / bust base
    base = add_cylinder("Base", 0.55, 0.12, (0, 0, 0.06), mat=make_mat("Base", (0.25, 0.26, 0.28), metallic=0.3, roughness=0.5), vertices=24)
    add_cylinder("BaseTop", 0.4, 0.08, (0, 0, 0.14), mat=make_mat("BaseTop", (0.4, 0.42, 0.45), metallic=0.4, roughness=0.4), vertices=20)

    # Legs hint (short for bust-ish full body)
    add_box("Hip", (0.7, 0.4, 0.35), (0, 0, 0.4), mat=leather)
    add_cylinder("LegL", 0.13, 0.35, (-0.22, 0, 0.22), mat=leather, vertices=10)
    add_cylinder("LegR", 0.13, 0.35, (0.22, 0, 0.22), mat=leather, vertices=10)

    cam = bpy.data.objects.get("ShowcaseCam")
    if cam:
        cam.location = (2.6, -3.4, 2.0)
        cam.rotation_euler = (math.radians(75), 0, math.radians(35))
        cam.data.lens = 50

    out = os.path.join(OUT_DIR, "3d_character_hero_bust.png")
    configure_render(out, 1280, 1280)
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {out}")
    return out


def main():
    global ENGINE
    print("=== Fiverr preview renders start ===")
    print(f"Blender {bpy.app.version_string}")
    # Ensure EEVEE exists; else Cycles
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
        ENGINE = "BLENDER_EEVEE"
    except Exception:
        try:
            bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
            ENGINE = "BLENDER_EEVEE_NEXT"
        except Exception:
            ENGINE = "CYCLES"
            bpy.context.scene.render.engine = "CYCLES"
            bpy.context.scene.cycles.samples = 64
            bpy.context.scene.cycles.use_denoising = True
    print(f"Using engine: {ENGINE}")

    p1 = build_treasure_chest()
    p2 = build_hero_bust()
    print("=== DONE ===")
    print(p1)
    print(p2)


if __name__ == "__main__":
    main()
