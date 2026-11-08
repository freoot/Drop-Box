"""
Fiverr preview v2 — mystic lantern + wanderer blade.
Premium indie / stylized game-prop showcase (not grey studio packshot).
Blender 5.x headless bpy. Pure procedural. No external assets.
"""
import bpy
import math
import os
from mathutils import Vector, Euler, Matrix

OUT_DIR = "/Users/user/Documents/Codex/youxi/meng/samples/fiverr-preview"
os.makedirs(OUT_DIR, exist_ok=True)

ENGINE = "BLENDER_EEVEE"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.curves, bpy.data.objects):
        for block in list(coll):
            if getattr(block, "users", 0) == 0:
                coll.remove(block)


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
    # Blender 4+/5 transmission
    for key, val in (("Transmission Weight", transmission),
                     ("Transmission", transmission)):
        if key in bsdf.inputs and transmission > 0:
            bsdf.inputs[key].default_value = val
            break
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    if alpha < 1.0 and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr, val in (("blend_method", "HASHED"), ("surface_render_method", "DITHERED")):
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


def make_wood_mat(name, base=(0.35, 0.20, 0.09), roughness=0.55):
    """Wood with procedural grain via noise + colorramp."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (2.0, 8.0, 2.0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 12.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.55
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (base[0] * 0.55, base[1] * 0.55, base[2] * 0.55, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*base, 1)
    mid = ramp.color_ramp.elements.new(0.55)
    mid.color = (min(1, base[0] * 1.15), min(1, base[1] * 1.1), min(1, base[2] * 0.95), 1)
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.4
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_metal_mat(name, color, roughness=0.25, metallic=0.92):
    mat = make_mat(name, color, metallic=metallic, roughness=roughness)
    # Add subtle noise roughness variation
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 40.0
    noise.inputs["Detail"].default_value = 4.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (roughness * 0.6,) * 3 + (1,)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (min(1, roughness * 1.4),) * 3 + (1,)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
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


def add_cylinder(name, radius, depth, location, rotation=(0, 0, 0), mat=None, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_uv_sphere(name, radius, location, mat=None, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=location
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_torus(name, major, minor, location, rotation=(0, 0, 0), mat=None, major_seg=32, minor_seg=12):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=location, rotation=rotation,
        major_segments=major_seg, minor_segments=minor_seg
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def add_cone(name, radius1, depth, location, rotation=(0, 0, 0), mat=None, vertices=24, radius2=0.0):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth,
        location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        assign_mat(obj, mat)
    return obj


def bevel_object(obj, width=0.015, segments=2):
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    try:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception:
        pass


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    obj.select_set(False)


def setup_world_gradient(top_color, bottom_color, strength=0.55):
    """Vertical gradient world — scenic color field, not flat grey."""
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    tex_coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    # Map Z from -1..1-ish via generated to 0..1
    map_range = nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = -1.0
    map_range.inputs["From Max"].default_value = 1.0
    map_range.inputs["To Min"].default_value = 0.0
    map_range.inputs["To Max"].default_value = 1.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*bottom_color[:3], 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*top_color[:3], 1)
    mid = ramp.color_ramp.elements.new(0.45)
    mid_r = (bottom_color[0] + top_color[0]) * 0.5
    mid_g = (bottom_color[1] + top_color[1]) * 0.5
    mid_b = (bottom_color[2] + top_color[2]) * 0.5
    mid.color = (mid_r, mid_g, mid_b, 1)
    links.new(tex_coord.outputs["Generated"], sep.inputs["Vector"])
    links.new(sep.outputs["Z"], map_range.inputs["Value"])
    links.new(map_range.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def setup_lights(key_energy=180, fill_energy=45, rim_energy=140,
                 key_color=(1.0, 0.92, 0.82), fill_color=(0.55, 0.70, 1.0),
                 rim_color=(1.0, 0.85, 0.65)):
    """Warm key + cool fill + warm rim — Hades / ArtStation hierarchy."""
    # Key (warm, elevated front-right)
    bpy.ops.object.light_add(type="AREA", location=(2.8, -2.2, 3.6))
    key = bpy.context.active_object
    key.name = "KeyLight"
    key.data.energy = key_energy
    key.data.size = 1.8
    key.data.color = key_color
    key.rotation_euler = (math.radians(48), math.radians(8), math.radians(42))

    # Cool fill (left, softer)
    bpy.ops.object.light_add(type="AREA", location=(-2.6, -1.8, 2.2))
    fill = bpy.context.active_object
    fill.name = "FillLight"
    fill.data.energy = fill_energy
    fill.data.size = 3.2
    fill.data.color = fill_color
    fill.rotation_euler = (math.radians(55), 0, math.radians(-48))

    # Rim / backlight (behind-right, warm edge)
    bpy.ops.object.light_add(type="AREA", location=(-1.2, 2.8, 2.8))
    rim = bpy.context.active_object
    rim.name = "RimLight"
    rim.data.energy = rim_energy
    rim.data.size = 1.4
    rim.data.color = rim_color
    rim.rotation_euler = (math.radians(-35), math.radians(15), math.radians(170))

    # Soft top bounce
    bpy.ops.object.light_add(type="AREA", location=(0.2, 0.5, 4.5))
    top = bpy.context.active_object
    top.name = "TopBounce"
    top.data.energy = 35
    top.data.size = 4.0
    top.data.color = (0.85, 0.88, 1.0)
    top.rotation_euler = (math.radians(5), 0, 0)

    return key, fill, rim


def setup_camera(location, look_at=(0, 0, 0.8), lens=55, dutch=0.0):
    direction = Vector(look_at) - Vector(location)
    rot = direction.to_track_quat("-Z", "Y").to_euler()
    if dutch:
        rot.z += math.radians(dutch)
    bpy.ops.object.camera_add(location=location, rotation=rot)
    cam = bpy.context.active_object
    cam.name = "ShowcaseCam"
    cam.data.lens = lens
    cam.data.dof.use_dof = False
    try:
        cam.data.clip_start = 0.05
    except Exception:
        pass
    bpy.context.scene.camera = cam
    return cam


def add_ground_disc(radius=3.5, z=0.0, color=(0.12, 0.11, 0.14), roughness=0.35, metallic=0.15):
    """Subtle reflective circular floor — grounds the asset, not infinite grey void."""
    mat = make_mat("GroundDisc", color, metallic=metallic, roughness=roughness)
    # Fade edge via principled + radial? Keep simple opaque with darker rim look via color
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=0.04, location=(0, 0, z - 0.02))
    disc = bpy.context.active_object
    disc.name = "GroundDisc"
    assign_mat(disc, mat)
    # Soft shadow catcher plane slightly below (darker)
    shadow_mat = make_mat("ShadowPool", (0.04, 0.035, 0.05), roughness=0.9)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius * 0.55, depth=0.01, location=(0, 0, z - 0.005))
    pool = bpy.context.active_object
    pool.name = "ShadowPool"
    assign_mat(pool, shadow_mat)
    return disc


def setup_compositor_bloom(threshold=0.85, soft=0.35, size=4.0, intensity=0.55):
    """Glare/bloom for emissive accents. Blender 5.x uses compositing_node_group."""
    scene = bpy.context.scene
    # Reuse or create a dedicated compositor node group (Blender 5 API)
    ng_name = "FiverrPreviewComp"
    ng = bpy.data.node_groups.get(ng_name)
    if ng is None:
        ng = bpy.data.node_groups.new(ng_name, "CompositorNodeTree")
    else:
        ng.nodes.clear()
        # clear old interface outputs except we rebuild
        try:
            for item in list(ng.interface.items_tree):
                ng.interface.remove(item)
        except Exception:
            pass

    # Ensure Image output socket exists for Group Output
    has_image_out = False
    try:
        for item in ng.interface.items_tree:
            if getattr(item, "name", "") == "Image" and getattr(item, "in_out", "") == "OUTPUT":
                has_image_out = True
                break
    except Exception:
        pass
    if not has_image_out:
        try:
            ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        except Exception:
            pass

    scene.compositing_node_group = ng
    try:
        scene.use_nodes = True
    except Exception:
        pass

    nodes, links = ng.nodes, ng.links
    nodes.clear()

    rl = nodes.new("CompositorNodeRLayers")
    rl.location = (0, 0)

    glare = nodes.new("CompositorNodeGlare")
    glare.location = (280, 40)
    # Blender 5: Type/Quality/params are input sockets
    try:
        glare.inputs["Type"].default_value = "Fog Glow"
    except Exception:
        try:
            glare.inputs["Type"].default_value = "Bloom"
        except Exception:
            pass
    try:
        glare.inputs["Quality"].default_value = "High"
    except Exception:
        pass
    try:
        glare.inputs["Threshold"].default_value = float(threshold)
    except Exception:
        pass
    try:
        glare.inputs["Size"].default_value = float(max(0.1, min(1.0, size / 9.0)))
    except Exception:
        pass
    try:
        glare.inputs["Strength"].default_value = float(0.35 + intensity * 0.8)
    except Exception:
        pass
    try:
        glare.inputs["Smoothness"].default_value = float(soft)
    except Exception:
        pass

    gout = nodes.new("NodeGroupOutput")
    gout.location = (560, 0)

    links.new(rl.outputs["Image"], glare.inputs["Image"])
    if "Image" in gout.inputs:
        links.new(glare.outputs["Image"], gout.inputs["Image"])
    elif len(gout.inputs) > 0:
        links.new(glare.outputs["Image"], gout.inputs[0])


def configure_render(filepath, res=1408):
    scene = bpy.context.scene
    scene.render.engine = ENGINE
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.filepath = filepath
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False

    # EEVEE quality
    if hasattr(scene, "eevee"):
        ee = scene.eevee
        for attr, val in (
            ("taa_render_samples", 64),
            ("use_bloom", True),  # older EEVEE
            ("bloom_threshold", 0.8),
            ("bloom_intensity", 0.12),
            ("bloom_radius", 4.0),
            ("use_soft_shadows", True),
            ("use_shadows", True),
            ("use_raytracing", True),
            ("gi_quality", 1.0),
        ):
            if hasattr(ee, attr):
                try:
                    setattr(ee, attr, val)
                except Exception:
                    pass

    if ENGINE == "CYCLES":
        scene.cycles.samples = 96
        scene.cycles.use_denoising = True
        try:
            scene.cycles.device = "CPU"
        except Exception:
            pass

    # Color management — enums vary by OCIO; never hard-fail
    for vt in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = vt
            break
        except Exception:
            continue
    for look in ("Medium High Contrast", "High Contrast", "None", "NONE"):
        try:
            scene.view_settings.look = look
            break
        except Exception:
            continue
    try:
        scene.view_settings.exposure = 0.15
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Subject 1: Mystic Lantern
# ---------------------------------------------------------------------------
def build_mystic_lantern():
    clear_scene()
    # Deep teal → dusk plum gradient (Spiritfarer / storybook night)
    setup_world_gradient(
        top_color=(0.10, 0.14, 0.22),
        bottom_color=(0.22, 0.12, 0.18),
        strength=0.45,
    )
    setup_lights(
        key_energy=95, fill_energy=22, rim_energy=130,
        key_color=(1.0, 0.85, 0.65),
        fill_color=(0.35, 0.50, 0.95),
        rim_color=(1.0, 0.65, 0.40),
    )
    add_ground_disc(radius=2.8, color=(0.08, 0.07, 0.10), roughness=0.42, metallic=0.2)

    brass = make_metal_mat("Brass", (0.72, 0.48, 0.18), roughness=0.28)
    brass_dark = make_metal_mat("BrassDark", (0.38, 0.24, 0.10), roughness=0.4)
    iron = make_metal_mat("Iron", (0.22, 0.23, 0.25), roughness=0.45, metallic=0.85)
    glass = make_mat("Glass", (0.75, 0.90, 1.0), metallic=0.0, roughness=0.08,
                     transmission=0.92, ior=1.45, alpha=0.35)
    # Warm emissive core
    flame = make_mat("FlameCore", (1.0, 0.75, 0.35), roughness=0.5,
                     emission=(1.0, 0.60, 0.18, 18.0))
    flame_outer = make_mat("FlameOuter", (1.0, 0.45, 0.12), roughness=0.6,
                           emission=(1.0, 0.40, 0.08, 7.0))
    wood = make_wood_mat("LanternWood", (0.28, 0.14, 0.07), roughness=0.6)
    chain_mat = make_metal_mat("Chain", (0.45, 0.42, 0.38), roughness=0.35)

    # Base pedestal (wood hex-ish via cylinder)
    base = add_cylinder("Base", 0.42, 0.12, (0, 0, 0.06), mat=wood, vertices=8)
    bevel_object(base, 0.02, 2)
    base_ring = add_torus("BaseRing", 0.38, 0.035, (0, 0, 0.13), mat=brass_dark)
    shade_smooth(base_ring)

    # Bottom cap
    bot = add_cylinder("BottomCap", 0.32, 0.08, (0, 0, 0.22), mat=brass, vertices=16)
    bevel_object(bot, 0.015, 2)
    shade_smooth(bot)

    # Vertical pillars (4 corners of lantern cage)
    pillar_r = 0.028
    for i, (x, y) in enumerate(((0.22, 0.22), (0.22, -0.22), (-0.22, 0.22), (-0.22, -0.22))):
        p = add_cylinder(f"Pillar{i}", pillar_r, 0.72, (x, y, 0.62), mat=brass, vertices=10)
        shade_smooth(p)

    # Glass panes (4 thin boxes inset)
    for i, (loc, rot) in enumerate([
        ((0, 0.24, 0.62), (0, 0, 0)),
        ((0, -0.24, 0.62), (0, 0, 0)),
        ((0.24, 0, 0.62), (0, 0, math.radians(90))),
        ((-0.24, 0, 0.62), (0, 0, math.radians(90))),
    ]):
        pane = add_box(f"Glass{i}", (0.38, 0.018, 0.62), loc, rotation=rot, mat=glass)

    # Inner warm glow sphere + outer soft shell
    core = add_uv_sphere("FlameCore", 0.10, (0, 0, 0.55), mat=flame, segments=16, rings=10)
    shade_smooth(core)
    outer = add_uv_sphere("FlameOuter", 0.16, (0, 0, 0.58), mat=flame_outer, segments=16, rings=10)
    shade_smooth(outer)
    # Point light inside for real GI/contribution
    bpy.ops.object.light_add(type="POINT", location=(0, 0, 0.58))
    pl = bpy.context.active_object
    pl.name = "LanternPoint"
    pl.data.energy = 70
    pl.data.color = (1.0, 0.65, 0.28)
    try:
        pl.data.shadow_soft_size = 0.15
    except Exception:
        pass

    # Horizontal frame bands
    for z in (0.30, 0.62, 0.94):
        band = add_torus(f"Band{z}", 0.30, 0.022, (0, 0, z), mat=brass, major_seg=24, minor_seg=10)
        shade_smooth(band)

    # Top cap / roof
    roof = add_cone("Roof", 0.38, 0.28, (0, 0, 1.12), mat=brass_dark, vertices=8, radius2=0.06)
    bevel_object(roof, 0.01, 2)
    shade_smooth(roof)
    roof_trim = add_torus("RoofTrim", 0.34, 0.025, (0, 0, 1.00), mat=brass)
    shade_smooth(roof_trim)

    # Finial
    finial = add_uv_sphere("Finial", 0.055, (0, 0, 1.30), mat=brass, segments=12, rings=8)
    shade_smooth(finial)
    tip = add_cone("Tip", 0.03, 0.10, (0, 0, 1.38), mat=brass, vertices=8, radius2=0.0)
    shade_smooth(tip)

    # Hanging ring + chain links
    ring = add_torus("HangRing", 0.07, 0.012, (0, 0, 1.48),
                     rotation=(math.radians(90), 0, 0), mat=iron, major_seg=20, minor_seg=8)
    shade_smooth(ring)
    # Simple chain: stacked tori
    for i, z in enumerate((1.58, 1.70, 1.82)):
        link = add_torus(f"Chain{i}", 0.045, 0.010, (0, 0, z),
                         rotation=(math.radians(90 if i % 2 == 0 else 0),
                                   math.radians(0 if i % 2 == 0 else 90), 0),
                         mat=chain_mat, major_seg=16, minor_seg=8)
        shade_smooth(link)

    # Decorative corner gems (tiny emissive teal)
    gem = make_mat("Gem", (0.2, 0.85, 0.9), roughness=0.15,
                   emission=(0.15, 0.7, 0.85, 1.8))
    for i, (x, y) in enumerate(((0.22, 0.22), (0.22, -0.22), (-0.22, 0.22), (-0.22, -0.22))):
        g = add_uv_sphere(f"Gem{i}", 0.028, (x, y, 0.94), mat=gem, segments=10, rings=6)
        shade_smooth(g)

    # Camera: elevated 3/4, slight dutch, fills frame
    setup_camera(location=(1.85, -2.15, 1.55), look_at=(0, 0, 0.85), lens=60, dutch=-4)
    setup_compositor_bloom(threshold=0.7, size=5, intensity=0.6)

    out = os.path.join(OUT_DIR, "3d_v2_mystic_lantern.png")
    configure_render(out, 1408)
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {out}")
    return out


# ---------------------------------------------------------------------------
# Subject 2: Wanderer Blade
# ---------------------------------------------------------------------------
def build_wanderer_blade():
    clear_scene()
    # Cool slate → warm ember horizon (Hades weapon showcase vibe)
    setup_world_gradient(
        top_color=(0.06, 0.08, 0.14),
        bottom_color=(0.32, 0.10, 0.06),
        strength=0.40,
    )
    setup_lights(
        key_energy=175, fill_energy=28, rim_energy=190,
        key_color=(1.0, 0.93, 0.82),
        fill_color=(0.40, 0.55, 1.0),
        rim_color=(1.0, 0.50, 0.28),
    )
    add_ground_disc(radius=3.2, color=(0.07, 0.06, 0.08), roughness=0.48, metallic=0.12)

    steel = make_metal_mat("Steel", (0.62, 0.65, 0.70), roughness=0.18)
    steel_dark = make_metal_mat("SteelDark", (0.22, 0.24, 0.28), roughness=0.38)
    bronze = make_metal_mat("Bronze", (0.68, 0.42, 0.16), roughness=0.28)
    leather = make_mat("LeatherWrap", (0.26, 0.11, 0.06), metallic=0.0, roughness=0.72)
    stone = make_mat("StoneRest", (0.26, 0.24, 0.23), metallic=0.05, roughness=0.78)
    stone_moss = make_mat("Moss", (0.16, 0.26, 0.11), roughness=0.88)
    rune = make_mat("RuneGlow", (0.30, 0.85, 1.0), roughness=0.25,
                    emission=(0.20, 0.75, 1.0, 8.0))
    gold_inlay = make_metal_mat("GoldInlay", (0.90, 0.68, 0.22), roughness=0.18)

    # --- Stone rest ---
    rest = add_box("StoneRest", (1.55, 0.62, 0.24), (0, 0, 0.13), mat=stone)
    bevel_object(rest, 0.035, 3)
    add_box("Moss1", (0.38, 0.14, 0.045), (-0.50, 0.20, 0.26), mat=stone_moss)
    add_box("Moss2", (0.24, 0.16, 0.035), (0.52, -0.16, 0.26), mat=stone_moss)

    # --- Weapon assembly parented to Empty so parts stay attached ---
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0.0, 0.05, 0.55))
    root = bpy.context.active_object
    root.name = "BladeRoot"
    # Pitch up tip, slight yaw for 3/4 readability
    root.rotation_euler = (math.radians(22), math.radians(-6), math.radians(12))

    def parent(obj):
        obj.parent = root
        return obj

    # Local coords: +Y toward tip, -Y toward pommel, Z = blade normal
    blade = parent(add_box("Blade", (0.085, 1.70, 0.020), (0, 0.22, 0), mat=steel))
    bevel_object(blade, 0.0035, 2)
    shade_smooth(blade)

    fuller = parent(add_box("Fuller", (0.028, 1.35, 0.022), (0, 0.28, 0.006), mat=steel_dark))

    tip = parent(add_cone("BladeTip", 0.060, 0.26, (0, 1.18, 0),
                          rotation=(math.radians(90), 0, 0),
                          mat=steel, vertices=6, radius2=0.0))
    shade_smooth(tip)

    # Rune inlays flush on blade face
    for i, y in enumerate((-0.25, 0.05, 0.35, 0.65)):
        parent(add_box(f"Rune{i}", (0.038, 0.07, 0.012), (0.0, y, 0.012), mat=rune))

    # Crossguard at ricasso
    guard = parent(add_box("Guard", (0.62, 0.09, 0.07), (0, -0.62, 0), mat=bronze))
    bevel_object(guard, 0.012, 2)
    for sx in (-0.30, 0.30):
        g = parent(add_uv_sphere(f"GuardTip{sx}", 0.038, (sx, -0.62, 0), mat=bronze, segments=12, rings=6))
        shade_smooth(g)
    gem = parent(add_uv_sphere("GuardGem", 0.045, (0, -0.58, 0.04), mat=rune, segments=14, rings=8))
    shade_smooth(gem)

    # Grip — cylinder along local Y (rotate X 90 so depth aligns with Y)
    grip = parent(add_cylinder("Grip", 0.048, 0.42, (0, -0.88, 0),
                               rotation=(math.radians(90), 0, 0),
                               mat=leather, vertices=14))
    shade_smooth(grip)
    for i, y in enumerate((-0.74, -0.88, -1.02)):
        ring = parent(add_torus(f"Wrap{i}", 0.052, 0.009, (0, y, 0),
                                rotation=(math.radians(90), 0, 0),
                                mat=bronze, major_seg=16, minor_seg=6))
        shade_smooth(ring)

    pommel = parent(add_uv_sphere("Pommel", 0.065, (0, -1.16, 0), mat=bronze, segments=16, rings=10))
    shade_smooth(pommel)
    pr = parent(add_torus("PommelRing", 0.055, 0.011, (0, -1.16, 0),
                          rotation=(0, math.radians(90), 0), mat=gold_inlay,
                          major_seg=18, minor_seg=6))
    shade_smooth(pr)

    # Soft cyan bounce from runes
    bpy.ops.object.light_add(type="POINT", location=(0.25, 0.35, 0.95))
    pl = bpy.context.active_object
    pl.name = "RuneLight"
    pl.data.energy = 22
    pl.data.color = (0.35, 0.80, 1.0)
    try:
        pl.data.shadow_soft_size = 0.3
    except Exception:
        pass

    # Warm accent near tip for rim read
    bpy.ops.object.light_add(type="POINT", location=(-0.4, 1.1, 1.0))
    tip_l = bpy.context.active_object
    tip_l.name = "TipAccent"
    tip_l.data.energy = 12
    tip_l.data.color = (1.0, 0.55, 0.30)

    setup_camera(location=(2.25, -2.05, 1.35), look_at=(0.0, 0.0, 0.55), lens=55, dutch=6)
    setup_compositor_bloom(threshold=0.65, size=5, intensity=0.65)

    out = os.path.join(OUT_DIR, "3d_v2_wanderer_blade.png")
    configure_render(out, 1408)
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {out}")
    return out


def pick_engine():
    global ENGINE
    for candidate in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            bpy.context.scene.render.engine = candidate
            ENGINE = candidate
            if candidate == "CYCLES":
                bpy.context.scene.cycles.samples = 96
                bpy.context.scene.cycles.use_denoising = True
            print(f"Using engine: {ENGINE}")
            return ENGINE
        except Exception:
            continue
    ENGINE = "CYCLES"
    bpy.context.scene.render.engine = "CYCLES"
    print(f"Using engine: {ENGINE}")
    return ENGINE


def main():
    print("=== Fiverr preview v2 renders start ===")
    print(f"Blender {bpy.app.version_string}")
    pick_engine()
    p1 = build_mystic_lantern()
    p2 = build_wanderer_blade()
    print("=== DONE ===")
    print(p1)
    print(p2)


if __name__ == "__main__":
    main()
