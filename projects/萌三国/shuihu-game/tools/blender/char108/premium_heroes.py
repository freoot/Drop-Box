"""Premium-quality hero sculpts for representative characters.

Three showcase heroes with enhanced detail:
  - hero-001 宋江 (Song Jiang) — 及时雨, support leader, 官帽+长袍+羽扇+仁义气质
  - hero-006 林冲 (Lin Chong) — 豹子头, spear warrior, 头盔+护甲+长枪+英武
  - hero-059 扈三娘 (Hu Sanniang) — 一丈青, female warrior, 双刀+发髻+红妆+矫健

Higher polygon count, layered clothing, distinct facial features,
hand-painted style with freestyle outlines, and custom animations.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/char108/premium_heroes.py
"""
import bpy, math, json, sys, os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets' / 'releases' / 'CHAR-108'
PREMIUM_DIR = OUT / 'premium'
SHEET_DIR = PREMIUM_DIR / 'sheets'
PORTRAIT_DIR = PREMIUM_DIR / 'portraits'
SRC_DIR = PREMIUM_DIR / 'blender-src'
for d in [SHEET_DIR, PORTRAIT_DIR, SRC_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ============================================================
# SHARED HELPERS
# ============================================================

def mat(name, color, metal=0, rough=0.6, emit=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Emission'].default_value = (emit, emit, emit, 1) if isinstance(emit, float) else emit
    return m

def attach(o, name, material, rig_obj=None, bone=None):
    o.name = name
    if o.data.materials:
        o.data.materials[0] = material
    else:
        o.data.materials.append(material)
    for face in o.data.polygons:
        face.use_smooth = True
    if bone and rig_obj:
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1, 'REPLACE')
        mod = o.modifiers.new('Rigid bind', 'ARMATURE')
        mod.object = rig_obj
        o.parent = rig_obj
    return o

def make_sphere(name, loc, scale, mat, rig=None, bone=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return attach(o, name, mat, rig, bone)

def make_cylinder(name, loc, rot, radius, depth, mat, rig=None, bone=None, r2=None):
    if r2 is None: r2 = radius
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, radius2=r2, depth=depth, location=loc)
    o = bpy.context.object
    o.rotation_euler = rot
    return attach(o, name, mat, rig, bone)

def make_cube(name, loc, scale, mat, rig=None, bone=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return attach(o, name, mat, rig, bone)

def make_torus(name, loc, rot, major_r, minor_r, mat, rig=None, bone=None):
    bpy.ops.mesh.primitive_torus_add(align='WORLD', location=loc, rotation=rot,
                                      major_radius=major_r, minor_radius=minor_r,
                                      major_segments=24, minor_segments=12)
    o = bpy.context.object
    return attach(o, name, mat, rig, bone)

def curve_tube(name, points, radius, mat, rig=None, bone=None):
    """Create a tube along a 3D path (for ribbons, tassels, etc.)."""
    # Create curve
    bpy.ops.curve.primitive_nurbs_curve_add(radius=radius, view_align=False, enter_editmode=False,
                                            location=points[0])
    curve = bpy.context.object
    curve.data.dimensions = '3D'
    curve.data.bevel_depth = radius
    curve.data.bevel_resolution = 4
    # Set points
    curve.data.splines[0].points.add(len(points) - 4)  # nurbs starts with 4
    for i, p in enumerate(points):
        if i < len(curve.data.splines[0].points):
            curve.data.splines[0].points[i].co = (p[0], p[1], p[2], 1)
    # Convert to mesh
    bpy.context.view_layer.objects.active = curve
    bpy.ops.object.convert(target='MESH')
    return attach(curve, name, mat, rig, bone)

# ============================================================
# SKELETON (same as base but more bones for detail)
# ============================================================

PREMIUM_BONES = {
    'root': ((0,0,0),(0,0,.3),None),
    'body': ((0,0,1),(0,0,1.75),'root'),
    'chest': ((0,0,1.55),(0,0,1.75),'body'),
    'head': ((0,0,1.75),(0,0,2.55),'chest'),
    'eyes': ((0,-.5,2.30),(0,-.5,2.45),'head'),
    'jaw': ((0,-.3,2.0),(0,-.35,1.9),'head'),
    'arm.L': ((-.45,0,1.60),(-.70,0,1.15),'chest'),
    'hand.L': ((-.70,0,1.15),(-.75,-.05,.90),'arm.L'),
    'arm.R': ((.45,0,1.60),(.70,0,1.15),'chest'),
    'hand.R': ((.70,0,1.15),(.75,-.05,.90),'arm.R'),
    'leg.L': ((-.24,0,1.0),(-.24,0,.50),'root'),
    'foot.L': ((-.24,0,.50),(-.24,-.06,.10),'leg.L'),
    'leg.R': ((.24,0,1.0),(.24,0,.50),'root'),
    'foot.R': ((.24,0,.50),(.24,-.06,.10),'leg.R'),
    'cape.L': ((-.30,.05,1.50),(-.50,.20,0.90),'body'),
    'cape.R': ((.30,.05,1.50),(.50,.20,0.90),'body'),
}

def build_rig():
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = 'premium_rig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    for name, (head, tail, parent) in PREMIUM_BONES.items():
        b = rig.data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front = True
    return rig

# ============================================================
# FACE DETAILS (shared parts, positioned in head-local space)
# ============================================================

def build_face(rig, skin, eye_color, expression='neutral', face_shape='round', blush_color=None):
    """Build detailed face. expression: neutral/serious/smile/fierce
    face_shape: round/oval/square/heart"""
    head_bs = 0.58
    if face_shape == 'oval': head_bs = 0.52
    elif face_shape == 'square': head_bs = 0.60
    elif face_shape == 'heart': head_bs = 0.50

    # Head main
    make_sphere('Head', (0,0,2.18), (head_bs, 0.42, 0.62), skin, rig, 'head')
    # Chin/jaw shape
    jaw_shape = {
        'round': (0.38, 0.30, 0.25),
        'oval': (0.32, 0.28, 0.28),
        'square': (0.42, 0.35, 0.20),
        'heart': (0.30, 0.25, 0.22),
    }
    js = jaw_shape.get(face_shape, jaw_shape['round'])
    make_sphere('Jaw', (0, -0.05, 1.92), js, skin, rig, 'jaw')

    # Nose
    make_sphere('Nose tip', (0, -0.46, 2.08), (0.055, 0.08, 0.06), skin, rig, 'head')
    make_cylinder('Nose bridge', (0, -0.38, 2.22), (math.radians(90), 0, 0), 0.03, 0.12, skin, rig, 'head')

    # Eyes - big Q-style
    for sign in [-1, 1]:
        # Eye white (bigger, more oval)
        make_sphere(f'Eye white {sign}', (sign*0.20, -0.41, 2.22),
                    (0.16, 0.04, 0.19), skin, rig, 'eyes')
        # Iris (larger for moe look)
        iris_color = eye_color
        make_sphere(f'Iris {sign}', (sign*0.20, -0.455, 2.21),
                    (0.10, 0.03, 0.13), iris_color, rig, 'eyes')
        # Pupil
        pupil_color = (0.05, 0.05, 0.08, 1)
        make_sphere(f'Pupil {sign}', (sign*0.20, -0.46, 2.205),
                    (0.05, 0.025, 0.07), pupil_color, rig, 'eyes')
        # Eye highlight
        white = (1,1,1,1)
        make_sphere(f'Eye glint {sign}', (sign*0.24, -0.47, 2.215),
                    (0.025, 0.01, 0.035), white, rig, 'eyes')
        # Eye shine bottom
        make_sphere(f'Eye shine {sign}', (sign*0.16, -0.45, 2.208),
                    (0.015, 0.008, 0.02), white, rig, 'eyes')

        # Eyebrow (expression-dependent)
        brow_color = (0.08, 0.06, 0.05, 1)
        if expression == 'serious':
            brow_rot = sign * 15  # angled down
        elif expression == 'fierce':
            brow_rot = sign * 25
        elif expression == 'smile':
            brow_rot = -sign * 8  # slightly raised
        else:
            brow_rot = 0

        bpy.ops.mesh.primitive_cube_add(size=1, location=(sign*0.18, -0.42, 2.36))
        br = bpy.context.object
        br.scale = (0.12, 0.02, 0.04)
        br.rotation_euler = (0, 0, math.radians(brow_rot))
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        attach(br, f'Eyebrow {sign}', brow_color, rig, 'head')

        # Eyelashes (upper)
        for li in range(3):
            lx = sign * (0.14 + li * 0.06)
            make_sphere(f'Lash {sign}_{li}', (lx, -0.475, 2.23),
                        (0.012, 0.008, 0.015), brow_color, rig, 'eyes')

        # Blush
        if blush_color:
            make_sphere(f'Blush {sign}', (sign*0.30, -0.34, 2.04),
                        (0.09, 0.025, 0.07), blush_color, rig, 'head')

    # Mouth (expression-dependent)
    mouth_color = (0.35, 0.15, 0.12, 1)
    lip_color = (0.75, 0.45, 0.45, 1)
    if expression == 'smile':
        # U-shaped smile
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.42, 1.96))
        mouth = bpy.context.object
        mouth.scale = (0.10, 0.015, 0.04)
        # Deform into curve by adding vertices? Simpler: use torus arc
        bpy.ops.object.delete()
        make_torus('Mouth', (0, -0.415, 1.955), (math.radians(90), 0, 0),
                   0.06, 0.015, lip_color, rig, 'head')
    elif expression == 'fierce':
        # Thin stern line
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.42, 1.96))
        mouth = bpy.context.object
        mouth.scale = (0.09, 0.01, 0.025)
        bpy.ops.object.transform_apply(scale=True)
        attach(mouth, 'Mouth', mouth_color, rig, 'head')
    elif expression == 'serious':
        # Flat, slightly downturned
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.425, 1.96))
        mouth = bpy.context.object
        mouth.scale = (0.10, 0.012, 0.03)
        bpy.ops.object.transform_apply(scale=True)
        attach(mouth, 'Mouth', lip_color, rig, 'head')
    else:  # neutral
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.42, 1.96))
        mouth = bpy.context.object
        mouth.scale = (0.08, 0.01, 0.025)
        bpy.ops.object.transform_apply(scale=True)
        attach(mouth, 'Mouth', lip_color, rig, 'head')

# ============================================================
# HAIR STYLES
# ============================================================

def hair_official_hat(rig, hair_color, hat_color, hat_accent):
    """宋江款 — 官帽 + 两侧垂发 + 整齐发髻"""
    # Hair base
    make_sphere('Hair cap', (0, 0.03, 2.48), (0.58, 0.40, 0.38), hair_color, rig, 'head')
    # Side hair strands
    for sign in [-1, 1]:
        make_cylinder(f'Side hair {sign}', (sign*0.46, 0, 2.30),
                      (0, 0, math.radians(sign*8)), 0.06, 0.50, hair_color, rig, 'head')
    # Official hat (black with wings)
    hat_mat = mat('Official hat', hat_color, 0.1, 0.55)
    make_cylinder('Hat crown', (0, 0.02, 2.60), (0, 0, 0), 0.35, 0.18, hat_mat, rig, 'head')
    # Hat brim / wing extensions
    for sign in [-1, 1]:
        make_cube(f'Hat wing {sign}', (sign*0.55, 0, 2.58),
                  (0.15, 0.20, 0.05), hat_mat, rig, 'head')
    # Hat gem/ornament
    gem_mat = mat('Hat gem', hat_accent, 0.8, 0.2)
    make_sphere('Hat ornament', (0, -0.22, 2.56), (0.07, 0.04, 0.05), gem_mat, rig, 'head')

def hair_general_helmet(rig, helmet_color, plume_color, metal_color):
    """林冲款 — 将军头盔 + 红缨 + 护额"""
    helmet_mat = mat('Helmet', helmet_color, 0.7, 0.35)
    plume_mat = mat('Plume', plume_color, 0, 0.7)
    metal_mat = mat('Helmet metal', metal_color, 0.85, 0.25)

    # Helmet dome
    make_sphere('Helmet dome', (0, 0.05, 2.50), (0.58, 0.43, 0.42), helmet_mat, rig, 'head')
    # Helmet brim front
    make_cylinder('Helmet brim', (0, -0.20, 2.34),
                  (math.radians(80), 0, 0), 0.50, 0.06, helmet_mat, rig, 'head', 0.48)
    # Side guards
    for sign in [-1, 1]:
        make_cube(f'Helmet side guard {sign}', (sign*0.50, -0.05, 2.28),
                  (0.05, 0.20, 0.22), helmet_mat, rig, 'head')
    # Red plume (top)
    make_cylinder('Plume', (0, 0, 2.85),
                  (0, 0, 0), 0.04, 0.40, plume_mat, rig, 'head')
    # Plume tip
    make_sphere('Plume tip', (0, 0, 3.08), (0.06, 0.06, 0.10), plume_mat, rig, 'head')
    # Metal band
    make_torus('Helmet band', (0, 0, 2.58), (math.radians(90), 0, 0),
               0.45, 0.03, metal_mat, rig, 'head')
    # Front emblem
    make_sphere('Helmet emblem', (0, -0.32, 2.50), (0.08, 0.04, 0.08), metal_mat, rig, 'head')

def hair_female_bun(rig, hair_color, hairpin_color, ribbon_color):
    """扈三娘款 — 女性高发髻 + 发簪 + 侧发 + 红绫"""
    # Hair base
    make_sphere('Hair base', (0, 0.04, 2.42), (0.50, 0.38, 0.38), hair_color, rig, 'head')
    # High bun
    make_sphere('Hair bun', (0, 0.08, 2.80), (0.28, 0.24, 0.28), hair_color, rig, 'head')
    make_sphere('Bun top', (0, 0.12, 2.95), (0.18, 0.14, 0.18), hair_color, rig, 'head')
    # Side hair (long, framing face)
    for sign in [-1, 1]:
        make_cylinder(f'Side hair {sign}', (sign*0.42, 0, 2.30),
                      (0, 0, math.radians(sign*10)), 0.055, 0.65, hair_color, rig, 'head')
        # Tuck behind ear
        make_sphere(f'Hair tuck {sign}', (sign*0.40, 0, 2.10),
                    (0.07, 0.08, 0.10), hair_color, rig, 'head')
    # Hairpin
    pin_mat = mat('Hairpin', hairpin_color, 0.9, 0.15)
    make_cylinder('Hairpin', (0, 0.08, 2.92), (0, 0, math.radians(30)), 0.02, 0.22, pin_mat, rig, 'head')
    make_sphere('Pin top', (0.08, 0.08, 3.00), (0.04, 0.04, 0.04), pin_mat, rig, 'head')
    # Red ribbon
    ribbon_mat = mat('Ribbon', ribbon_color, 0, 0.65)
    make_cylinder('Ribbon knot', (0, 0.05, 2.72),
                  (math.radians(20), 0, 0), 0.05, 0.12, ribbon_mat, rig, 'head')
    # Ribbon tails (simplified)
    for sign in [-1, 1]:
        make_cylinder(f'Ribbon tail {sign}', (sign*0.10, 0.08, 2.60),
                      (math.radians(sign*15), 0, math.radians(sign*20)), 0.02, 0.25, ribbon_mat, rig, 'head')

# ============================================================
# BODY / CLOTHING BUILDERS
# ============================================================

def build_robe(rig, cloth_color, trim_color, sash_color, style='official'):
    """Build layered robe body.
    style: 'official' (宋江官袍), 'armor' (林冲甲胄), 'female' (扈三娘女战衣)
    """
    # Inner robe
    inner_mat = mat('Inner robe', cloth_color, 0, 0.7)
    # Torso
    make_cylinder('Inner torso', (0, 0, 1.40), (0, 0, 0), 0.44, 0.70, inner_mat, rig, 'body')
    # Skirt
    make_cylinder('Inner skirt', (0, 0, 0.85), (0, 0, 0), 0.50, 0.70, inner_mat, rig, 'body', 0.38)

    if style == 'official':
        # Outer robe layer
        outer_mat = mat('Outer robe', _lighten(cloth_color, 0.15), 0, 0.75)
        make_cylinder('Outer robe', (0, 0, 1.40), (0, 0, 0), 0.48, 0.65, outer_mat, rig, 'body')
        # Robe opening (V-neck with trim)
        trim_mat = mat('Robe trim', trim_color, 0.3, 0.4)
        for sign in [-1, 1]:
            make_cube(f'Collar trim {sign}', (sign*0.15, -0.20, 1.62),
                      (0.03, 0.18, 0.20), trim_mat, rig, 'chest')
        # Wide sleeves
        for sign in [-1, 1]:
            make_cylinder(f'Sleeve {sign}', (sign*0.45, 0, 1.45),
                          (0, 0, math.radians(sign*15)), 0.20, 0.45, outer_mat, rig, f'arm.{sign[0]}', 0.12)
            # Sleeve cuff trim
            make_cylinder(f'Cuff trim {sign}', (sign*0.58, 0, 1.22),
                          (0, 0, math.radians(sign*15)), 0.14, 0.04, trim_mat, rig, f'arm.{sign[0]}')
        # Waist sash
        sash_mat = mat('Waist sash', sash_color, 0, 0.6)
        make_torus('Waist sash', (0, 0, 1.08), (math.radians(90), 0, 0),
                   0.45, 0.06, sash_mat, rig, 'body')
        # Sash knot
        make_sphere('Sash knot', (-0.20, -0.20, 1.05), (0.08, 0.05, 0.08), sash_mat, rig, 'body')
        # Sash streamers
        for i in range(2):
            make_cylinder(f'Sash streamer {i}', (-0.15 - i*0.08, -0.15, 0.90),
                          (math.radians(5), 0, math.radians(-10)), 0.02, 0.35, sash_mat, rig, 'body')

    elif style == 'armor':
        # Armor plates on chest
        armor_mat = mat('Armor', (0.50, 0.45, 0.38, 1), 0.75, 0.35)
        armor_dark = mat('Armor dark', (0.30, 0.28, 0.22, 1), 0.6, 0.45)
        # Chest plate
        make_cube('Chest plate', (0, -0.10, 1.48),
                  (0.38, 0.10, 0.35), armor_mat, rig, 'chest')
        # Abdominal plate (laminar)
        for i in range(3):
            make_cube(f'Abdomen plate {i}', (0, -0.10, 1.20 - i*0.10),
                      (0.34, 0.08, 0.12), armor_mat, rig, 'body')
        # Shoulder guards
        for sign in [-1, 1]:
            make_sphere(f'Shoulder guard {sign}', (sign*0.48, 0, 1.58),
                        (0.22, 0.18, 0.20), armor_mat, rig, f'arm.{sign[0]}')
            # Spikes/ridged detail
            make_cube(f'Shoulder ridge {sign}', (sign*0.48, -0.05, 1.62),
                      (0.15, 0.05, 0.05), armor_dark, rig, f'arm.{sign[0]}')
        # Arm bracers
        for sign in [-1, 1]:
            s = sign[0]
            make_cylinder(f'Arm bracer {sign}', (sign*0.62, 0, 1.25),
                          (0, 0, math.radians(sign*10)), 0.10, 0.18, armor_mat, rig, f'arm.{s}', 0.08)
        # Belt
        belt_mat = mat('Belt', (0.25, 0.15, 0.08, 1), 0.4, 0.4)
        make_torus('Belt', (0, 0, 1.05), (math.radians(90), 0, 0),
                   0.43, 0.05, belt_mat, rig, 'body')
        # Belt buckle
        buckle_mat = mat('Buckle', (0.85, 0.65, 0.20, 1), 0.9, 0.2)
        make_cube('Belt buckle', (-0.35, -0.20, 1.04),
                  (0.08, 0.04, 0.07), buckle_mat, rig, 'body')
        # Cape/披风 behind
        cape_mat = mat('Cape', _darken(cloth_color, 0.2), 0, 0.75)
        make_cylinder('Cape back', (0, 0.20, 1.50),
                      (0, 0, 0), 0.45, 0.80, cape_mat, rig, 'body', 0.25)
        # Cape collar
        make_cylinder('Cape collar', (0, 0.05, 1.68),
                      (math.radians(20), 0, 0), 0.40, 0.10, cape_mat, rig, 'chest', 0.35)

    elif style == 'female':
        # Fitted female battle outfit
        outer_mat = mat('Female outfit', cloth_color, 0, 0.65)
        # Fitted top
        make_cylinder('Fitted top', (0, 0, 1.42), (0, 0, 0), 0.38, 0.50, outer_mat, rig, 'chest', 0.35)
        # Waist cincher
        cincher_mat = mat('Waist cincher', _darken(cloth_color, 0.25), 0, 0.55)
        make_cylinder('Waist cincher', (0, 0, 1.15), (0, 0, 0), 0.36, 0.22, cincher_mat, rig, 'body', 0.32)
        # Skirt (short battle skirt)
        skirt_mat = mat('Skirt', cloth_color, 0, 0.7)
        make_cylinder('Battle skirt', (0, 0, 0.90), (0, 0, 0), 0.42, 0.35, skirt_mat, rig, 'body', 0.28)
        # Skirt panels (layered)
        for i in range(4):
            angle = (i - 1.5) * 0.5
            px = math.sin(angle) * 0.35
            pz = 0.90 - math.cos(angle) * 0.05
            make_cube(f'Skirt panel {i}', (px, 0.15, pz),
                      (0.10, 0.18, 0.02), _lighten(cloth_color, -0.1), rig, 'body')
        # Shoulder armor
        shoulder_mat = mat('Shoulder', (0.80, 0.50, 0.15, 1), 0.8, 0.3)
        for sign in [-1, 1]:
            make_sphere(f'Shoulder guard {sign}', (sign*0.42, 0, 1.58),
                        (0.18, 0.14, 0.16), shoulder_mat, rig, f'arm.{sign[0]}')
        # Arm guards
        for sign in [-1, 1]:
            s = sign[0]
            make_cylinder(f'Arm guard {sign}', (sign*0.55, 0, 1.28),
                          (0, 0, math.radians(sign*8)), 0.08, 0.15, shoulder_mat, rig, f'arm.{s}', 0.06)
        # Red ribbon sash
        ribbon_mat = mat('Red sash', (0.85, 0.25, 0.30, 1), 0, 0.6)
        make_torus('Hip ribbon L', (-0.20, -0.15, 1.05),
                   (math.radians(70), math.radians(20), 0), 0.15, 0.03, ribbon_mat, rig, 'body')
        # Long ribbon flowing
        make_cylinder('Ribbon flow', (-0.30, -0.10, 0.85),
                      (math.radians(20), math.radians(10), math.radians(-30)),
                      0.02, 0.55, ribbon_mat, rig, 'body')

    # Legs and boots (common)
    leg_mat = mat('Pants', _darken(cloth_color, 0.3), 0, 0.65)
    boot_mat = mat('Boots', (0.10, 0.08, 0.06, 1), 0.2, 0.5)
    for side, x in [('L', -0.24), ('R', 0.24)]:
        make_cylinder(f'Trousers {side}', (x, 0, 0.78),
                      (0, 0, 0), 0.12, 0.45, leg_mat, rig, f'leg.{side}')
        make_cylinder(f'Boot {side}', (x, 0, 0.30),
                      (0, 0, 0), 0.14, 0.28, boot_mat, rig, f'foot.{side}', 0.10)
        # Boot toe
        make_cube(f'Boot toe {side}', (x, -0.10, 0.15),
                  (0.12, 0.20, 0.08), boot_mat, rig, f'foot.{side}')

def _lighten(color, amount):
    return tuple(min(1, c + amount) for c in color[:3]) + (color[3],)

def _darken(color, amount):
    return tuple(max(0, c - amount) for c in color[:3]) + (color[3],)

# ============================================================
# WEAPONS
# ============================================================

def weapon_fan(rig, side='R'):
    """宋江的羽扇 — 精致羽毛扇"""
    s = 1 if side == 'R' else -1
    hx = s * 0.65
    fan_frame = mat('Fan frame', (0.85, 0.65, 0.20, 1), 0.7, 0.3)
    fan_feather = mat('Fan feather', (0.95, 0.90, 0.80, 1), 0, 0.75)
    feather_tip = mat('Feather tip', (0.80, 0.55, 0.30, 1), 0, 0.6)

    # Fan feathers (radiating)
    n_feathers = 9
    for i in range(n_feathers):
        angle = (i - n_feathers//2) * 0.20
        fx = hx + math.sin(angle) * 0.28
        fy = -0.05
        fz = 1.10 + math.cos(angle) * 0.35
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.015, radius2=0.04,
                                         depth=0.40, location=((hx+fx)/2, fy, (1.10+fz)/2))
        feather = bpy.context.object
        d = math.sqrt((fx-hx)**2 + (fz-1.10)**2)
        # Rotate to point from handle to tip
        feather.rotation_euler = (math.atan2(0, d), 0, -angle)
        attach(feather, f'Feather {i}', fan_feather, rig, f'hand.{side}')
        # Tip accent
        make_sphere(f'Feather tip {i}', (fx, fy, fz),
                    (0.03, 0.02, 0.04), feather_tip, rig, f'hand.{side}')

    # Handle
    make_cylinder('Fan handle', (hx, -0.05, 0.95),
                  (0, 0, 0), 0.025, 0.20, fan_frame, rig, f'hand.{side}')
    # Handle cap
    make_sphere('Fan handle cap', (hx, -0.05, 1.08),
                (0.035, 0.035, 0.035), fan_frame, rig, f'hand.{side}')

def weapon_spear_premium(rig, side='R'):
    """林冲的丈八蛇矛 — 精致长枪 + 蛇形矛尖 + 红缨"""
    s = 1 if side == 'R' else -1
    hx = s * 0.72
    wood = mat('Spear shaft', (0.45, 0.30, 0.15, 1), 0, 0.55)
    steel = mat('Spear blade', (0.70, 0.78, 0.82, 1), 0.9, 0.25)
    gold = mat('Spear gold', (0.85, 0.65, 0.20, 1), 0.85, 0.2)
    red = mat('Tassel', (0.80, 0.20, 0.18, 1), 0, 0.65)

    # Shaft (tapered)
    make_cylinder('Spear shaft', (hx, 0, 1.60),
                  (0, 0, 0), 0.03, 2.20, wood, rig, f'hand.{side}', 0.025)
    # Blade base collar
    make_cylinder('Blade collar', (hx, 0, 2.60),
                  (0, 0, 0), 0.06, 0.04, gold, rig, f'hand.{side}', 0.05)
    # Snake-shaped blade (serpent spear tip)
    for i in range(6):
        # wavy blade segments
        offset = math.sin(i * 0.8) * 0.02
        blade_r = 0.08 - i * 0.01
        make_cylinder(f'Blade seg {i}', (hx + offset, 0, 2.65 + i * 0.07),
                      (0, 0, 0), blade_r, 0.08, steel, rig, f'hand.{side}', blade_r * 0.7)
    # Final tip
    make_cylinder('Spear tip', (hx, 0, 3.10),
                  (0, 0, 0), 0.02, 0.15, steel, rig, f'hand.{side}', 0.002)
    # Red tassel
    for j in range(5):
        angle = j * 0.4 - 0.8
        tx = hx + math.sin(angle) * 0.06
        ty = 0.03
        tz = 2.55 - j * 0.04
        make_cylinder(f'Tassel {j}', (tx, ty, tz),
                      (math.radians(angle*20), 0, math.radians(angle*30)),
                      0.012, 0.25, red, rig, f'hand.{side}')
    # Tassel knot
    make_sphere('Tassel knot', (hx, 0, 2.58), (0.05, 0.05, 0.05), red, rig, f'hand.{side}')

def weapon_twin_blades_premium(rig):
    """扈三娘的日月双刀 — 一对精致弯刀"""
    steel = mat('Dao blade', (0.75, 0.82, 0.86, 1), 0.9, 0.2)
    handle = mat('Dao handle', (0.25, 0.15, 0.08, 1), 0.1, 0.5)
    guard = mat('Dao guard', (0.85, 0.65, 0.20, 1), 0.85, 0.2)
    red = mat('Dao ribbon', (0.85, 0.25, 0.25, 1), 0, 0.6)

    for side, sign in [('L', -1), ('R', 1)]:
        hx = sign * 0.70
        # Handle
        make_cylinder(f'Dao handle {side}', (hx, 0, 1.00),
                      (0, 0, 0), 0.035, 0.18, handle, rig, f'hand.{side}')
        # Guard
        make_cylinder(f'Dao guard {side}', (hx, 0, 1.18),
                      (0, 0, 0), 0.07, 0.03, guard, rig, f'hand.{side}', 0.06)
        # Curved blade (use multiple segments)
        for i in range(8):
            curve_x = sign * (0.02 * i)
            curve_z = 1.22 + i * 0.11
            blade_r = 0.045 - abs(i - 4) * 0.003
            make_cylinder(f'Blade {side}_{i}', (hx + curve_x, 0, curve_z),
                          (math.radians(sign * 5 * i), 0, math.radians(sign * 3)),
                          blade_r, 0.13, steel, rig, f'hand.{side}', blade_r * 0.6)
        # Blade tip
        make_cylinder(f'Blade tip {side}', (hx + sign*0.18, 0, 2.10),
                      (math.radians(sign*25), 0, math.radians(sign*10)),
                      0.02, 0.12, steel, rig, f'hand.{side}', 0.005)
        # Red ribbon on handle
        make_cylinder(f'Dao ribbon {side}', (hx, -0.02, 0.90),
                      (math.radians(sign*20), 0, math.radians(sign*15)),
                      0.015, 0.18, red, rig, f'hand.{side}')

# ============================================================
# FULL HERO BUILDERS
# ============================================================

def build_songjiang():
    """及时雨·宋江 — 仁义领袖气质，官帽+长袍+羽扇，圆脸微笑"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)

    rig = build_rig()

    # Colors
    skin = mat('Skin', (0.92, 0.75, 0.60, 1), 0, 0.7)
    hair_color = (0.08, 0.06, 0.05, 1)
    hair_mat = mat('Hair', hair_color, 0, 0.55)
    robe_blue = (0.12, 0.28, 0.55, 1)
    trim_gold = (0.85, 0.65, 0.20, 1)
    sash_red = (0.70, 0.20, 0.22, 1)
    blush = (0.95, 0.65, 0.60, 1)

    # Body & clothing
    build_robe(rig, robe_blue, trim_gold, sash_red, style='official')

    # Face — round, kind eyes, slight smile
    build_face(rig, skin, eye_color=(0.10, 0.25, 0.45, 1),
               expression='smile', face_shape='round',
               blush_color=blush)

    # Hair + official hat
    hair_official_hat(rig, hair_mat, (0.08, 0.08, 0.10, 1), trim_gold)

    # Moustache + small beard (宋江的短须)
    mustache_mat = mat('Moustache', (0.12, 0.08, 0.06, 1), 0, 0.5)
    make_sphere('Moustache', (0, -0.43, 1.98),
                (0.12, 0.02, 0.025), mustache_mat, rig, 'head')
    make_sphere('Goatee', (0, -0.45, 1.90),
                (0.07, 0.025, 0.06), mustache_mat, rig, 'head')

    # Ears
    for sign in [-1, 1]:
        make_sphere(f'Ear {sign}', (sign*0.52, 0, 2.18),
                    (0.08, 0.06, 0.12), skin, rig, 'head')

    # Weapon — feather fan (right hand)
    weapon_fan(rig, 'R')

    # Left hand — 招展手势 (open palm)
    left_arm_mat = mat('Left sleeve', _lighten(robe_blue, 0.1), 0, 0.75)
    make_cylinder('Left sleeve end', (-0.68, 0, 1.18),
                  (0, 0, math.radians(-12)), 0.13, 0.04, trim_gold, rig, 'hand.L')

    return rig

def build_linchong():
    """豹子头·林冲 — 英武将军，头盔+甲胄+丈八蛇矛，方正脸型，坚毅眼神"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)

    rig = build_rig()

    # Colors
    skin = mat('Skin', (0.88, 0.68, 0.52, 1), 0, 0.65)
    helmet_steel = (0.55, 0.60, 0.65, 1)
    plume_red = (0.78, 0.18, 0.18, 1)
    armor_gold = (0.85, 0.65, 0.20, 1)
    robe_cyan = (0.15, 0.35, 0.45, 1)
    cape_dark = (0.08, 0.15, 0.25, 1)

    # Body & armor
    build_robe(rig, robe_cyan, armor_gold, armor_gold, style='armor')

    # Face — square jaw, fierce/serious eyes
    build_face(rig, skin, eye_color=(0.15, 0.20, 0.35, 1),
               expression='serious', face_shape='square')

    # Ears
    for sign in [-1, 1]:
        make_sphere(f'Ear {sign}', (sign*0.52, 0, 2.15),
                    (0.09, 0.07, 0.12), skin, rig, 'head')

    # Helmet
    hair_general_helmet(rig, helmet_steel, plume_red, armor_gold)

    # Moustache (林冲的三柳须)
    mustache_mat = mat('Moustache', (0.15, 0.10, 0.08, 1), 0, 0.5)
    make_sphere('Moustache center', (0, -0.44, 1.97),
                (0.10, 0.02, 0.02), mustache_mat, rig, 'head')
    for sign in [-1, 1]:
        make_sphere(f'Moustache side {sign}', (sign*0.13, -0.43, 1.96),
                    (0.06, 0.02, 0.02), mustache_mat, rig, 'head')

    # Weapon — serpent spear
    weapon_spear_premium(rig, 'R')

    # Left hand — clenched fist (for spear grip)
    make_sphere('Left fist', (-0.72, -0.03, 0.98),
                (0.12, 0.10, 0.14), skin, rig, 'hand.L')

    return rig

def build_husanniang():
    """一丈青·扈三娘 — 矫健女将，发髻+双刀+红绫，鹅蛋脸，英气"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)

    rig = build_rig()

    # Colors
    skin = mat('Skin', (0.93, 0.72, 0.58, 1), 0, 0.7)
    hair_black = (0.05, 0.04, 0.06, 1)
    hair_mat = mat('Hair', hair_black, 0, 0.55)
    outfit_pink = (0.72, 0.35, 0.45, 1)
    gold_accent = (0.90, 0.70, 0.25, 1)
    red_ribbon = (0.85, 0.20, 0.25, 1)
    blush = (0.95, 0.60, 0.58, 1)

    # Body & female battle outfit
    build_robe(rig, outfit_pink, gold_accent, red_ribbon, style='female')

    # Face — heart/oval shape, big clear eyes, determined
    build_face(rig, skin, eye_color=(0.30, 0.20, 0.45, 1),
               expression='serious', face_shape='oval',
               blush_color=blush)

    # Ears (smaller for female)
    for sign in [-1, 1]:
        make_sphere(f'Ear {sign}', (sign*0.46, 0, 2.16),
                    (0.07, 0.05, 0.10), skin, rig, 'head')

    # Hair + bun + accessories
    hair_female_bun(rig, hair_mat, gold_accent, red_ribbon)

    # Twin blades
    weapon_twin_blades_premium(rig)

    return rig

# ============================================================
# SCENE SETUP + RENDERING
# ============================================================

def setup_scene(rig):
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 1

    # Camera
    bpy.ops.object.camera_add(location=(4.2, -7.0, 3.8))
    cam = bpy.context.object
    cam.rotation_euler = (Vector((0, 0, 1.5)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 3.6
    scene.camera = cam

    # Lighting (3-point + rim)
    lights = [
        ((3.5, -4.5, 6.0), 900, 5, 'Key'),
        ((-4.5, -2.5, 3.5), 500, 4, 'Fill'),
        ((0, 4.5, 5.0), 1000, 3.5, 'Back'),
        ((2, -5, 7.0), 300, 2, 'Rim top'),
    ]
    for loc, energy, size, name in lights:
        bpy.ops.object.light_add(type='AREA', location=loc)
        lamp = bpy.context.object
        lamp.name = f'Light_{name}'
        lamp.data.energy = energy
        lamp.data.shape = 'DISK'
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0, 0, 1.4)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()

    # EEVEE with bloom
    scene.render.engine = 'BLENDER_EEVEE'
    try:
        scene.eevee.taa_render_samples = 16
    except: pass
    try:
        scene.eevee.use_bloom = True
        scene.eevee.bloom_threshold = 0.9
        scene.eevee.bloom_intensity = 0.15
        scene.eevee.bloom_radius = 8
    except: pass
    try:
        scene.eevee.use_soft_shadows = True
    except: pass

    # Freestyle outline (hand-drawn look)
    try:
        scene.render.use_freestyle = True
        # Add freestyle line set
        scene.view_layers[0].freestyle_settings.linesets.new('Outline')
        ls = scene.view_layers[0].freestyle_settings.linesets[0]
        ls.select_silhouette = True
        ls.select_border = True
        # Line style
        ls.linestyle.color = (0.1, 0.05, 0.02, 1)
        ls.linestyle.thickness = 2.0
    except Exception as e:
        print(f'Freestyle not available: {e}')

    scene.world.color = (0.25, 0.25, 0.28)
    scene.render.resolution_x = 704
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    return scene, cam

# ============================================================
# POSES (more dynamic than base batch)
# ============================================================

POSES = {
    'idle': {},
    'walkA': {'leg.L': (22, 0, 0), 'leg.R': (-18, 0, 0), 'arm.L': (-15, 0, 0), 'arm.R': (15, 0, 0), 'body': (0, 0, 2)},
    'walkB': {'leg.L': (-18, 0, 0), 'leg.R': (22, 0, 0), 'arm.L': (15, 0, 0), 'arm.R': (-15, 0, 0), 'body': (0, 0, -2)},
    'attack_spear': {'body': (12, 0, 25), 'arm.R': (-100, 0, 25), 'leg.L': (-20, 0, 0), 'head': (0, 0, -8)},
    'attack_fan': {'body': (5, 0, 18), 'arm.R': (-70, 0, 15), 'arm.L': (30, 0, -10), 'head': (0, 0, 5)},
    'attack_blades': {'body': (10, 0, 20), 'arm.R': (-105, 0, 30), 'arm.L': (85, 0, -25), 'head': (0, 0, -8)},
    'skill_spear': {'body': (18, 0, 35), 'arm.R': (-130, 0, 35), 'arm.L': (-50, 0, 10), 'head': (0, 0, -12)},
    'skill_fan': {'body': (0, 0, 28), 'arm.R': (-90, 0, 30), 'arm.L': (-60, 0, -20), 'head': (0, 0, 8)},
    'skill_blades': {'body': (15, 0, 30), 'arm.R': (-140, 0, 45), 'arm.L': (100, 0, -35), 'head': (0, 0, -5)},
    'hit': {'body': (-20, 0, 8), 'head': (-15, 0, 0), 'arm.L': (20, 0, 15), 'arm.R': (-15, 0, -10)},
    'down': {'body': (0, 0, -75), 'head': (0, 0, -20), 'leg.L': (-50, 0, 0), 'leg.R': (-55, 0, 0)},
}

def apply_pose(rig, pose_dict):
    rig.animation_data_clear()
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)
    for bone, v in pose_dict.items():
        if bone in rig.pose.bones:
            rig.pose.bones[bone].rotation_euler = tuple(math.radians(n) for n in v)

def render_strip(rig, scene, pose_list, out_path):
    """Render a horizontal sprite strip from pose list."""
    n = len(pose_list)
    fw, fh = 704, 512

    # Render each pose
    import tempfile
    tmpdir = Path(tempfile.mkdtemp())
    frame_paths = []
    for i, (pname, pdict) in enumerate(pose_list):
        apply_pose(rig, pdict)
        fp = tmpdir / f'frame_{i:02d}.png'
        scene.render.resolution_x = fw
        scene.render.resolution_y = fh
        scene.render.filepath = str(fp)
        bpy.ops.render.render(write_still=True)
        frame_paths.append(str(fp))

    # Assemble using bpy image API
    total_w = fw * n
    total_h = fh
    sheet = bpy.data.images.new('sheet', total_w, total_h, alpha=True)
    pixels = [0.0] * (total_w * total_h * 4)

    for i, fp in enumerate(frame_paths):
        frame = bpy.data.images.load(fp)
        fw_actual = frame.size[0]
        fh_actual = frame.size[1]
        frame_pixels = list(frame.pixels)
        ox = i * fw + (fw - fw_actual) // 2
        oy = (fh - fh_actual) // 2

        for y in range(fh_actual):
            for x in range(fw_actual):
                src = (y * fw_actual + x) * 4
                dx = ox + x
                dy = oy + y
                if 0 <= dx < total_w and 0 <= dy < total_h:
                    dst = (dy * total_w + dx) * 4
                    pixels[dst:dst+4] = frame_pixels[src:src+4]
        bpy.data.images.remove(frame)

    sheet.pixels = pixels
    sheet.filepath_raw = str(out_path)
    sheet.file_format = 'PNG'
    sheet.save()
    bpy.data.images.remove(sheet)

    import shutil
    shutil.rmtree(tmpdir, ignore_errors=True)
    return out_path

def render_portrait(rig, scene, out_path):
    """Render square portrait."""
    apply_pose(rig, {})
    cam = scene.camera
    orig_loc = cam.location.copy()
    orig_scale = cam.data.ortho_scale
    cam.location = (cam.location.x * 0.85, cam.location.y * 0.85, cam.location.z + 0.4)
    cam.data.ortho_scale = 2.6
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    cam.location = orig_loc
    cam.data.ortho_scale = orig_scale
    scene.render.resolution_x = 704
    scene.render.resolution_y = 512

# ============================================================
# MAIN
# ============================================================

HEROES = [
    ('hero-001', '宋江', '及时雨', build_songjiang,
     ['idle', 'walkA', 'walkB', 'attack_fan', 'skill_fan', 'hit', 'down']),
    ('hero-006', '林冲', '豹子头', build_linchong,
     ['idle', 'walkA', 'walkB', 'attack_spear', 'skill_spear', 'hit', 'down']),
    ('hero-059', '扈三娘', '一丈青', build_husanniang,
     ['idle', 'walkA', 'walkB', 'attack_blades', 'skill_blades', 'hit', 'down']),
]

manifest = []
for hid, name, epithet, builder_fn, pose_names in HEROES:
    print(f'\n{"="*60}')
    print(f'Building premium: {hid} · {epithet}·{name}')
    print(f'{"="*60}')

    try:
        rig = builder_fn()
        scene, cam = setup_scene(rig)

        # Build pose list
        pose_list = [(p, POSES[p]) for p in pose_names]

        # Render action strip
        sheet_path = SHEET_DIR / f'{hid}-sheet.png'
        render_strip(rig, scene, pose_list, str(sheet_path))
        print(f'  Sheet: {sheet_path}')

        # Render portrait
        portrait_path = PORTRAIT_DIR / f'{hid}-portrait.png'
        render_portrait(rig, scene, str(portrait_path))
        print(f'  Portrait: {portrait_path}')

        # Save source blend
        src_path = SRC_DIR / f'{hid}.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(src_path))

        manifest.append({
            'id': hid, 'name': name, 'epithet': epithet,
            'sheet': f'premium/sheets/{hid}-sheet.png',
            'portrait': f'premium/portraits/{hid}-portrait.png',
            'source': f'premium/blender-src/{hid}.blend',
            'tier': 'premium_v2',
            'art_source': 'local_blender_handcrafted_eevee_freestyle',
            'status': 'pending_review',
        })
    except Exception as e:
        print(f'ERROR: {e}')
        import traceback
        traceback.print_exc()
        manifest.append({'id': hid, 'status': 'failed', 'error': str(e)})

(PREMIUM_DIR / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print(f'\nDone. {len(manifest)} premium heroes.')
print(f'Manifest: {PREMIUM_DIR / "manifest.json"}')
