"""
Fiverr preview v3 — 斩龙剑 (Zhanlong Sword) + 孔明灯 (Kongming Lantern).
Indie game-asset hero stills. Pure procedural bpy. Blender 5.x EEVEE.
"""
import bpy
import math
import os
from mathutils import Vector, Euler, Matrix

OUT_DIR = "/Users/user/Documents/Codex/youxi/meng/samples/fiverr-preview"
os.makedirs(OUT_DIR, exist_ok=True)
ENGINE = "BLENDER_EEVEE"
RES = 1408


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.curves, bpy.data.objects,
                 bpy.data.worlds):
        for block in list(coll):
            if getattr(block, "users", 0) == 0:
                try:
                    coll.remove(block)
                except Exception:
                    pass


def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def make_mat(name, color, metallic=0.0, roughness=0.45, emission=None,
             transmission=0.0, ior=1.45, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    for key in ("Transmission Weight", "Transmission"):
        if key in bsdf.inputs and transmission > 0:
            bsdf.inputs[key].default_value = transmission
            break
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    if alpha < 1.0 and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr, val in (("blend_method", "HASHED"),
                          ("surface_render_method", "DITHERED")):
            if hasattr(mat, attr):
                try:
                    setattr(mat, attr, val)
                except Exception:
                    pass
    if emission is not None:
        ec = emission[:3]
        strength = emission[3] if len(emission) > 3 else 1.0
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*ec, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*ec, 1.0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_engraved_gold(name):
    """Golden metal with visible etched cloud/dragon pattern (纹路)."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")

    tex = nodes.new("ShaderNodeTexCoord")
    map1 = nodes.new("ShaderNodeMapping")
    map1.inputs["Scale"].default_value = (6.0, 18.0, 6.0)

    # Wave for longitudinal engraved lines
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 4.5
    wave.inputs["Distortion"].default_value = 2.8
    wave.inputs["Detail"].default_value = 3.0
    if "Detail Scale" in wave.inputs:
        wave.inputs["Detail Scale"].default_value = 1.2

    # Noise for organic cloud / damascus swirls
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 10.0
    noise.inputs["Roughness"].default_value = 0.55
    if "Distortion" in noise.inputs:
        noise.inputs["Distortion"].default_value = 0.35

    # Voronoi for scale/dragon-skin motif accents
    voro = nodes.new("ShaderNodeTexVoronoi")
    voro.feature = "DISTANCE_TO_EDGE"
    voro.inputs["Scale"].default_value = 14.0

    # Mix pattern factors
    mix1 = nodes.new("ShaderNodeMix")
    mix1.data_type = "FLOAT"
    mix1.inputs["Factor"].default_value = 0.45

    mix2 = nodes.new("ShaderNodeMix")
    mix2.data_type = "FLOAT"
    mix2.inputs["Factor"].default_value = 0.35

    # Color ramp: deep engraved gold vs raised bright gold
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (0.55, 0.32, 0.05, 1)  # dark etched gold
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (1.0, 0.82, 0.28, 1)  # bright gold
    mid = ramp.color_ramp.elements.new(0.5)
    mid.color = (0.92, 0.68, 0.12, 1)

    # Roughness variation: grooves darker/rougher
    r_ramp = nodes.new("ShaderNodeValToRGB")
    r_ramp.color_ramp.elements[0].position = 0.3
    r_ramp.color_ramp.elements[0].color = (0.55, 0.55, 0.55, 1)
    r_ramp.color_ramp.elements[1].position = 0.75
    r_ramp.color_ramp.elements[1].color = (0.18, 0.18, 0.18, 1)

    # Bump for engraved depth
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    bump.inputs["Distance"].default_value = 0.04

    links.new(tex.outputs["Object"], map1.inputs["Vector"])
    links.new(map1.outputs["Vector"], wave.inputs["Vector"])
    links.new(map1.outputs["Vector"], noise.inputs["Vector"])
    links.new(map1.outputs["Vector"], voro.inputs["Vector"])

    # Mix wave + noise
    # Blender 4+/5 Mix node: Factor, A, B for FLOAT
    a_key = "A" if "A" in mix1.inputs else "Float A"
    b_key = "B" if "B" in mix1.inputs else "Float B"
    # Wave Fac / Noise Fac naming
    w_out = "Fac" if "Fac" in wave.outputs else wave.outputs[0].name
    n_out = "Fac" if "Fac" in noise.outputs else noise.outputs[0].name
    v_out = "Distance" if "Distance" in voro.outputs else (
        "Distance to Edge" if "Distance to Edge" in voro.outputs else voro.outputs[0].name)

    links.new(wave.outputs[w_out] if w_out in wave.outputs else wave.outputs[0],
              mix1.inputs[a_key] if a_key in mix1.inputs else mix1.inputs[2])
    links.new(noise.outputs[n_out] if n_out in noise.outputs else noise.outputs[0],
              mix1.inputs[b_key] if b_key in mix1.inputs else mix1.inputs[3])

    # mix1 result -> mix2 A, voronoi -> mix2 B
    mix1_out = "Result" if "Result" in mix1.outputs else mix1.outputs[0].name
    links.new(mix1.outputs[mix1_out] if mix1_out in mix1.outputs else mix1.outputs[0],
              mix2.inputs[a_key] if a_key in mix2.inputs else mix2.inputs[2])
    links.new(voro.outputs[v_out] if v_out in voro.outputs else voro.outputs[0],
              mix2.inputs[b_key] if b_key in mix2.inputs else mix2.inputs[3])

    mix2_out = "Result" if "Result" in mix2.outputs else mix2.outputs[0].name
    fac_sock = mix2.outputs[mix2_out] if mix2_out in mix2.outputs else mix2.outputs[0]

    links.new(fac_sock, ramp.inputs["Fac"])
    links.new(fac_sock, r_ramp.inputs["Fac"])
    links.new(fac_sock, bump.inputs["Height"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(r_ramp.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    bsdf.inputs["Metallic"].default_value = 0.95
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.55
    # Slight warm emission so gold reads rich
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.75, 0.2, 1)
        bsdf.inputs["Emission Strength"].default_value = 0.08

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_paper_glow(name, base=(0.95, 0.78, 0.45), emit_str=2.8):
    """Translucent paper with warm inner glow for Kongming lantern."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")

    tex = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 28.0
    noise.inputs["Detail"].default_value = 6.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (base[0] * 0.75, base[1] * 0.7, base[2] * 0.55, 1)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (*base, 1)

    links.new(tex.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = 0.72
    for key in ("Transmission Weight", "Transmission"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.55
            break
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.35
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.82
        for attr, val in (("blend_method", "HASHED"),
                          ("surface_render_method", "DITHERED")):
            if hasattr(mat, attr):
                try:
                    setattr(mat, attr, val)
                except Exception:
                    pass
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.72, 0.28, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    elif "Emission" in bsdf.inputs:
        bsdf.inputs["Emission"].default_value = (1.0, 0.72, 0.28, 1)

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_box(name, size, location, rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if mat:
        assign_mat(obj, mat)
    return obj


def add_cylinder(name, radius, depth, location, rotation=(0, 0, 0), mat=None, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_cone(name, radius1, depth, location, rotation=(0, 0, 0), mat=None, vertices=32):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=0.0, depth=depth,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_uv_sphere(name, radius, location, mat=None, segments=32, ring_count=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=ring_count, radius=radius, location=location
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_torus(name, major, minor, location, rotation=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def bevel_obj(obj, width=0.01, segments=2):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception:
        pass
    obj.select_set(False)


def set_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)


def setup_world(bg_color, strength=0.35):
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    # Gradient via two colors mixed by Z
    tex = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    # bg_color can be tuple (bottom, top) or single
    if isinstance(bg_color[0], (tuple, list)):
        c0, c1 = bg_color
    else:
        c0 = tuple(max(0, c * 0.45) for c in bg_color[:3])
        c1 = bg_color[:3]
    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[0].color = (*c0[:3], 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (*c1[:3], 1)
    links.new(tex.outputs["Generated"], sep.inputs["Vector"])
    links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def setup_camera(location, look_at, lens=50, ortho=False):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = "Cam"
    direction = Vector(look_at) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = 3.2
    bpy.context.scene.camera = cam
    return cam


def add_area_light(name, location, energy, size, color=(1, 1, 1), rotation=(0, 0, 0)):
    bpy.ops.object.light_add(type="AREA", location=location, rotation=rotation)
    lit = bpy.context.active_object
    lit.name = name
    lit.data.energy = energy
    lit.data.size = size
    lit.data.color = color
    return lit


def add_point_light(name, location, energy, color=(1, 1, 1), radius=0.1):
    bpy.ops.object.light_add(type="POINT", location=location)
    lit = bpy.context.active_object
    lit.name = name
    lit.data.energy = energy
    lit.data.color = color
    if hasattr(lit.data, "shadow_soft_size"):
        lit.data.shadow_soft_size = radius
    return lit


def configure_render(filepath):
    scene = bpy.context.scene
    # Prefer EEVEE; fall back to CYCLES if needed
    try:
        scene.render.engine = ENGINE
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "CYCLES"

    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.filepath = filepath
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False

    # EEVEE quality
    eevee = getattr(scene, "eevee", None)
    if eevee:
        for attr, val in (
            ("taa_render_samples", 64),
            ("use_raytracing", True),
            ("use_shadows", True),
            ("use_volumetric_lights", True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    # Color management
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.view_transform = "Filmic"
        except Exception:
            pass


def render_to(filepath):
    configure_render(filepath)
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED: {filepath}")


# ---------------------------------------------------------------------------
# SUBJECT 1 — 斩龙剑 (straight golden legendary sword with 纹路)
# ---------------------------------------------------------------------------
def build_zhanlong_sword():
    clear_scene()
    # Deep indigo → dusk purple gradient (cool field, warm subject)
    setup_world(
        ((0.03, 0.04, 0.10), (0.22, 0.08, 0.18)),
        strength=0.65,
    )

    gold = make_engraved_gold("GoldEngraved")
    gold_bright = make_mat("GoldBright", (1.0, 0.78, 0.18), metallic=0.95, roughness=0.18)
    gold_dark = make_mat("GoldDark", (0.55, 0.35, 0.08), metallic=0.9, roughness=0.35)
    jade = make_mat("Jade", (0.12, 0.55, 0.32), metallic=0.15, roughness=0.25,
                    emission=(0.1, 0.45, 0.25, 0.4))
    wrap = make_mat("HiltWrap", (0.55, 0.12, 0.08), metallic=0.0, roughness=0.7)
    stone = make_mat("Pedestal", (0.12, 0.10, 0.14), metallic=0.08, roughness=0.55)

    # --- STRAIGHT blade (jian silhouette): flat diamond cross-section ---
    # Main blade body — long, straight, tapering tip
    blade = add_box("Blade", (0.045, 0.012, 1.55), (0, 0, 1.05), mat=gold)
    # Taper tip via scale at top — use a cone tip
    tip = add_cone("Tip", 0.045, 0.22, (0, 0, 1.92),
                   rotation=(0, 0, 0), mat=gold, vertices=4)
    tip.scale = (1.0, 0.28, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    # Ridge / fuller line (raised center ridge) — straight
    ridge = add_box("Ridge", (0.012, 0.016, 1.35), (0, 0, 1.0), mat=gold_bright)
    # Side bevel flats for diamond look
    bevel_l = add_box("BevelL", (0.038, 0.006, 1.48), (0, 0.008, 1.02), mat=gold_dark)
    bevel_r = add_box("BevelR", (0.038, 0.006, 1.48), (0, -0.008, 1.02), mat=gold_dark)

    # === Strong visible 纹路: carved channels + cloud scrolls + dragon-scale diamonds ===
    # Long center fuller channel (recessed dark gold strip)
    fuller = add_box("Fuller", (0.018, 0.004, 1.25), (0, 0.014, 1.0), mat=gold_dark)
    fuller_b = add_box("FullerB", (0.018, 0.004, 1.25), (0, -0.014, 1.0), mat=gold_dark)
    # Parallel etched border lines
    for side in (0.014, -0.014):
        add_box("EdgeLineA", (0.002, 0.003, 1.3), (0.028, side, 1.0), mat=gold_bright)
        add_box("EdgeLineB", (0.002, 0.003, 1.3), (-0.028, side, 1.0), mat=gold_bright)

    # Segmented carved windows / 纹路 panels along blade (readable at still)
    for i, z in enumerate((0.40, 0.58, 0.76, 0.94, 1.12, 1.30, 1.48, 1.66)):
        for side in (0.015, -0.015):
            # Recessed rectangular cartouche
            add_box(f"Cart{i}_{side}", (0.026, 0.0035, 0.10), (0, side, z), mat=gold_dark)
            # Raised cloud-scroll bar inside cartouche
            add_box(f"Scroll{i}_{side}", (0.016, 0.005, 0.055), (0, side * 1.15, z), mat=gold_bright)
            # Diamond / scale motif
            add_box(f"Scale{i}_{side}", (0.012, 0.0055, 0.012), (0, side * 1.25, z),
                    rotation=(0, 0, math.radians(45)), mat=gold_bright)

    # Cloud motif near tip: three overlapping arcs approximated by thin tori segments (boxes)
    for i, (z, sx) in enumerate(((1.78, 0.03), (1.72, 0.038), (1.66, 0.028))):
        for side in (0.015, -0.015):
            add_box(f"Cloud{i}_{side}", (sx, 0.004, 0.02), (0, side, z), mat=gold_bright)

    # Wave / damascus banding across blade width (alternating raised ridges)
    for i, z in enumerate((0.48, 0.66, 0.84, 1.02, 1.20, 1.38, 1.56)):
        add_box(f"Band{i}", (0.040, 0.003, 0.012), (0, 0, z), mat=gold_bright if i % 2 == 0 else gold_dark)

    # Guard — classic straight jian guard (bar + flared ends), gold
    guard = add_box("Guard", (0.28, 0.06, 0.04), (0, 0, 0.22), mat=gold_bright)
    bevel_obj(guard, 0.008, 3)
    guard_end_l = add_box("GuardEndL", (0.04, 0.07, 0.08), (0.14, 0, 0.22), mat=gold)
    guard_end_r = add_box("GuardEndR", (0.04, 0.07, 0.08), (-0.14, 0, 0.22), mat=gold)
    # Dragon-eye gem on guard
    gem = add_uv_sphere("GuardGem", 0.028, (0, 0.04, 0.22), mat=jade, segments=16, ring_count=10)

    # Hilt / grip — straight, wrapped
    grip = add_cylinder("Grip", 0.028, 0.32, (0, 0, 0.02), mat=wrap, vertices=16)
    # Rings on grip
    for i, z in enumerate((-0.08, 0.0, 0.08)):
        ring = add_torus(f"GripRing{i}", 0.032, 0.006, (0, 0, z),
                         rotation=(0, 0, 0), mat=gold_bright)

    # Pommel — golden peony/lotus disc + spike
    pommel = add_uv_sphere("Pommel", 0.055, (0, 0, -0.18), mat=gold, segments=24, ring_count=12)
    pommel.scale = (1.0, 1.0, 0.7)
    bpy.ops.object.transform_apply(scale=True)
    pommel_tip = add_cone("PommelTip", 0.02, 0.06, (0, 0, -0.26),
                          rotation=(math.radians(180), 0, 0), mat=gold_bright, vertices=8)

    # Smooth metals
    for o in (blade, tip, ridge, guard, pommel):
        set_smooth(o)

    # Pedestal / display stand — dark stone with gold inlay ring
    stand = add_cylinder("Stand", 0.55, 0.12, (0, 0, -0.42), mat=stone, vertices=48)
    stand_ring = add_torus("StandRing", 0.42, 0.018, (0, 0, -0.35), mat=gold_bright)
    # Soft ground disc (subtle)
    ground = add_cylinder("Ground", 1.8, 0.02, (0, 0, -0.49), mat=make_mat(
        "Ground", (0.05, 0.04, 0.08), roughness=0.92), vertices=64)
    # Soft warm glow disc under blade tip area for hierarchy
    glow_disc = add_cylinder("GlowDisc", 0.7, 0.008, (0, 0, -0.47), mat=make_mat(
        "GlowDisc", (0.4, 0.2, 0.05), emission=(1.0, 0.55, 0.15, 1.2), roughness=0.8), vertices=48)

    # Floating ember particles (tiny gold spheres) for magic tier feel
    ember = make_mat("Ember", (1.0, 0.6, 0.1), emission=(1.0, 0.55, 0.1, 4.0), roughness=0.4)
    for i, pos in enumerate((
        (0.35, 0.2, 1.4), (-0.4, -0.15, 1.1), (0.25, -0.3, 0.7),
        (-0.3, 0.25, 1.6), (0.45, 0.05, 0.5), (-0.2, -0.35, 1.85),
    )):
        e = add_uv_sphere(f"Ember{i}", 0.012 + (i % 3) * 0.004, pos, mat=ember, segments=8, ring_count=6)

    # Lighting — warm key on gold, cool rim, fill
    add_area_light("Key", (1.6, -1.4, 2.2), 350, 1.8, color=(1.0, 0.88, 0.65),
                   rotation=(math.radians(50), math.radians(20), math.radians(40)))
    add_area_light("Rim", (-1.8, 1.2, 1.8), 220, 1.4, color=(0.45, 0.55, 1.0),
                   rotation=(math.radians(60), math.radians(-25), math.radians(-50)))
    add_area_light("Fill", (0.2, -2.0, 0.8), 80, 2.5, color=(0.7, 0.75, 1.0),
                   rotation=(math.radians(75), 0, 0))
    add_point_light("Accent", (0.3, 0.4, 1.2), 40, color=(1.0, 0.75, 0.3), radius=0.3)

    # Camera — 3/4 hero angle
    setup_camera((1.55, -2.1, 1.35), (0.0, 0.0, 0.7), lens=55)

    out = os.path.join(OUT_DIR, "3d_v3_zhanlong_sword.png")
    render_to(out)
    return out


# ---------------------------------------------------------------------------
# SUBJECT 2 — 孔明灯 (volumetric Chinese sky lantern)
# ---------------------------------------------------------------------------
def build_kongming_lantern():
    clear_scene()
    # Night sky gradient — deep blue → indigo, warm subject
    setup_world(
        ((0.02, 0.03, 0.08), (0.08, 0.10, 0.22)),
        strength=0.4,
    )

    bamboo = make_mat("Bamboo", (0.42, 0.28, 0.10), metallic=0.05, roughness=0.55)
    bamboo_dark = make_mat("BambooDark", (0.28, 0.16, 0.06), metallic=0.05, roughness=0.6)
    paper = make_paper_glow("PaperGlow", base=(0.98, 0.82, 0.48), emit_str=3.2)
    paper_red = make_paper_glow("PaperRed", base=(0.92, 0.35, 0.18), emit_str=2.0)
    cord = make_mat("Cord", (0.35, 0.22, 0.10), roughness=0.8)
    flame_mat = make_mat("Flame", (1.0, 0.85, 0.4),
                         emission=(1.0, 0.7, 0.25, 12.0), roughness=0.3)
    ember = make_mat("Ember", (1.0, 0.45, 0.1), emission=(1.0, 0.4, 0.05, 6.0))
    ground_m = make_mat("NightGround", (0.05, 0.06, 0.1), roughness=0.95)

    # Balloon body — elongated ovoid paper shell with thickness (obvious 3D volume)
    # Outer paper shell
    outer = add_uv_sphere("PaperOuter", 0.55, (0, 0, 1.15), mat=paper, segments=48, ring_count=28)
    outer.scale = (0.85, 0.85, 1.25)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(outer)

    # Slightly smaller inner shell (gives panel thickness sense via second layer)
    inner = add_uv_sphere("PaperInner", 0.50, (0, 0, 1.15), mat=paper_red, segments=32, ring_count=20)
    inner.scale = (0.85, 0.85, 1.22)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(inner)

    # Open bottom ring (bamboo hoop at base of balloon) — thick, readable
    base_ring = add_torus("BaseRing", 0.38, 0.022, (0, 0, 0.52), mat=bamboo)
    set_smooth(base_ring)
    # Second hoop slightly above for structure
    mid_ring = add_torus("MidRing", 0.46, 0.014, (0, 0, 0.95), mat=bamboo_dark)
    top_ring = add_torus("TopRing", 0.28, 0.012, (0, 0, 1.72), mat=bamboo)

    # Vertical bamboo ribs (8) — clear structural volume
    for i in range(8):
        ang = i * (2 * math.pi / 8)
        # Rib as thin elongated box following balloon side
        x = math.cos(ang) * 0.44
        y = math.sin(ang) * 0.44
        rib = add_box(f"Rib{i}", (0.012, 0.012, 1.15), (x, y, 1.15), mat=bamboo)
        # Rotate rib to face outward slightly
        rib.rotation_euler = (0, 0, ang)

    # Cross braces at bottom opening (bamboo X frame for burner)
    brace1 = add_box("Brace1", (0.72, 0.012, 0.012), (0, 0, 0.52), mat=bamboo)
    brace2 = add_box("Brace2", (0.012, 0.72, 0.012), (0, 0, 0.52), mat=bamboo)

    # Fuel cell / burner platform (small square tray)
    burner = add_box("Burner", (0.14, 0.14, 0.025), (0, 0, 0.48), mat=bamboo_dark)
    # Flame — elongated glowing cone + sphere core
    flame = add_cone("Flame", 0.05, 0.14, (0, 0, 0.58), mat=flame_mat, vertices=12)
    set_smooth(flame)
    flame_core = add_uv_sphere("FlameCore", 0.035, (0, 0, 0.55), mat=ember, segments=12, ring_count=8)
    set_smooth(flame_core)

    # Strong internal point light so glow punches through paper
    add_point_light("InnerGlow", (0, 0, 1.1), 180, color=(1.0, 0.65, 0.25), radius=0.25)
    add_point_light("FlameLight", (0, 0, 0.6), 90, color=(1.0, 0.55, 0.15), radius=0.15)

    # Hanging cords from base ring to a lower tassel knot
    for i in range(4):
        ang = i * (math.pi / 2) + math.pi / 4
        x0, y0 = math.cos(ang) * 0.35, math.sin(ang) * 0.35
        cord_obj = add_cylinder(f"Cord{i}", 0.004, 0.35,
                                (x0 * 0.5, y0 * 0.5, 0.32), mat=cord, vertices=8)
        # tilt cord inward toward center-bottom
        direction = Vector((0, 0, 0.15)) - Vector((x0, y0, 0.5))
        cord_obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()

    # Tassel / weight at bottom
    knot = add_uv_sphere("Knot", 0.03, (0, 0, 0.18), mat=cord, segments=12, ring_count=8)
    tassel = add_cone("Tassel", 0.04, 0.12, (0, 0, 0.08),
                      rotation=(math.radians(180), 0, 0), mat=make_mat(
                          "TasselRed", (0.75, 0.12, 0.08), roughness=0.7), vertices=10)

    # Decorative paper panels accent (slightly raised red diamonds on sides)
    for i in range(4):
        ang = i * (math.pi / 2)
        x, y = math.cos(ang) * 0.52, math.sin(ang) * 0.52
        panel = add_box(f"Panel{i}", (0.08, 0.006, 0.12), (x, y, 1.2), mat=paper_red)
        panel.rotation_euler = (0, 0, ang)

    # Soft ground / mist disc
    ground = add_cylinder("Ground", 2.2, 0.03, (0, 0, -0.05), mat=ground_m, vertices=64)

    # Floating ash/ember sparkles
    for i, pos in enumerate((
        (0.3, 0.2, 0.9), (-0.25, -0.15, 1.4), (0.15, -0.3, 1.7),
        (-0.35, 0.25, 0.7), (0.4, -0.1, 1.3), (-0.1, 0.35, 1.9),
        (0.2, 0.3, 0.55), (-0.4, 0.05, 1.55),
    )):
        s = add_uv_sphere(f"Spark{i}", 0.01 + (i % 3) * 0.003, pos, mat=ember, segments=6, ring_count=4)

    # Distant tiny lantern silhouettes for depth
    far_paper = make_paper_glow("FarPaper", base=(0.9, 0.6, 0.3), emit_str=1.5)
    for i, pos in enumerate(((-1.4, 1.6, 1.8), (1.6, 1.3, 2.1), (-0.8, 2.0, 2.4))):
        far = add_uv_sphere(f"FarLantern{i}", 0.08, pos, mat=far_paper, segments=12, ring_count=8)
        far.scale = (0.7, 0.7, 1.1)
        bpy.ops.object.transform_apply(scale=True)

    # Exterior lighting — cool moonlight rim + soft warm fill
    add_area_light("MoonRim", (-1.5, 1.8, 2.5), 120, 2.0, color=(0.55, 0.65, 1.0),
                   rotation=(math.radians(45), math.radians(-20), math.radians(-30)))
    add_area_light("WarmFill", (1.8, -1.5, 1.2), 60, 2.5, color=(1.0, 0.8, 0.55),
                   rotation=(math.radians(60), math.radians(15), math.radians(40)))
    add_area_light("Top", (0.3, -0.5, 3.2), 40, 1.5, color=(0.7, 0.75, 1.0),
                   rotation=(math.radians(10), 0, 0))

    # Camera — low 3/4 looking up slightly (lantern ascending feel)
    setup_camera((1.7, -1.9, 1.35), (0.0, 0.1, 1.0), lens=50)

    out = os.path.join(OUT_DIR, "3d_v3_kongming_lantern.png")
    render_to(out)
    return out


def main():
    print("=== v3 Zhanlong Sword ===")
    p1 = build_zhanlong_sword()
    print("=== v3 Kongming Lantern ===")
    p2 = build_kongming_lantern()
    print("DONE")
    print(p1)
    print(p2)


if __name__ == "__main__":
    main()
