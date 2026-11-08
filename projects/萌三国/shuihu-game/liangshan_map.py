"""
梁山泊大地图 v2 — Blender 生成脚本
iOS 游戏级品质 · Q 版战棋风格 · 真实水泊地貌
运行：/Applications/Blender.app/Contents/MacOS/Blender --background --python liangshan_map.py -- --render
"""

import bpy
import math
import random
import sys
import os

# ===== 清场 =====
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ===== 渲染设置（Eevee，更适合 iOS 卡通风格） =====
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 128
scene.eevee.use_taa_reprojection = True
scene.eevee.use_shadows = True
scene.eevee.shadow_resolution_scale = 2048.0
scene.eevee.volumetric_samples = 96
scene.eevee.volumetric_tile_size = '2'
scene.eevee.volumetric_shadow_samples = 32
scene.eevee.use_volumetric_shadows = True
scene.eevee.use_fast_gi = True
scene.eevee.fast_gi_method = 'GLOBAL_ILLUMINATION'
scene.eevee.fast_gi_quality = 0.3
scene.eevee.fast_gi_resolution = '4'
scene.eevee.direct_light_intensity = 1.0
scene.eevee.indirect_light_intensity = 0.4

scene.render.resolution_x = 2048
scene.render.resolution_y = 1536
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0.0

# ===== 世界（渐变天空，明亮清爽） =====
world = scene.world
if world is None:
    world = bpy.data.worlds.new('World')
    scene.world = world
world.use_nodes = True
tree = world.node_tree
links = tree.links

# 清空重建
for n in list(tree.nodes):
    tree.nodes.remove(n)

tex_coord = tree.nodes.new(type='ShaderNodeTexCoord')

grad = tree.nodes.new(type='ShaderNodeTexGradient')
grad.gradient_type = 'LINEAR'

ramp = tree.nodes.new(type='ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.97, 0.98, 1.0, 1.0)
mid = ramp.color_ramp.elements.new(0.4)
mid.color = (0.78, 0.86, 0.98, 1.0)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (0.50, 0.68, 0.92, 1.0)

bg = tree.nodes.new(type='ShaderNodeBackground')
bg.inputs[1].default_value = 1.0

out = tree.nodes.new(type='ShaderNodeOutputWorld')

# 连接：生成坐标 -> 渐变 -> 颜色映射 -> 背景 -> 输出
links.new(tex_coord.outputs['Generated'], grad.inputs['Vector'])
links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
links.new(ramp.outputs['Color'], bg.inputs['Color'])
links.new(bg.outputs['Background'], out.inputs['Surface'])

# ===== 雾 =====
world.mist_settings.use_mist = True
world.mist_settings.start = 15
world.mist_settings.depth = 45
world.mist_settings.falloff = 'QUADRATIC'

# ===== 材质工具 =====
def make_pbr(name, base_color, roughness=0.8, metallic=0.0, specular=0.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    out = nodes.new(type='ShaderNodeOutputMaterial')
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Specular IOR Level'].default_value = specular
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

# ===== 颜色 =====
MAT = {
    'grass':    make_pbr('grass',   (0.40, 0.58, 0.28, 1), roughness=0.97),
    'grass_dk': make_pbr('grass_dk',(0.30, 0.46, 0.20, 1), roughness=0.98),
    'grass_lt': make_pbr('grass_lt',(0.52, 0.68, 0.35, 1), roughness=0.95),
    'rock':     make_pbr('rock',    (0.58, 0.54, 0.48, 1), roughness=0.88),
    'rock_dk':  make_pbr('rock_dk', (0.42, 0.38, 0.32, 1), roughness=0.92),
    'water':    make_pbr('water',   (0.30, 0.58, 0.72, 1), roughness=0.35, metallic=0.15, specular=0.5),
    'sand':     make_pbr('sand',    (0.80, 0.72, 0.50, 1), roughness=0.93),
    'wood':     make_pbr('wood',    (0.55, 0.35, 0.18, 1), roughness=0.78),
    'wood_dk':  make_pbr('wood_dk', (0.38, 0.22, 0.10, 1), roughness=0.82),
    'roof':     make_pbr('roof',    (0.55, 0.15, 0.12, 1), roughness=0.85),
    'wall':     make_pbr('wall',    (0.88, 0.84, 0.74, 1), roughness=0.85),
    'gold':     make_pbr('gold',    (0.92, 0.76, 0.30, 1), roughness=0.25, metallic=0.85),
    'flag_red': make_pbr('flag_red',(0.75, 0.12, 0.10, 1), roughness=0.72),
    'tree':     make_pbr('tree',    (0.25, 0.48, 0.20, 1), roughness=0.93),
    'tree_dk':  make_pbr('tree_dk', (0.16, 0.34, 0.14, 1), roughness=0.95),
    'trunk':    make_pbr('trunk',   (0.38, 0.24, 0.13, 1), roughness=0.88),
    'path':     make_pbr('path',    (0.62, 0.55, 0.40, 1), roughness=0.92),
    'dirt':     make_pbr('dirt',    (0.45, 0.34, 0.22, 1), roughness=0.95),
    'plaster':  make_pbr('plaster', (0.82, 0.78, 0.68, 1), roughness=0.8),
    'tile':     make_pbr('tile',    (0.50, 0.18, 0.14, 1), roughness=0.75),
}

# ===== 工具函数 =====
def add_to_collection(obj, coll):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)

def smooth(obj, level=2):
    obj.modifiers.new(name='sub', type='SUBSURF')
    obj.modifiers['sub'].levels = level
    obj.modifiers['sub'].render_levels = level
    bpy.ops.object.shade_smooth()

def displace(obj, strength, noise_scale):
    disp = obj.modifiers.new(name='disp', type='DISPLACE')
    tex = bpy.data.textures.new(name=f'{obj.name}_tex', type='CLOUDS')
    tex.noise_scale = noise_scale
    tex.noise_depth = 3
    disp.texture = tex
    disp.strength = strength
    disp.mid_level = 0.5
    return disp

# ===== 水面 =====
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
water_obj = bpy.context.active_object
water_obj.name = 'water'
water_obj.data.materials.append(MAT['water'])
# 水面细分
water_obj.modifiers.new(name='sub', type='SUBSURF')
water_obj.modifiers['sub'].levels = 3
water_obj.modifiers['sub'].render_levels = 4
# 水面波纹
wave = water_obj.modifiers.new(name='wave', type='DISPLACE')
wave_tex = bpy.data.textures.new('wave_tex', type='CLOUDS')
wave_tex.noise_scale = 3.0
wave.texture = wave_tex
wave.strength = 0.12
wave.mid_level = 0.5

# ===== 梁山主体山脉 =====
# 用多个山体重叠形成真实山脉轮廓
def make_mountain(name, x, y, radius, height, mat_name='grass', noise_strength=0.25):
    bpy.ops.mesh.primitive_cone_add(
        radius1=radius, radius2=radius*0.15, depth=height,
        vertices=32, location=(x, y, height/2)
    )
    m = bpy.context.active_object
    m.name = name
    m.data.materials.append(MAT[mat_name])
    smooth(m, 2)
    # 两层置换做出真实山形
    displace(m, radius * noise_strength, radius * 0.5)
    # 再加一层细噪点
    disp2 = m.modifiers.new(name='disp2', type='DISPLACE')
    tex2 = bpy.data.textures.new(name=f'{name}_tex2', type='CLOUDS')
    tex2.noise_scale = radius * 0.15
    disp2.texture = tex2
    disp2.strength = radius * 0.08
    return m

# 主峰（最大）——山顶留一个平台给聚义厅
main_peak = make_mountain('main_peak', 0, 0, 7.0, 11.0, 'grass', 0.30)
# 山顶平台（用圆柱布尔切除山顶，做一个平地）
bpy.ops.mesh.primitive_cylinder_add(radius=2.8, depth=4, location=(0, 0, 9.5))
platform_cutter = bpy.context.active_object
platform_cutter.name = 'platform_cutter'
# 布尔差集：切掉山顶
boo = main_peak.modifiers.new(name='platform_bool', type='BOOLEAN')
boo.operation = 'DIFFERENCE'
boo.object = platform_cutter
platform_cutter.hide_viewport = True
platform_cutter.hide_render = True

# 山顶平台地面
bpy.ops.mesh.primitive_cylinder_add(radius=2.6, depth=0.3, location=(0, 0, 8.5))
peak_platform = bpy.context.active_object
peak_platform.name = 'peak_platform'
peak_platform.data.materials.append(MAT['rock'])
smooth(peak_platform, 1)
# 西峰
west_peak = make_mountain('west_peak', -6.5, -1, 4.5, 7.0, 'grass', 0.28)
# 东峰
east_peak = make_mountain('east_peak', 5.5, -2.5, 4.0, 6.0, 'grass_dk', 0.25)
# 北峰
north_peak = make_mountain('north_peak', 2, 5.5, 3.5, 5.0, 'grass', 0.22)
# 南麓小丘
south_hill = make_mountain('south_hill', 0, -6.0, 3.0, 3.5, 'grass_lt', 0.20)
# 东南小丘
se_hill = make_mountain('se_hill', 4.0, -5.0, 2.5, 3.0, 'grass_dk', 0.18)
# 西北小丘
nw_hill = make_mountain('nw_hill', -5.0, 4.0, 2.8, 3.8, 'grass', 0.22)

# ===== 岩石露头（主峰上的悬崖峭壁感） =====
rock_positions = [
    (1.5, 1.0, 5.5), (-1.2, 1.5, 5.0), (2.0, -0.5, 6.0),
    (-2.0, -1.0, 4.5), (0.5, 2.5, 4.0), (-0.8, -2.2, 5.2),
    (3.0, 0.5, 3.5), (-3.2, 0.8, 3.0), (1.0, -3.0, 2.5),
]
for i, (rx, ry, rz) in enumerate(rock_positions):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.4 + random.random()*0.5, location=(rx, ry, rz), subdivisions=2)
    rock = bpy.context.active_object
    rock.name = f'rock_{i}'
    rock.data.materials.append(MAT['rock_dk'])
    rock.rotation_euler = (random.random()*0.8, random.random()*0.8, random.random()*math.tau)
    rock.scale = (1 + random.random()*0.6, 0.7 + random.random()*0.4, 0.8 + random.random()*0.5)
    smooth(rock, 1)

# 西峰岩石
for i in range(4):
    rx = -6.5 + (random.random()-0.5)*2
    ry = -1 + (random.random()-0.5)*2
    rz = 3.5 + random.random()*2
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.3 + random.random()*0.3, location=(rx, ry, rz), subdivisions=2)
    rock = bpy.context.active_object
    rock.name = f'wrock_{i}'
    rock.data.materials.append(MAT['rock'])
    rock.rotation_euler = (random.random(), random.random(), random.random())
    smooth(rock, 1)

# ===== 聚义厅（放在主峰南坡平台） =====
def create_juyi_hall(x, y, z, scale=1.0):
    coll = bpy.data.collections.new('juyi_hall')
    bpy.context.scene.collection.children.link(coll)
    s = scale

    # 石砌台基
    bpy.ops.mesh.primitive_cylinder_add(radius=2.5*s, depth=0.5*s, location=(x, y, z+0.25*s))
    base = bpy.context.active_object
    base.name = 'hall_base'
    base.data.materials.append(MAT['rock'])
    add_to_collection(base, coll)
    smooth(base, 1)

    # 正殿
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z+0.9*s))
    body = bpy.context.active_object
    body.name = 'hall_body'
    body.scale = (3.2*s, 2.0*s, 1.0*s)
    body.data.materials.append(MAT['plaster'])
    add_to_collection(body, coll)

    # 正殿门
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y + 1.05*s, z+0.6*s))
    door = bpy.context.active_object
    door.name = 'hall_door'
    door.scale = (0.8*s, 0.1*s, 1.0*s)
    door.data.materials.append(MAT['wood_dk'])
    add_to_collection(door, coll)

    # 窗户（两侧）
    for side in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + side*1.0*s, y + 1.05*s, z+1.1*s))
        win = bpy.context.active_object
        win.name = f'window_{side}'
        win.scale = (0.4*s, 0.1*s, 0.5*s)
        win.data.materials.append(MAT['wood'])
        add_to_collection(win, coll)

    # 歇山顶（四坡顶）
    bpy.ops.mesh.primitive_cone_add(radius1=2.2*s, radius2=0.15*s, depth=1.4*s, vertices=4, location=(x, y, z+2.2*s))
    roof = bpy.context.active_object
    roof.name = 'hall_roof'
    roof.rotation_euler.z = math.pi / 4
    roof.data.materials.append(MAT['tile'])
    add_to_collection(roof, coll)
    smooth(roof, 1)

    # 正脊金饰
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z+2.95*s))
    ridge = bpy.context.active_object
    ridge.name = 'ridge_gold'
    ridge.scale = (3.6*s, 0.18*s, 0.15*s)
    ridge.data.materials.append(MAT['gold'])
    add_to_collection(ridge, coll)

    # 鸱吻（两端龙头）
    for side in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + side*1.8*s, y, z+2.5*s))
        chi = bpy.context.active_object
        chi.name = f'chiwen_{side}'
        chi.scale = (0.3*s, 0.4*s, 0.55*s)
        chi.rotation_euler = (0, 0, side*0.35)
        chi.data.materials.append(MAT['gold'])
        add_to_collection(chi, coll)

    # 山门（聚义厅前的大门）
    gate_z = z - 0.5*s
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y - 2.8*s, gate_z + 0.8*s))
    gate_body = bpy.context.active_object
    gate_body.name = 'front_gate'
    gate_body.scale = (1.6*s, 0.6*s, 1.6*s)
    gate_body.data.materials.append(MAT['wall'])
    add_to_collection(gate_body, coll)

    bpy.ops.mesh.primitive_cone_add(radius1=1.1*s, radius2=0.1*s, depth=0.6*s, vertices=4, location=(x, y - 2.8*s, gate_z + 1.8*s))
    gate_roof = bpy.context.active_object
    gate_roof.name = 'front_gate_roof'
    gate_roof.rotation_euler.z = math.pi / 4
    gate_roof.data.materials.append(MAT['tile'])
    add_to_collection(gate_roof, coll)

    # 两侧旗杆 + 红旗
    for i, side in enumerate([-1, 1]):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.04*s, depth=3.0*s, location=(x + side*2.2*s, y - 2.5*s, z + 1.2*s))
        pole = bpy.context.active_object
        pole.name = f'pole_{i}'
        pole.data.materials.append(MAT['wood_dk'])
        add_to_collection(pole, coll)

        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + side*2.2*s + 0.4*s, y - 2.5*s, z + 2.3*s))
        flag = bpy.context.active_object
        flag.name = f'flag_{i}'
        flag.scale = (0.8*s, 0.03*s, 0.5*s)
        flag.data.materials.append(MAT['flag_red'])
        add_to_collection(flag, coll)

    return coll

# 聚义厅在山顶平台上（平台 z≈8.5）
juyi = create_juyi_hall(0, 0.5, 8.65, 1.0)

# ===== 关隘（山寨门） =====
def create_gate(x, y, z, rot=0, scale=1.0):
    coll = bpy.data.collections.new(f'gate_{x:.0f}_{y:.0f}')
    bpy.context.scene.collection.children.link(coll)
    s = scale

    # 两侧碉楼
    for side in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + side*1.2*s, y, z + 1.2*s))
        tower = bpy.context.active_object
        tower.name = f'tower_{side}'
        tower.scale = (0.9*s, 0.9*s, 2.4*s)
        tower.data.materials.append(MAT['rock'])
        add_to_collection(tower, coll)
        smooth(tower, 1)

        # 楼顶（小歇山）
        bpy.ops.mesh.primitive_cone_add(radius1=0.7*s, radius2=0.08*s, depth=0.5*s, vertices=4, location=(x + side*1.2*s, y, z + 2.8*s))
        t_roof = bpy.context.active_object
        t_roof.name = f'tower_roof_{side}'
        t_roof.rotation_euler.z = math.pi / 4
        t_roof.data.materials.append(MAT['tile'])
        add_to_collection(t_roof, coll)

    # 门楼横梁
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + 2.2*s))
    beam = bpy.context.active_object
    beam.name = 'gate_beam'
    beam.scale = (3.0*s, 0.7*s, 0.5*s)
    beam.data.materials.append(MAT['wood'])
    add_to_collection(beam, coll)

    # 门楼屋顶
    bpy.ops.mesh.primitive_cone_add(radius1=1.8*s, radius2=0.1*s, depth=0.8*s, vertices=4, location=(x, y, z + 3.0*s))
    gate_roof = bpy.context.active_object
    gate_roof.name = 'gate_roof'
    gate_roof.rotation_euler.z = math.pi / 4
    gate_roof.data.materials.append(MAT['tile'])
    add_to_collection(gate_roof, coll)
    smooth(gate_roof, 1)

    # 牌匾
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y + 0.35*s, z + 2.2*s))
    plaque = bpy.context.active_object
    plaque.name = 'gate_plaque'
    plaque.scale = (0.8*s, 0.05*s, 0.35*s)
    plaque.data.materials.append(MAT['gold'])
    add_to_collection(plaque, coll)

    return coll

# 南山门（主入口，在山脚沙滩环上）
south_gate = create_gate(0, -6.0, 0.6, 0, 1.0)

# ===== 山道（蜿蜒上山的石阶路） =====
def create_mountain_path():
    path = bpy.data.curves.new('mountain_path', type='CURVE')
    path.dimensions = '3D'
    path.bevel_depth = 0.35
    path.bevel_resolution = 3
    path.resolution_u = 12

    spline = path.splines.new(type='BEZIER')
    points = [
        (0, -5.8, 0.6),    # 南山门
        (0.8, -4.8, 1.5),
        (-0.5, -3.8, 2.5),
        (1.0, -2.5, 3.6),
        (-0.8, -1.2, 4.8),
        (0.6, 0.0, 6.0),
        (-0.3, 1.0, 7.2),
        (0, 0.8, 8.5),     # 山顶平台
    ]
    spline.bezier_points.add(len(points) - 1)
    for i, (px, py, pz) in enumerate(points):
        bp = spline.bezier_points[i]
        bp.co = (px, py, pz)
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'

    obj = bpy.data.objects.new('mountain_path', path)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(MAT['dirt'])
    return obj

mountain_path = create_mountain_path()

# ===== 树木 =====
def create_tree(x, y, z, scale=1.0):
    s = scale
    # 树干
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08*s, depth=0.9*s, location=(x, y, z + 0.45*s))
    trunk = bpy.context.active_object
    trunk.name = f'trunk_{x:.1f}_{y:.1f}'
    trunk.data.materials.append(MAT['trunk'])

    # 树冠（Q 版：三层球叠加）
    layers = [
        (0.0, 1.0, 0.40, 'tree'),
        (0.0, 1.3, 0.32, 'tree_dk'),
        (0.0, 1.55, 0.22, 'tree'),
    ]
    for i, (ox, oy, r, mat_name) in enumerate(layers):
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=r*s, subdivisions=2,
            location=(x + ox*s, y, z + oy*s)
        )
        leaf = bpy.context.active_object
        leaf.name = f'leaf_{x:.1f}_{y:.1f}_{i}'
        leaf.data.materials.append(MAT[mat_name])
        leaf.scale = (1.0*s, 1.0*s, 0.8*s)
        smooth(leaf, 1)
    return trunk

# 在山脚下和岛上种树，避开水面和建筑
random.seed(123)
tree_positions = []

# 沿山脚种一圈
for i in range(60):
    ang = i / 60 * math.tau + random.gauss(0, 0.15)
    r = 7.5 + random.random() * 2.5
    x = math.cos(ang) * r
    y = math.sin(ang) * r
    # 计算地面高度（近似：距离山中心越远越低）
    dist = math.sqrt(x*x + y*y)
    if dist < 5:
        continue
    if dist > 10:
        # 岛上/远处的树，高度设为 0（在水面上的小丘）
        z = 0.3
    else:
        z = max(0.5, 8.0 * (1 - dist/10.0) - 1)
    tree_positions.append((x, y, z))

# 远处几个岛上也种
islands = [
    (-13, -5, 2.5),
    (12, -8, 2.0),
    (-10, 8, 1.8),
    (10, 6, 2.2),
    (-15, 2, 1.5),
]
for ix, iy, ir in islands:
    for i in range(8):
        ang = random.random() * math.tau
        r = random.random() * ir * 0.7
        tx = ix + math.cos(ang) * r
        ty = iy + math.sin(ang) * r
        tree_positions.append((tx, ty, 0.5))

# 去重 + 种树
planted = 0
for (x, y, z) in tree_positions:
    # 避开建筑区
    if abs(x) < 3 and abs(y - 1.5) < 4:  # 聚义厅
        continue
    if abs(x) < 2 and abs(y + 4.2) < 2:  # 南山门
        continue
    scale = 0.6 + random.random() * 0.6
    create_tree(x, y, z, scale)
    planted += 1
    if planted > 120:
        break

# ===== 码头 =====
def create_dock(x, y, rot, scale=1.0):
    coll = bpy.data.collections.new(f'dock_{x:.0f}')
    bpy.context.scene.collection.children.link(coll)
    s = scale

    # 平台
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, 0.2))
    plat = bpy.context.active_object
    plat.name = 'dock_platform'
    plat.scale = (1.8*s, 3.5*s, 0.4*s)
    plat.rotation_euler.z = rot
    plat.data.materials.append(MAT['wood'])
    add_to_collection(plat, coll)

    # 木桩支撑
    for i in range(5):
        for j in range(2):
            dx = (i - 2) * 0.7 * s
            dy = (j - 0.5) * 1.5 * s
            px = x + dx * math.cos(rot) - dy * math.sin(rot)
            py = y + dx * math.sin(rot) + dy * math.cos(rot)
            bpy.ops.mesh.primitive_cylinder_add(radius=0.07*s, depth=0.8*s, location=(px, py, -0.2*s))
            post = bpy.context.active_object
            post.name = f'post_{i}_{j}'
            post.data.materials.append(MAT['wood_dk'])
            add_to_collection(post, coll)

    # 小船（停在码头边）
    boat_x = x + 2.5*s * math.cos(rot)
    boat_y = y + 2.5*s * math.sin(rot)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(boat_x, boat_y, 0.08))
    boat = bpy.context.active_object
    boat.name = 'boat_hull'
    boat.scale = (0.7*s, 1.4*s, 0.3*s)
    boat.rotation_euler.z = rot
    boat.data.materials.append(MAT['wood'])
    add_to_collection(boat, coll)
    smooth(boat, 1)

    # 船篷
    bpy.ops.mesh.primitive_cylinder_add(radius=0.35*s, depth=0.9*s, vertices=10, location=(boat_x, boat_y, 0.4))
    canopy = bpy.context.active_object
    canopy.name = 'boat_canopy'
    canopy.rotation_euler = (math.pi/2, 0, rot)
    canopy.scale = (1, 1, 0.5)
    canopy.data.materials.append(MAT['tile'])
    add_to_collection(canopy, coll)

    # 桅杆
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04*s, depth=1.8*s, location=(boat_x, boat_y, 1.1))
    mast = bpy.context.active_object
    mast.name = 'boat_mast'
    mast.data.materials.append(MAT['wood_dk'])
    add_to_collection(mast, coll)

    return coll

# 南岸码头（主码头）
south_dock = create_dock(0, -12, 0, 1.0)
# 东岸码头
east_dock = create_dock(12, -3, math.pi/2, 0.9)

# ===== 芦苇荡（水泊点缀） =====
for i in range(30):
    ang = random.random() * math.tau
    r = 10 + random.random() * 15
    x = math.cos(ang) * r
    y = math.sin(ang) * r
    # 靠近山的不要
    if math.sqrt(x*x + y*y) < 8:
        continue
    # 一小丛
    for j in range(6):
        rx = x + (random.random()-0.5) * 1.5
        ry = y + (random.random()-0.5) * 1.5
        h = 0.4 + random.random() * 0.6
        bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=h, location=(rx, ry, h/2))
        reed = bpy.context.active_object
        reed.name = f'reed_{i}_{j}'
        reed.data.materials.append(MAT['grass_dk'])

# ===== 沙滩（山脚水边过渡带） =====
bpy.ops.mesh.primitive_torus_add(major_radius=8.5, minor_radius=0.8, location=(0, 0, 0.05))
sand_ring = bpy.context.active_object
sand_ring.name = 'sand_ring'
sand_ring.data.materials.append(MAT['sand'])
# 压扁成环形沙滩
sand_ring.scale = (1, 1, 0.3)
displace(sand_ring, 0.2, 1.5)

# ===== 灯光 =====
# 主光（明亮午后阳光）
sun = bpy.data.lights.new(name='sun', type='SUN')
sun.energy = 12.0
sun.color = (1.0, 0.96, 0.88)
sun_obj = bpy.data.objects.new('sun', sun)
sun_obj.location = (10, -10, 15)
sun_obj.rotation_euler = (math.radians(55), 0, math.radians(50))
bpy.context.scene.collection.objects.link(sun_obj)
sun.shadow_soft_size = 0.6
sun.use_shadow = True

# 天光补光
sky = bpy.data.lights.new(name='sky_fill', type='SUN')
sky.energy = 5.0
sky.color = (0.75, 0.85, 1.0)
sky_obj = bpy.data.objects.new('sky_fill', sky)
sky_obj.location = (-8, 8, 10)
sky_obj.rotation_euler = (math.radians(55), 0, math.radians(-110))
bpy.context.scene.collection.objects.link(sky_obj)

# 环境光
amb = bpy.data.lights.new(name='ambient', type='AREA')
amb.energy = 1200
amb.size = 35
amb.color = (0.92, 0.95, 1.0)
amb_obj = bpy.data.objects.new('ambient', amb)
amb_obj.location = (0, 0, 18)
bpy.context.scene.collection.objects.link(amb_obj)

# 底部补光
bottom = bpy.data.lights.new(name='bottom_fill', type='AREA')
bottom.energy = 300
bottom.size = 25
bottom.color = (0.88, 0.92, 1.0)
bottom_obj = bpy.data.objects.new('bottom_fill', bottom)
bottom_obj.location = (0, -5, 1)
bottom_obj.rotation_euler = (math.radians(80), 0, 0)
bpy.context.scene.collection.objects.link(bottom_obj)

# ===== 相机（鸟瞰斜 45°） =====
cam = bpy.data.cameras.new(name='cam_main')
cam.type = 'PERSP'
cam.lens = 28  # 更广角，容纳全景
cam.dof.focus_distance = 30
cam.dof.aperture_fstop = 22.0  # 大景深，地图要全清
cam_obj = bpy.data.objects.new('cam_main', cam)
# 高角度鸟瞰
cam_obj.location = (26, -26, 22)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# 用空物体 + Track To 约束确保一定对准
target_obj = bpy.data.objects.new('cam_target', None)
target_obj.location = (0, -1, 4)
bpy.context.scene.collection.objects.link(target_obj)

track = cam_obj.constraints.new(type='TRACK_TO')
track.target = target_obj
track.track_axis = 'TRACK_NEGATIVE_Z'
track.up_axis = 'UP_Y'

# ===== 渲染 =====
if '--render' in sys.argv:
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'liangshan_map.png')
    scene.render.filepath = out_path
    print(f'开始渲染 → {out_path}')
    print(f'分辨率: {scene.render.resolution_x}x{scene.render.resolution_y}')
    print(f'采样: {scene.cycles.samples}')
    bpy.ops.render.render(write_still=True)
    print('渲染完成')
else:
    print('场景构建完成。添加 --render 参数以渲染。')
    print(f'物体数量: {len(bpy.data.objects)}')
