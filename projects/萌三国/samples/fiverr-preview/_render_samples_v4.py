"""
Fiverr preview v4b — fix framing + pattern readability + warm lantern.
Blender 5.x EEVEE. Pure procedural bpy.
"""
import bpy
import math
import os
from mathutils import Vector

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
    # Kill accidental emission if none requested
    if emission is None and "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_blade_gold(name):
    """Semi-matte gold with strong readable chased relief — NO emission."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")

    tex = nodes.new("ShaderNodeTexCoord")
    map1 = nodes.new("ShaderNodeMapping")
    map1.inputs["Scale"].default_value = (5.0, 28.0, 5.0)

    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 2.8
    wave.inputs["Distortion"].default_value = 5.5
    wave.inputs["Detail"].default_value = 5.0

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.5
    noise.inputs["Detail"].default_value = 14.0
    noise.inputs["Roughness"].default_value = 0.42
    if "Distortion" in noise.inputs:
        noise.inputs["Distortion"].default_value = 0.7

    voro = nodes.new("ShaderNodeTexVoronoi")
    voro.feature = "DISTANCE_TO_EDGE"
    voro.inputs["Scale"].default_value = 9.0

    mix1 = nodes.new("ShaderNodeMix")
    mix1.data_type = "FLOAT"
    mix1.inputs["Factor"].default_value = 0.55
    mix2 = nodes.new("ShaderNodeMix")
    mix2.data_type = "FLOAT"
    mix2.inputs["Factor"].default_value = 0.45

    # High contrast etched vs raised gold
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    # Use EASE but with wider separation for readable pattern
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.28, 0.15, 0.03, 1)  # deep etched
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (0.78, 0.55, 0.12, 1)  # raised gold (avoid white clip)
    mid = ramp.color_ramp.elements.new(0.48)
    mid.color = (0.70, 0.48, 0.10, 1)

    r_ramp = nodes.new("ShaderNodeValToRGB")
    r_ramp.color_ramp.elements[0].position = 0.3
    r_ramp.color_ramp.elements[0].color = (0.55, 0.55, 0.55, 1)
    r_ramp.color_ramp.elements[1].position = 0.7
    r_ramp.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1)

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.8
    bump.inputs["Distance"].default_value = 0.12

    links.new(tex.outputs["Object"], map1.inputs["Vector"])
    links.new(map1.outputs["Vector"], wave.inputs["Vector"])
    links.new(map1.outputs["Vector"], noise.inputs["Vector"])
    links.new(map1.outputs["Vector"], voro.inputs["Vector"])

    a_key = "A" if "A" in mix1.inputs else "Float A"
    b_key = "B" if "B" in mix1.inputs else "Float B"

    def sock(node, preferred):
        return node.outputs[preferred] if preferred in node.outputs else node.outputs[0]

    links.new(sock(wave, "Fac"), mix1.inputs[a_key] if a_key in mix1.inputs else mix1.inputs[2])
    links.new(sock(noise, "Fac"), mix1.inputs[b_key] if b_key in mix1.inputs else mix1.inputs[3])
    m1 = sock(mix1, "Result")
    links.new(m1, mix2.inputs[a_key] if a_key in mix2.inputs else mix2.inputs[2])
    v_out = "Distance" if "Distance" in voro.outputs else (
        "Distance to Edge" if "Distance to Edge" in voro.outputs else voro.outputs[0].name)
    links.new(voro.outputs[v_out] if v_out in voro.outputs else voro.outputs[0],
              mix2.inputs[b_key] if b_key in mix2.inputs else mix2.inputs[3])
    fac = sock(mix2, "Result")

    links.new(fac, ramp.inputs["Fac"])
    links.new(fac, r_ramp.inputs["Fac"])
    links.new(fac, bump.inputs["Height"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(r_ramp.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    bsdf.inputs["Metallic"].default_value = 0.92
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.45
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_paper_sss(name, base=(0.98, 0.78, 0.42), emit_str=6.0):
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
    noise.inputs["Detail"].default_value = 8.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (base[0] * 0.65, base[1] * 0.55, base[2] * 0.35, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (*base, 1)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.2

    links.new(tex.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Metallic"].default_value = 0.0
    for key in ("Transmission Weight", "Transmission"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.55
            break
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.33
    for key in ("Subsurface Weight", "Subsurface"):
        if key in bsdf.inputs:
            try:
                bsdf.inputs[key].default_value = 0.4
            except Exception:
                pass
            break
    if "Subsurface Radius" in bsdf.inputs:
        try:
            bsdf.inputs["Subsurface Radius"].default_value = (1.2, 0.35, 0.1)
        except Exception:
            pass
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.85
        for attr, val in (("blend_method", "HASHED"),
                          ("surface_render_method", "DITHERED")):
            if hasattr(mat, attr):
                try:
                    setattr(mat, attr, val)
                except Exception:
                    pass
    # Strong WARM yellow emission
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.62, 0.18, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_bamboo(name, color=(0.50, 0.34, 0.14), rough=0.6):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 36.0
    noise.inputs["Detail"].default_value = 6.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (color[0] * 0.65, color[1] * 0.65, color[2] * 0.65, 1)
    ramp.color_ramp.elements[1].color = (*color, 1)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    links.new(tex.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0.03
    bsdf.inputs["Roughness"].default_value = rough
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
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


def add_cone(name, radius1, depth, location, rotation=(0, 0, 0), mat=None, vertices=32, radius2=0.0):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth,
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


def setup_world(c0, c1, strength=0.4):
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    tex = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.1
    ramp.color_ramp.elements[0].color = (*c0[:3], 1)
    ramp.color_ramp.elements[1].position = 0.9
    ramp.color_ramp.elements[1].color = (*c1[:3], 1)
    links.new(tex.outputs["Generated"], sep.inputs["Vector"])
    links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def setup_camera(location, look_at, lens=50, fstop=2.4):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = "Cam"
    direction = Vector(look_at) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    try:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = direction.length
        cam.data.dof.aperture_fstop = fstop
    except Exception:
        pass
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


def configure_render(filepath, res_x=RES, res_y=RES):
    scene = bpy.context.scene
    try:
        scene.render.engine = ENGINE
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "CYCLES"
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.filepath = filepath
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    eevee = getattr(scene, "eevee", None)
    if eevee:
        for attr, val in (
            ("taa_render_samples", 128),
            ("use_raytracing", True),
            ("use_shadows", True),
            ("use_volumetric_lights", True),
            ("use_soft_shadows", True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.view_transform = "Filmic"
        except Exception:
            pass


def render_to(filepath, res_x=RES, res_y=RES):
    configure_render(filepath, res_x, res_y)
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED: {filepath}")


def build_zhanlong_sword():
    clear_scene()
    # Deep purple night
    setup_world((0.02, 0.01, 0.05), (0.16, 0.05, 0.18), strength=0.5)

    gold_face = make_blade_gold("GoldFace")
    gold_bright = make_mat("GoldBright", (0.85, 0.62, 0.16), metallic=0.92, roughness=0.32)
    gold_dark = make_mat("GoldDark", (0.40, 0.24, 0.06), metallic=0.9, roughness=0.45)
    bronze = make_mat("Bronze", (0.38, 0.24, 0.08), metallic=0.88, roughness=0.40)
    jade = make_mat("Jade", (0.10, 0.45, 0.26), metallic=0.1, roughness=0.3,
                    emission=(0.06, 0.32, 0.18, 0.25))
    wrap = make_mat("HiltWrap", (0.18, 0.05, 0.04), metallic=0.0, roughness=0.82)
    stone = make_mat("Pedestal", (0.07, 0.05, 0.11), metallic=0.04, roughness=0.65)

    # NO parent empty — keep transforms simple and predictable
    # Blade tall, continuous from guard to tip
    # Wider blade face so patterns read; golden yellow
    blade = add_box("Blade", (0.095, 0.016, 1.85), (0, 0, 1.20), mat=gold_face)
    tip = add_cone("Tip", 0.095, 0.28, (0, 0, 2.26), mat=gold_face, vertices=4)
    tip.scale = (1.0, 0.22, 1.0)
    bpy.ops.object.transform_apply(scale=True)

    # Spine — slightly brighter gold, not white
    ridge = add_box("Ridge", (0.012, 0.018, 1.60), (0, 0, 1.15), mat=bronze)

    # Bevel flats
    add_box("BevelL", (0.082, 0.005, 1.75), (0, 0.011, 1.16), mat=gold_dark)
    add_box("BevelR", (0.082, 0.005, 1.75), (0, -0.011, 1.16), mat=gold_dark)

    # Fuller recesses (darker = etched look)
    add_box("FullerA", (0.040, 0.003, 1.45), (0, 0.017, 1.12), mat=gold_dark)
    add_box("FullerB", (0.040, 0.003, 1.45), (0, -0.017, 1.12), mat=gold_dark)

    # Edge lines — use dark gold so they read as engraving not LEDs
    for side in (0.017, -0.017):
        add_box("EdgeA", (0.003, 0.003, 1.50), (0.058, side, 1.12), mat=gold_dark)
        add_box("EdgeB", (0.003, 0.003, 1.50), (-0.058, side, 1.12), mat=gold_dark)

    # Recessed engraving only (pushed into face) — readable geometric dragon panels, no raised LEDs
    for i, z in enumerate((0.50, 0.68, 0.86, 1.04, 1.22, 1.40, 1.58, 1.76, 1.94)):
        for side, sign in ((0.014, 1), (-0.014, -1)):
            # Deep cartouche sunk into blade face
            add_box(f"Cart{i}_{sign}", (0.060, 0.004, 0.13), (0, side, z), mat=gold_dark)
            # Inner geometric "dragon-scale" diamond, also recessed
            add_box(f"Dia{i}_{sign}", (0.028, 0.003, 0.028), (0, side - sign * 0.001, z),
                    rotation=(0, 0, math.radians(45)), mat=bronze)
            # Side ticks
            add_box(f"TickL{i}_{sign}", (0.008, 0.003, 0.05), (-0.038, side, z), mat=bronze)
            add_box(f"TickR{i}_{sign}", (0.008, 0.003, 0.05), (0.038, side, z), mat=bronze)

    # Cloud motif near tip — recessed dark
    for i, (z, sx) in enumerate(((2.08, 0.060), (2.02, 0.075), (1.96, 0.055))):
        for side in (0.014, -0.014):
            add_box(f"Cloud{i}_{side}", (sx, 0.003, 0.028), (0, side, z), mat=gold_dark)

    # Cross bands recessed
    for i, z in enumerate((0.59, 0.77, 0.95, 1.13, 1.31, 1.49, 1.67, 1.85)):
        add_box(f"Band{i}", (0.090, 0.003, 0.018), (0, 0.012, z), mat=gold_dark)
        add_box(f"BandB{i}", (0.090, 0.003, 0.018), (0, -0.012, z), mat=gold_dark)

    # Guard — continuous with blade (z=0.24 touches blade bottom ~0.275)
    guard = add_box("Guard", (0.32, 0.07, 0.045), (0, 0, 0.25), mat=bronze)
    bevel_obj(guard, 0.008, 3)
    add_box("GuardEndL", (0.045, 0.08, 0.09), (0.16, 0, 0.25), mat=gold_dark)
    add_box("GuardEndR", (0.045, 0.08, 0.09), (-0.16, 0, 0.25), mat=gold_dark)
    add_uv_sphere("GuardGem", 0.032, (0, 0.048, 0.25), mat=jade, segments=16, ring_count=10)

    # Bridge collar so no gap between guard and blade
    add_cylinder("Collar", 0.04, 0.04, (0, 0, 0.30), mat=gold_bright, vertices=16)

    # Grip — higher segment count so not chunky low-poly
    grip = add_cylinder("Grip", 0.032, 0.36, (0, 0, 0.02), mat=wrap, vertices=32)
    set_smooth(grip)
    for i, z in enumerate((-0.10, 0.02, 0.14)):
        add_torus(f"GripRing{i}", 0.036, 0.006, (0, 0, z), mat=gold_bright)

    pommel = add_uv_sphere("Pommel", 0.06, (0, 0, -0.20), mat=bronze, segments=24, ring_count=12)
    pommel.scale = (1.0, 1.0, 0.72)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(pommel)
    add_cone("PommelTip", 0.022, 0.07, (0, 0, -0.29),
             rotation=(math.radians(180), 0, 0), mat=gold_bright, vertices=8)

    for o in (blade, tip, ridge, guard):
        set_smooth(o)

    # Pedestal in frame
    add_cylinder("Stand", 0.62, 0.11, (0, 0, -0.48), mat=stone, vertices=48)
    add_torus("StandRing", 0.48, 0.018, (0, 0, -0.41), mat=bronze)
    add_cylinder("Ground", 2.2, 0.025, (0, 0, -0.56), mat=make_mat(
        "Ground", (0.035, 0.02, 0.06), roughness=0.95), vertices=64)
    add_cylinder("GlowDisc", 0.7, 0.008, (0, 0, -0.54), mat=make_mat(
        "GlowDisc", (0.3, 0.12, 0.04), emission=(1.0, 0.45, 0.12, 0.7), roughness=0.85), vertices=48)

    # Slight whole-sword tilt via rotating all? Use empty only for camera composition —
    # instead rotate camera around. Apply small Y rotation to blade assembly via empty:
    # Actually rotate scene objects slightly by rotating camera azimuth more.

    # HARD key front-side (small size = hard) to reveal patterns
    add_area_light("KeyHard", (2.0, -0.9, 1.5), 380, 0.7, color=(1.0, 0.85, 0.60),
                   rotation=(math.radians(58), math.radians(12), math.radians(30)))
    # Cool weak fill
    add_area_light("CoolFill", (-1.0, -2.4, 1.0), 40, 3.0, color=(0.5, 0.58, 1.0),
                   rotation=(math.radians(70), 0, 0))
    # Thin golden rim
    add_area_light("GoldRim", (-1.8, 1.5, 1.8), 180, 0.35, color=(1.0, 0.75, 0.3),
                   rotation=(math.radians(48), math.radians(-28), math.radians(-40)))

    # CAMERA FIX: 3/4 front, look at MID-BLADE, pull back so blade ~60% frame
    # Blade spans z≈0.28..2.38 center ~1.2; include tip and some hilt/pedestal
    setup_camera((2.8, -2.2, 1.45), (0.0, 0.0, 1.15), lens=45, fstop=3.5)

    out = os.path.join(OUT_DIR, "3d_v4_zhanlong_sword.png")
    render_to(out, 1408, 1536)
    return out


def build_kongming_lantern():
    clear_scene()
    # Night sky deep blue → purple
    setup_world((0.008, 0.01, 0.04), (0.08, 0.04, 0.16), strength=0.32)

    bamboo = make_bamboo("Bamboo", (0.52, 0.35, 0.14), rough=0.58)
    bamboo_dark = make_bamboo("BambooDark", (0.32, 0.20, 0.08), rough=0.65)
    paper = make_paper_sss("PaperGlow", base=(0.92, 0.65, 0.25), emit_str=2.2)
    paper_inner = make_paper_sss("PaperInner", base=(0.90, 0.42, 0.12), emit_str=1.4)
    cord = make_mat("Cord", (0.40, 0.26, 0.12), roughness=0.85)
    flame_mat = make_mat("Flame", (1.0, 0.85, 0.4),
                         emission=(1.0, 0.65, 0.2, 16.0), roughness=0.25)
    ember = make_mat("Ember", (1.0, 0.48, 0.1), emission=(1.0, 0.4, 0.06, 9.0))
    tassel_m = make_mat("TasselRed", (0.85, 0.08, 0.05), roughness=0.65,
                         emission=(0.6, 0.05, 0.02, 0.35))
    fog_m = make_mat("Fog", (0.10, 0.08, 0.18), roughness=1.0,
                     emission=(0.1, 0.06, 0.16, 0.2), alpha=0.4)

    # Bulging paper shell
    outer = add_uv_sphere("PaperOuter", 0.60, (0, 0, 1.25), mat=paper, segments=64, ring_count=36)
    outer.scale = (0.80, 0.80, 1.30)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(outer)

    inner = add_uv_sphere("PaperInner", 0.54, (0, 0, 1.25), mat=paper_inner, segments=48, ring_count=28)
    inner.scale = (0.80, 0.80, 1.27)
    bpy.ops.object.transform_apply(scale=True)
    set_smooth(inner)

    # Bamboo top ring
    top_ring = add_torus("TopRing", 0.32, 0.018, (0, 0, 1.90), mat=bamboo)
    set_smooth(top_ring)
    mid_ring = add_torus("MidRing", 0.50, 0.014, (0, 0, 1.10), mat=bamboo_dark)
    base_ring = add_torus("BaseRing", 0.42, 0.026, (0, 0, 0.50), mat=bamboo)
    set_smooth(base_ring)

    # 8 thick vertical ribs for clear occlusion shadows on paper
    for i in range(8):
        ang = i * (2 * math.pi / 8)
        r = 0.47
        x, y = math.cos(ang) * r, math.sin(ang) * r
        rib = add_box(f"Rib{i}", (0.016, 0.016, 1.28), (x, y, 1.22), mat=bamboo)
        rib.rotation_euler = (0, 0, ang)

    add_box("Brace1", (0.80, 0.014, 0.014), (0, 0, 0.50), mat=bamboo)
    add_box("Brace2", (0.014, 0.80, 0.014), (0, 0, 0.50), mat=bamboo)
    add_box("Burner", (0.16, 0.16, 0.03), (0, 0, 0.46), mat=bamboo_dark)

    flame = add_cone("Flame", 0.06, 0.18, (0, 0, 0.58), mat=flame_mat, vertices=12)
    set_smooth(flame)
    flame_core = add_uv_sphere("FlameCore", 0.04, (0, 0, 0.54), mat=ember, segments=12, ring_count=8)
    set_smooth(flame_core)

    # Lantern = ONLY primary light (warm)
    add_point_light("InnerPrimary", (0, 0, 1.20), 160, color=(1.0, 0.50, 0.14), radius=0.5)
    add_point_light("FlamePrimary", (0, 0, 0.60), 90, color=(1.0, 0.45, 0.10), radius=0.2)
    # Tiny cool ambient only
    add_area_light("NightAmbient", (-2.2, 1.6, 3.0), 12, 5.0, color=(0.3, 0.35, 0.7),
                   rotation=(math.radians(35), math.radians(-10), math.radians(-20)))

    # Cords + tassels — longer so visible in low-angle shot
    for i in range(4):
        ang = i * (math.pi / 2) + math.pi / 4
        x0, y0 = math.cos(ang) * 0.38, math.sin(ang) * 0.38
        cord_obj = add_cylinder(f"Cord{i}", 0.005, 0.45,
                                (x0 * 0.4, y0 * 0.4, 0.26), mat=cord, vertices=8)
        direction = Vector((0, 0, 0.08)) - Vector((x0, y0, 0.50))
        cord_obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()

    add_uv_sphere("Knot", 0.038, (0, 0, 0.06), mat=cord, segments=12, ring_count=8)
    add_cone("Tassel", 0.055, 0.22, (0, 0, -0.08),
             rotation=(math.radians(180), 0, 0), mat=tassel_m, vertices=10)
    for i, ang in enumerate((0.0, 2.09, 4.18)):
        tx, ty = math.cos(ang) * 0.05, math.sin(ang) * 0.05
        add_cone(f"TasselStrand{i}", 0.022, 0.18, (tx, ty, -0.14),
                 rotation=(math.radians(180), 0, 0), mat=tassel_m, vertices=8)
    # Extra hanging strands for readable tassels
    for i, ang in enumerate((1.0, 3.1, 5.2)):
        tx, ty = math.cos(ang) * 0.03, math.sin(ang) * 0.03
        add_cylinder(f"TasselCord{i}", 0.004, 0.16, (tx, ty, -0.05), mat=tassel_m, vertices=6)

    # Light fog disc
    add_cylinder("Fog", 2.6, 0.05, (0, 0, -0.15), mat=fog_m, vertices=64)

    # Few warm sparks
    for i, pos in enumerate((
        (0.2, 0.1, 0.8), (-0.18, -0.12, 1.0), (0.1, -0.2, 1.4),
        (-0.25, 0.15, 1.6), (0.15, 0.22, 0.7),
    )):
        add_uv_sphere(f"Spark{i}", 0.009, pos, mat=ember, segments=6, ring_count=4)

    # Camera: low 3/4, full lantern + tassels, lantern ~half frame
    setup_camera((2.05, -2.45, 0.70), (0.0, 0.0, 1.05), lens=42, fstop=3.0)

    out = os.path.join(OUT_DIR, "3d_v4_kongming_lantern.png")
    render_to(out, 1408, 1536)
    return out


def main():
    print("=== v4b Zhanlong Sword ===")
    p1 = build_zhanlong_sword()
    print("=== v4b Kongming Lantern ===")
    p2 = build_kongming_lantern()
    print("DONE")
    print(p1)
    print(p2)


if __name__ == "__main__":
    main()
