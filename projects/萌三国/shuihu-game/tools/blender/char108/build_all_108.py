#!/usr/bin/env python3
"""Generate all 108 Water Margin heroes as Q-version 3D characters in Blender.

Builds on build_heroes.py (prototype rig) with expanded weapon types,
hairstyles, headgear, body types and color palettes. Renders a 7-frame
action strip per hero plus a portrait still, then writes them into
assets/releases/CHAR-108/ ready for game integration.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/char108/build_all_108.py

Rendering 108 heroes * 8 frames each at 16 samples Cycles takes a while;
estimate ~5-8 minutes per hero on a Mac, so plan accordingly. Use
--start N --end M to process a range.
"""
import bpy, math, json, sys, os
from pathlib import Path
from mathutils import Vector

# ---------- paths ----------
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets' / 'releases' / 'CHAR-108'
SRC = ROOT / 'assets' / 'releases' / 'CHAR-108' / 'blender-src'
SHEET_DIR = OUT / 'sheets'
PORTRAIT_DIR = OUT / 'portraits'
for d in [SRC, SHEET_DIR, PORTRAIT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ---------- args ----------
start_rank = 1
end_rank = 108
argv = sys.argv
if '--' in argv:
    args = argv[argv.index('--')+1:]
    for i, a in enumerate(args):
        if a == '--start' and i+1 < len(args): start_rank = int(args[i+1])
        if a == '--end' and i+1 < len(args): end_rank = int(args[i+1])

# ---------- 108 hero roster with visual traits ----------
# weapon types supported below:
#   spear, sword, bow, staff, axe, twin_swords, twin_axes, hammer,
#   whip, dart, fan, brush, lute, dagger, shield, crutch, rake,
#   spear_pair, chain, arrow_sleeve, knife, hook
# headgear: topknot, bandana, helmet, hat_daoist, hat_broad, hat_official,
#           hair_bun_female, crown, hood, scarf
# body_type: average, stocky, slim, tall, short, muscular
# complexion: fair, tan, dark, swarthy
# beard: none, moustache, full_beard, goatee, long_beard
# face_mark: none, scar, tattoo, birthmark, eye_patch
# female overrides body_type and beard

SEATS = [
    (1,'宋江','及时雨','sword','hat_official','average','fair','goatee','none','男'),
    (2,'卢俊义','玉麒麟','spear','helmet','tall','fair','full_beard','none','男'),
    (3,'吴用','智多星','fan','hat_official','slim','fair','none','none','男'),
    (4,'公孙胜','入云龙','sword','hat_daoist','average','fair','long_beard','none','男'),
    (5,'关胜','大刀','sword','helmet','tall','tan','long_beard','none','男'),
    (6,'林冲','豹子头','spear','helmet','average','fair','moustache','scar','男'),
    (7,'秦明','霹雳火','spear','helmet','muscular','tan','moustache','none','男'),
    (8,'呼延灼','双鞭','whip','helmet','average','tan','moustache','none','男'),
    (9,'花荣','小李广','bow','helmet','slim','fair','none','none','男'),
    (10,'柴进','小旋风','sword','hat_official','average','fair','moustache','none','男'),
    (11,'李应','扑天雕','spear','helmet','average','tan','moustache','none','男'),
    (12,'朱仝','美髯公','spear','helmet','average','fair','long_beard','none','男'),
    (13,'鲁智深','花和尚','staff','hood','muscular','dark','none','tattoo','男'),
    (14,'武松','行者','dagger','hood','muscular','tan','none','scar','男'),
    (15,'董平','双枪将','spear_pair','helmet','average','fair','moustache','none','男'),
    (16,'张清','没羽箭','dart','helmet','slim','fair','none','none','男'),
    (17,'杨志','青面兽','spear','helmet','average','swarthy','moustache','birthmark','男'),
    (18,'徐宁','金枪手','spear','helmet','average','fair','moustache','none','男'),
    (19,'索超','急先锋','axe','helmet','muscular','tan','moustache','none','男'),
    (20,'戴宗','神行太保','dagger','hat_broad','slim','tan','none','none','男'),
    (21,'刘唐','赤发鬼','sword','bandana','muscular','dark','moustache','birthmark','男'),
    (22,'李逵','黑旋风','twin_axes','bandana','stocky','dark','none','none','男'),
    (23,'史进','九纹龙','spear','topknot','muscular','tan','none','tattoo','男'),
    (24,'穆弘','没遮拦','spear','helmet','average','tan','moustache','none','男'),
    (25,'雷横','插翅虎','sword','helmet','stocky','tan','moustache','none','男'),
    (26,'李俊','混江龙','sword','hat_broad','average','tan','moustache','none','男'),
    (27,'阮小二','立地太岁','spear','bandana','stocky','dark','moustache','none','男'),
    (28,'张横','船火儿','sword','bandana','average','tan','moustache','none','男'),
    (29,'阮小五','短命二郎','spear','bandana','slim','dark','moustache','none','男'),
    (30,'张顺','浪里白条','dagger','topknot','slim','fair','none','none','男'),
    (31,'阮小七','活阎罗','spear','bandana','muscular','dark','moustache','none','男'),
    (32,'杨雄','病关索','sword','helmet','average','pale','moustache','none','男'),
    (33,'石秀','拼命三郎','sword','bandana','muscular','tan','none','scar','男'),
    (34,'解珍','两头蛇','spear','hat_broad','average','tan','none','none','男'),
    (35,'解宝','双尾蝎','spear','hat_broad','stocky','dark','none','none','男'),
    (36,'燕青','浪子','dart','topknot','slim','fair','none','tattoo','男'),
    (37,'朱武','神机军师','sword','hat_daoist','average','fair','goatee','none','男'),
    (38,'黄信','镇三山','sword','helmet','average','tan','moustache','none','男'),
    (39,'孙立','病尉迟','spear','helmet','tall','fair','moustache','none','男'),
    (40,'宣赞','丑郡马','sword','helmet','stocky','swarthy','moustache','birthmark','男'),
    (41,'郝思文','井木犴','spear','helmet','average','tan','moustache','none','男'),
    (42,'韩滔','百胜将','spear','helmet','average','fair','moustache','none','男'),
    (43,'彭玘','天目将','spear','helmet','average','tan','moustache','none','男'),
    (44,'单廷珪','圣水将','spear','helmet','average','fair','goatee','none','男'),
    (45,'魏定国','神火将','spear','helmet','muscular','tan','moustache','none','男'),
    (46,'萧让','圣手书生','brush','hat_official','slim','fair','goatee','none','男'),
    (47,'裴宣','铁面孔目','sword','hat_official','average','fair','full_beard','none','男'),
    (48,'欧鹏','摩云金翅','spear','helmet','tall','tan','moustache','none','男'),
    (49,'邓飞','火眼狻猊','chain','bandana','muscular','swarthy','moustache','birthmark','男'),
    (50,'燕顺','锦毛虎','sword','bandana','average','tan','moustache','none','男'),
    (51,'杨林','锦豹子','spear','hat_broad','slim','tan','none','none','男'),
    (52,'凌振','轰天雷','hammer','helmet','stocky','tan','moustache','none','男'),
    (53,'蒋敬','神算子','brush','hat_official','slim','fair','goatee','none','男'),
    (54,'吕方','小温侯','spear','helmet','average','fair','moustache','none','男'),
    (55,'郭盛','赛仁贵','spear','helmet','average','fair','moustache','none','男'),
    (56,'安道全','神医','brush','hat_official','slim','fair','goatee','none','男'),
    (57,'皇甫端','紫髯伯','dagger','hat_official','average','fair','long_beard','none','男'),
    (58,'王英','矮脚虎','spear','bandana','short','tan','moustache','none','男'),
    (59,'扈三娘','一丈青','twin_swords','hair_bun_female','slim','fair','none','none','女'),
    (60,'鲍旭','丧门神','sword','bandana','tall','swarthy','full_beard','scar','男'),
    (61,'樊瑞','混世魔王','sword','hat_daoist','average','dark','full_beard','none','男'),
    (62,'孔明','毛头星','spear','topknot','average','tan','none','none','男'),
    (63,'孔亮','独火星','spear','topknot','slim','tan','none','none','男'),
    (64,'项充','八臂哪吒','spear','helmet','muscular','fair','moustache','none','男'),
    (65,'李衮','飞天大圣','sword','helmet','muscular','fair','moustache','none','男'),
    (66,'金大坚','玉臂匠','hammer','hat_broad','stocky','fair','goatee','none','男'),
    (67,'马麟','铁笛仙','sword','hat_broad','slim','fair','goatee','none','男'),
    (68,'童威','出洞蛟','spear','bandana','average','tan','none','none','男'),
    (69,'童猛','翻江蜃','spear','bandana','stocky','tan','none','none','男'),
    (70,'孟康','玉幡竿','spear','hat_broad','tall','fair','none','none','男'),
    (71,'侯健','通臂猿','dagger','hat_broad','slim','tan','none','none','男'),
    (72,'陈达','跳涧虎','spear','bandana','average','tan','moustache','none','男'),
    (73,'杨春','白花蛇','spear','bandana','slim','pale','moustache','none','男'),
    (74,'郑天寿','白面郎君','sword','topknot','slim','fair','none','none','男'),
    (75,'陶宗旺','九尾龟','rake','bandana','stocky','dark','none','none','男'),
    (76,'宋清','铁扇子','fan','hat_official','slim','fair','none','none','男'),
    (77,'乐和','铁叫子','lute','hat_official','slim','fair','none','none','男'),
    (78,'龚旺','花项虎','spear','helmet','muscular','tan','moustache','tattoo','男'),
    (79,'丁得孙','中箭虎','spear','helmet','average','tan','moustache','scar','男'),
    (80,'穆春','小遮拦','sword','bandana','slim','tan','none','none','男'),
    (81,'曹正','操刀鬼','knife','bandana','average','tan','moustache','none','男'),
    (82,'宋万','云里金刚','sword','helmet','tall','tan','full_beard','none','男'),
    (83,'杜迁','摸着天','spear','helmet','tall_slim','pale','moustache','none','男'),
    (84,'薛永','病大虫','sword','bandana','average','pale','moustache','none','男'),
    (85,'施恩','金眼彪','sword','hat_broad','average','fair','none','none','男'),
    (86,'李忠','打虎将','spear','hat_broad','average','tan','moustache','none','男'),
    (87,'周通','小霸王','spear','bandana','stocky','tan','moustache','none','男'),
    (88,'汤隆','金钱豹子','hammer','bandana','stocky','swarthy','moustache','birthmark','男'),
    (89,'杜兴','鬼脸儿','dagger','hat_broad','slim','swarthy','none','birthmark','男'),
    (90,'邹渊','出林龙','sword','bandana','average','dark','full_beard','none','男'),
    (91,'邹润','独角龙','spear','bandana','stocky','dark','moustache','birthmark','男'),
    (92,'朱贵','旱地忽律','dagger','hat_broad','average','tan','moustache','none','男'),
    (93,'朱富','笑面虎','dagger','hat_broad','slim','fair','none','none','男'),
    (94,'蔡福','铁臂膊','sword','hat_broad','muscular','tan','moustache','none','男'),
    (95,'蔡庆','一枝花','sword','hat_broad','average','fair','moustache','none','男'),
    (96,'李立','催命判官','sword','bandana','tall','swarthy','full_beard','none','男'),
    (97,'李云','青眼虎','sword','hat_broad','average','fair','moustache','none','男'),
    (98,'焦挺','没面目','fist','topknot','muscular','swarthy','moustache','birthmark','男'),
    (99,'石勇','石将军','dagger','bandana','stocky','tan','moustache','none','男'),
    (100,'孙新','小尉迟','spear','helmet','average','fair','moustache','none','男'),
    (101,'顾大嫂','母大虫','twin_swords','hair_bun_female','stocky','tan','none','none','女'),
    (102,'张青','菜园子','rake','bandana','average','tan','moustache','none','男'),
    (103,'孙二娘','母夜叉','dagger','hair_bun_female','slim','pale','none','none','女'),
    (104,'王定六','活闪婆','dagger','hat_broad','slim','tan','none','none','男'),
    (105,'郁保四','险道神','axe','bandana','tall_muscular','tan','moustache','none','男'),
    (106,'白胜','白日鼠','dagger','bandana','slim','tan','none','birthmark','男'),
    (107,'时迁','鼓上蚤','dagger','hood','slim','swarthy','none','none','男'),
    (108,'段景住','金毛犬','dagger','hat_broad','slim','fair','moustache','birthmark','男'),
]

# ---------- color palettes per quality ----------
PALETTES = {
    'diamond': {'cloth':(0.10, 0.22, 0.45, 1), 'accent':(0.85, 0.65, 0.15, 1), 'metal':0.8},
    'red':     {'cloth':(0.55, 0.10, 0.10, 1), 'accent':(0.90, 0.75, 0.20, 1), 'metal':0.7},
    'purple':  {'cloth':(0.35, 0.18, 0.55, 1), 'accent':(0.75, 0.55, 0.20, 1), 'metal':0.5},
    'blue':    {'cloth':(0.18, 0.38, 0.55, 1), 'accent':(0.65, 0.55, 0.30, 1), 'metal':0.4},
}

QUALITY_BY_RANK = {}
dark = {1,2,3,4,5,6,9,13,14,22,26,30,36,59}
red = {7,8,10,11,12,15,16,17,18,19,20,21,23,24,25,27,28,29,31,32,33,34,35}
for r in range(1, 109):
    if r in dark: QUALITY_BY_RANK[r] = 'diamond'
    elif r in red: QUALITY_BY_RANK[r] = 'red'
    elif r <= 72: QUALITY_BY_RANK[r] = 'purple'
    else: QUALITY_BY_RANK[r] = 'blue'

# Hue offsets per rank for variety (within quality color family)
HUE_OFFSETS = [(r * 137.508) % 360 for r in range(108)]  # golden angle spread

def adjust_hue(rgba, hue_shift_deg):
    """Shift hue of an RGBA color in HSV space."""
    r, g, b, a = rgba
    mx = max(r, g, b)
    mn = min(r, g, b)
    v = mx
    d = mx - mn
    if d < 1e-6:
        return (r, g, b, a)
    s = d / mx
    # compute hue
    if mx == r: h = ((g - b) / d) % 6
    elif mx == g: h = (b - r) / d + 2
    else: h = (r - g) / d + 4
    h = (h * 60 + hue_shift_deg) % 360
    h /= 60
    i = int(h)
    f = h - i
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    if i == 0: return (v, t, p, a)
    elif i == 1: return (q, v, p, a)
    elif i == 2: return (p, v, t, a)
    elif i == 3: return (p, q, v, a)
    elif i == 4: return (t, p, v, a)
    else: return (v, p, q, a)

COMPLEXIONS = {
    'fair': (0.92, 0.72, 0.55, 1),
    'tan': (0.78, 0.55, 0.35, 1),
    'dark': (0.45, 0.32, 0.22, 1),
    'swarthy': (0.55, 0.38, 0.25, 1),
    'pale': (0.95, 0.82, 0.72, 1),
}

HAIR_COLORS = {
    'black': (0.05, 0.05, 0.07, 1),
    'brown': (0.25, 0.15, 0.08, 1),
    'gray': (0.55, 0.55, 0.58, 1),
    'red': (0.55, 0.20, 0.10, 1),
    'blonde': (0.85, 0.72, 0.45, 1),
}

# ---------- bone skeleton ----------
BONES = {
    'root': ((0,0,0),(0,0,.3),None),
    'body': ((0,0,1),(0,0,1.7),'root'),
    'head': ((0,0,1.68),(0,0,2.5),'body'),
    'eyes': ((0,-.53,2.25),(0,-.53,2.4),'head'),
    'arm.L': ((-.43,0,1.57),(-.66,0,1.15),'body'),
    'hand.L': ((-.66,0,1.15),(-.7,-.05,.93),'arm.L'),
    'arm.R': ((.43,0,1.57),(.66,0,1.15),'body'),
    'hand.R': ((.66,0,1.15),(.7,-.05,.93),'arm.R'),
    'leg.L': ((-.22,0,1),(-.22,0,.56),'root'),
    'foot.L': ((-.22,0,.56),(-.22,-.06,.16),'leg.L'),
    'leg.R': ((.22,0,1),(.22,0,.56),'root'),
    'foot.R': ((.22,0,.56),(.22,-.06,.16),'leg.R'),
}

# ---------- helpers ----------
def material(name, c, metal=0, roughness=0.58):
    m = bpy.data.materials.new(name)
    m.diffuse_color = c
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = c
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return m

def attach(o, name, mat, bone=None, rig_obj=None):
    o.name = name
    o.data.materials.append(mat)
    for face in o.data.polygons: face.use_smooth = True
    if bone and rig_obj:
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1, 'REPLACE')
        mod = o.modifiers.new('Rigid bone binding', 'ARMATURE')
        mod.object = rig_obj
        o.parent = rig_obj
    return o

def ball(name, loc, scale, mat, bone=None, rig_obj=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(o, name, mat, bone, rig_obj)

def rod(name, a, b, r, mat, bone=None, rig_obj=None, r2=None):
    d = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=r, radius2=r if r2 is None else r2,
                                     depth=d.length, location=(Vector(a)+Vector(b))/2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return attach(o, name, mat, bone, rig_obj)

def line(name, points, r, mat, bone, rig_obj):
    for i in range(len(points)-1):
        rod(name+str(i), points[i], points[i+1], r, mat, bone, rig_obj)

# ---------- pose / animation ----------
def pose_bones(rig, frame, values):
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0,0,0)
        b.location = (0,0,0)
        b.scale = (1,1,1)
    for bone, v in values.items():
        if bone in rig.pose.bones:
            b = rig.pose.bones[bone]
            b.rotation_euler = tuple(math.radians(n) for n in v)
    for b in rig.pose.bones:
        b.keyframe_insert('rotation_euler', frame=frame)
        b.keyframe_insert('location', frame=frame)
        b.keyframe_insert('scale', frame=frame)

def make_action(rig, name, keys):
    rig.animation_data_create()
    rig.animation_data.action = None
    for f, v in keys:
        pose_bones(rig, f, v)
    action = rig.animation_data.action
    action.name = name
    action.use_fake_user = True
    return action

# ---------- build character ----------
def build_character(rank, name, epithet, weapon, headgear, body_type, complexion, beard, face_mark, gender):
    # clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)

    quality = QUALITY_BY_RANK[rank]
    pal = PALETTES[quality]
    hue_shift = HUE_OFFSETS[rank-1] * 0.25 - 45  # ±45° spread
    cloth_color = adjust_hue(pal['cloth'], hue_shift)
    accent_color = adjust_hue(pal['accent'], -hue_shift*0.3)
    metalness = pal['metal']

    skin = material('Skin', COMPLEXIONS[complexion])
    hair_color = HAIR_COLORS['black']
    # older / special heroes get gray hair
    if rank in [3, 4, 12, 57]:  # 吴用/公孙胜/朱仝/皇甫端
        hair_color = HAIR_COLORS['gray']
    if rank in [21, 49]:  # 刘唐/邓飞 - red hair implied
        hair_color = HAIR_COLORS['red']
    hair = material('Hair', hair_color)
    white = material('Ivory', (0.92, 0.86, 0.70, 1))
    gold = material('Gold', (0.75, 0.52, 0.15, 1), 0.6, 0.35)
    dark = material('Leather', (0.06, 0.07, 0.09, 1))
    cloth = material('Cloth', cloth_color)
    accent = material('Accent', accent_color)
    steel = material('Steel', (0.55, 0.68, 0.74, 1), 0.8, 0.3)
    wood = material('Wood', (0.45, 0.30, 0.15, 1), 0, 0.75)

    # body type scales
    body_scales = {
        'average':  (1.0, 1.0, 1.0),
        'stocky':   (1.15, 1.0, 0.90),
        'slim':     (0.88, 0.95, 1.02),
        'tall':     (0.95, 0.95, 1.12),
        'short':    (0.90, 0.95, 0.82),
        'muscular': (1.10, 1.15, 1.02),
        'tall_slim':    (0.85, 0.90, 1.18),
        'tall_muscular': (1.05, 1.10, 1.16),
    }
    bs = body_scales.get(body_type, (1,1,1))

    # armature
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = f'hero_{rank:03d}_rig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    for bname, (head, tail, parent) in BONES.items():
        b = rig.data.edit_bones.new(bname)
        # apply body type height scale to y (vertical in blender coords we use z)
        bh = (head[0]*bs[0], head[1]*bs[1], head[2]*bs[2])
        bt = (tail[0]*bs[0], tail[1]*bs[1], tail[2]*bs[2])
        b.head = bh
        b.tail = bt
        if parent:
            b.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front = True

    hx = bs[0]  # horizontal scale
    hy = bs[1]
    hz = bs[2]  # vertical scale

    # Torso / robe
    ball('Robe torso', (0, 0, 1.34*hz), (0.46*hx, 0.29*hy, 0.53*hz), cloth, 'body', rig)
    rod('Robe skirt', (0, 0, 0.7*hz), (0, 0, 1.12*hz), 0.44*hx, cloth, 'body', rig, 0.35*hx)
    ball('Belt', (0, -0.005, 1.03*hz), (0.445*hx, 0.31*hy, 0.08*hz), dark, 'body', rig)
    ball('Belt medallion', (0, -0.32, 1.04*hz), (0.10*hx, 0.035*hy, 0.10*hz), gold, 'body', rig)
    line('Cross collar',
         [(-0.27*hx, -0.25*hy, 1.73*hz),
          (0.12*hx, -0.31*hy, 1.43*hz),
          (0.20*hx, -0.29*hy, 1.15*hz)],
         0.044, white, 'body', rig)
    line('Collar trim',
         [(0.27*hx, -0.25*hy, 1.73*hz),
          (-0.12*hx, -0.31*hy, 1.43*hz),
          (-0.16*hx, -0.29*hy, 1.18*hz)],
         0.025, gold, 'body', rig)

    # Legs / boots
    for side, x in [('L', -0.22), ('R', 0.22)]:
        x *= hx
        rod('Trousers '+side, (x, 0, 0.96*hz), (x, 0, 0.53*hz), 0.15*hx, dark, 'leg.'+side, rig)
        rod('Boot shaft '+side, (x, 0, 0.55*hz), (x, -0.02*hy, 0.19*hz), 0.15*hx, dark, 'foot.'+side, rig)
        ball('Boot toe '+side, (x, -0.115*hy, 0.15*hz), (0.16*hx, 0.27*hy, 0.14*hz), dark, 'foot.'+side, rig)
        rod('Boot cuff '+side, (x, 0, 0.51*hz), (x, 0, 0.56*hz), 0.16*hx, gold, 'foot.'+side, rig)

    # Arms
    for side, sign in [('L', -1), ('R', 1)]:
        s = sign
        rod('Sleeve '+side, (s*0.43*hx, 0, 1.55*hz), (s*0.66*hx, 0, 1.15*hz),
            0.19*hx, cloth, 'arm.'+side, rig, 0.14*hx)
        shoulder_mat = gold if weapon in ('spear','spear_pair','axe','twin_axes','hammer','staff','whip','chain','crutch','hook') else cloth
        ball('Shoulder '+side, (s*0.43*hx, 0, 1.53*hz), (0.22*hx, 0.23*hy, 0.19*hz),
             shoulder_mat, 'arm.'+side, rig)
        rod('Sleeve cuff '+side, (s*0.65*hx, 0, 1.19*hz), (s*0.68*hx, 0, 1.10*hz),
            0.15*hx, white, 'hand.'+side, rig)
        ball('Hand '+side, (s*0.69*hx, -0.02*hy, 1.04*hz), (0.12*hx, 0.13*hy, 0.15*hz),
             skin, 'hand.'+side, rig)

    # Head
    head_y = 2.13 * hz
    head_sx = 0.57 * hx
    head_sy = 0.43 * hy
    head_sz = 0.61 * hz
    if gender == '女':
        head_sx = 0.50 * hx
        head_sz = 0.55 * hz
    ball('Head', (0, 0, head_y), (head_sx, head_sy, head_sz), skin, 'head', rig)

    # Hair
    ball('Hair cap', (0, 0.055*hy, 2.4*hz), (0.59*hx, 0.43*hy, 0.39*hz), hair, 'head', rig)
    for sign in [-1, 1]:
        ball('Ear', (sign*0.55*hx, 0, 2.12*hz), (0.10*hx, 0.09*hy, 0.15*hz), skin, 'head', rig)
        # Eyes
        if gender != '女':
            ball('Eye white', (sign*0.21*hx, -0.393*hy, 2.18*hz), (0.14*hx, 0.055*hy, 0.17*hz), white, 'eyes', rig)
            ball('Iris', (sign*0.21*hx, -0.441*hy, 2.17*hz), (0.083*hx, 0.026*hy, 0.12*hz), hair, 'eyes', rig)
            ball('Eye glint', (sign*0.19*hx, -0.466*hy, 2.21*hz), (0.025*hx, 0.013*hy, 0.035*hz), white, 'eyes', rig)
        else:
            # bigger eyes for female
            ball('Eye white', (sign*0.22*hx, -0.393*hy, 2.18*hz), (0.17*hx, 0.06*hy, 0.20*hz), white, 'eyes', rig)
            ball('Iris', (sign*0.22*hx, -0.445*hy, 2.17*hz), (0.10*hx, 0.03*hy, 0.14*hz), hair, 'eyes', rig)
            ball('Eye glint', (sign*0.20*hx, -0.47*hy, 2.21*hz), (0.03*hx, 0.015*hy, 0.04*hz), white, 'eyes', rig)
        line('Brow', [(sign*0.09*hx, -0.425*hy, 2.39*hz), (sign*0.33*hx, -0.39*hy, 2.41*hz)], 0.032, hair, 'head', rig)
        # Cheek blush for female / accent for male
        if gender == '女':
            ball('Cheek blush', (sign*0.32*hx, -0.35*hy, 2.00*hz), (0.10*hx, 0.03*hy, 0.06*hz), accent, 'head', rig)
        else:
            ball('Cheek', (sign*0.34*hx, -0.35*hy, 2.00*hz), (0.08*hx, 0.027*hy, 0.04*hz), accent, 'head', rig)

    ball('Nose', (0, -0.44*hy, 2.05*hz), (0.065*hx, 0.07*hy, 0.07*hz), skin, 'head', rig)
    line('Mouth', [(-0.10*hx, -0.386*hy, 1.92*hz), (0, -0.41*hy, 1.90*hz), (0.10*hx, -0.386*hy, 1.92*hz)], 0.014, hair, 'head', rig)

    # Beard
    if beard == 'moustache':
        ball('Moustache', (0, -0.419*hy, 1.98*hz), (0.13*hx, 0.025*hy, 0.025*hz), hair, 'head', rig)
    elif beard == 'goatee':
        ball('Goatee', (0, -0.44*hy, 1.85*hz), (0.09*hx, 0.03*hy, 0.08*hz), hair, 'head', rig)
    elif beard == 'full_beard':
        ball('Full beard', (0, -0.40*hy, 1.88*hz), (0.28*hx, 0.08*hy, 0.18*hz), hair, 'head', rig)
    elif beard == 'long_beard':
        rod('Long beard', (0, -0.35*hy, 1.96*hz), (0, -0.31*hy, 1.55*hz), 0.11*hx, hair, 'head', rig, 0.02)

    # Face marks
    if face_mark == 'scar':
        line('Scar', [(-0.15*hx, -0.37*hy, 2.30*hz), (-0.05*hx, -0.42*hy, 2.25*hz)], 0.012, dark, 'head', rig)
    elif face_mark == 'tattoo':
        # small pattern on cheek / forehead
        for sign in [-1, 1]:
            ball('Tattoo', (sign*0.28*hx, -0.30*hy, 2.08*hz), (0.06*hx, 0.01*hy, 0.05*hz), accent, 'head', rig)
    elif face_mark == 'birthmark':
        ball('Birthmark', (0.15*hx, -0.37*hy, 2.22*hz), (0.07*hx, 0.02*hy, 0.06*hz), dark, 'head', rig)
    elif face_mark == 'eye_patch':
        ball('Eye patch', (-0.21*hx, -0.42*hy, 2.18*hz), (0.16*hx, 0.03*hy, 0.18*hz), dark, 'head', rig)

    # Headgear / hairstyle
    if headgear == 'topknot':
        ball('Top knot', (0, 0.07*hy, 2.78*hz), (0.19*hx, 0.19*hy, 0.19*hz), hair, 'head', rig)
    elif headgear == 'bandana':
        ball('Bandana', (0, 0.012*hy, 2.49*hz), (0.59*hx, 0.44*hy, 0.055*hz), accent, 'head', rig)
        for x in [-0.28, -0.10, 0.08, 0.26]:
            ball('Fringe', (x*hx, -0.32*hy, 2.47*hz), (0.12*hx, 0.12*hy, 0.20*hz), hair, 'head', rig)
    elif headgear == 'helmet':
        ball('Helmet dome', (0, 0.05*hy, 2.55*hz), (0.60*hx, 0.45*hy, 0.45*hz), steel, 'head', rig)
        rod('Helmet crest', (0, 0.05*hy, 2.85*hz), (0, 0.05*hy, 3.10*hz), 0.08*hx, accent, 'head', rig, 0.03)
        ball('Helmet brim', (0, -0.20*hy, 2.38*hz), (0.52*hx, 0.30*hy, 0.06*hz), steel, 'head', rig)
    elif headgear == 'hat_daoist':
        # 莲花冠 / 道冠
        rod('Daoist crown', (0, 0.07*hy, 2.79*hz), (0, 0.07*hy, 3.05*hz), 0.15*hx, accent, 'head', rig, 0.08)
        ball('Crown top', (0, 0.07*hy, 3.10*hz), (0.08*hx, 0.08*hy, 0.08*hz), gold, 'head', rig)
    elif headgear == 'hat_broad':
        # 范阳笠 / 宽檐帽
        ball('Hat crown', (0, 0.05*hy, 2.65*hz), (0.42*hx, 0.32*hy, 0.25*hz), cloth, 'head', rig)
        ball('Hat brim', (0, -0.10*hy, 2.50*hz), (0.65*hx, 0.50*hy, 0.04*hz), cloth, 'head', rig)
    elif headgear == 'hat_official':
        # 官帽 / 东坡巾
        ball('Official hat', (0, 0.05*hy, 2.62*hz), (0.45*hx, 0.35*hy, 0.22*hz), dark, 'head', rig)
        rod('Hat side L', (-0.50*hx, 0, 2.55*hz), (-0.65*hx, 0, 2.55*hz), 0.06*hx, dark, 'head', rig)
        rod('Hat side R', (0.50*hx, 0, 2.55*hz), (0.65*hx, 0, 2.55*hz), 0.06*hx, dark, 'head', rig)
        ball('Hat gem', (0, -0.20*hy, 2.52*hz), (0.08*hx, 0.04*hy, 0.06*hz), gold, 'head', rig)
    elif headgear == 'hair_bun_female':
        # 女性发髻 + 发饰
        ball('Hair bun', (0, 0.10*hy, 2.72*hz), (0.25*hx, 0.22*hy, 0.22*hz), hair, 'head', rig)
        ball('Hair pin', (0, 0.10*hy, 2.85*hz), (0.06*hx, 0.06*hy, 0.10*hz), gold, 'head', rig)
        # long side hair
        for sign in [-1, 1]:
            rod('Side hair '+str(sign), (sign*0.45*hx, 0, 2.40*hz), (sign*0.42*hx, 0, 1.80*hz), 0.07*hx, hair, 'head', rig)
    elif headgear == 'crown':
        ball('Crown base', (0, 0.05*hy, 2.60*hz), (0.48*hx, 0.38*hy, 0.20*hz), gold, 'head', rig)
        for i, angle in enumerate([-0.5, -0.2, 0, 0.2, 0.5]):
            rod('Crown spike '+str(i),
                (math.sin(angle)*0.35*hx, -0.25*hy, 2.70*hz + abs(angle)*0.05),
                (math.sin(angle)*0.30*hx, -0.25*hy, 2.90*hz + abs(angle)*0.05),
                0.04*hx, gold, 'head', rig, 0.01)
    elif headgear == 'hood':
        # 头陀/行者 头箍 + 披肩
        ball('Hood band', (0, 0.05*hy, 2.50*hz), (0.58*hx, 0.42*hy, 0.06*hz), dark, 'head', rig)
        rod('Hood back', (0, 0.25*hy, 2.45*hz), (0, 0.30*hy, 1.80*hz), 0.15*hx, cloth, 'head', rig, 0.10)
    elif headgear == 'scarf':
        ball('Scarf wrap', (0, 0.04*hy, 2.48*hz), (0.55*hx, 0.42*hy, 0.08*hz), accent, 'head', rig)
        for sign in [-1, 1]:
            rod('Scarf tail '+str(sign), (sign*0.40*hx, 0.10*hy, 2.40*hz),
                (sign*0.30*hx, 0.15*hy, 2.00*hz), 0.05*hx, accent, 'head', rig)

    # ---------- weapons ----------
    def weapon_spear(side='R'):
        s = 1 if side == 'R' else -1
        rod(f'Spear shaft {side}', (s*0.72*hx, 0, 0.40*hz), (s*0.72*hx, 0, 2.90*hz), 0.035, wood, f'hand.{side}', rig)
        rod(f'Spear blade {side}', (s*0.72*hx, 0, 2.88*hz), (s*0.72*hx, 0, 3.15*hz), 0.12*hx, steel, f'hand.{side}', rig, 0)
        for j in range(4):
            line(f'Spear tassel {side}_{j}',
                 [(s*0.72*hx, 0, 2.78*hz),
                  (s*(0.72+j*0.025)*hx, 0.02*hy, 2.48*hz - j*0.03*hz)],
                 0.018, accent, f'hand.{side}', rig)

    def weapon_sword(side='R'):
        s = 1 if side == 'R' else -1
        rod(f'Sword grip {side}', (s*0.70*hx, 0, 0.98*hz), (s*0.70*hx, 0, 1.18*hz), 0.05*hx, dark, f'hand.{side}', rig)
        rod(f'Sword blade {side}', (s*0.70*hx, 0, 1.18*hz), (s*0.70*hx, 0, 2.05*hz), 0.06*hx, steel, f'hand.{side}', rig, 0.008)
        rod(f'Sword guard {side}', (s*0.56*hx, 0, 1.18*hz), (s*0.84*hx, 0, 1.18*hz), 0.03*hx, gold, f'hand.{side}', rig)

    def weapon_bow():
        pts = [(-0.73*hx, -0.05*hy - 0.30*math.sin(math.pi*i/12), 0.56*hz + i*0.095*hz) for i in range(13)]
        line('Carved bow', pts, 0.04, wood, 'hand.L', rig)
        line('Bow string', [pts[0], pts[-1]], 0.01, white, 'hand.L', rig)
        # quiver on back
        rod('Quiver', (0.25*hx, 0.30*hy, 1.02*hz), (0.25*hx, 0.36*hy, 1.76*hz), 0.13*hx, dark, 'body', rig)
        for j in range(3):
            rod(f'Spare arrow {j}', (0.18*hx+j*0.075*hx, 0.34*hy, 1.40*hz),
                (0.18*hx+j*0.075*hx, 0.37*hy, 2.02*hz), 0.015, steel, 'body', rig)
        # arrow in hand
        rod('Arrow nocked', (0.69*hx, -0.03*hy, 0.90*hz), (0.69*hx, -0.03*hy, 1.85*hz), 0.018, steel, 'hand.R', rig)

    def weapon_staff():
        rod('Staff', (0.68*hx, 0, 0.30*hz), (0.68*hx, 0, 2.80*hz), 0.055*hx, wood, 'hand.R', rig)
        ball('Staff top', (0.68*hx, 0, 2.82*hz), (0.10*hx, 0.10*hy, 0.10*hz), gold, 'hand.R', rig)

    def weapon_axe():
        rod('Axe handle', (0.70*hx, 0, 0.50*hz), (0.70*hx, 0, 2.10*hz), 0.05*hx, wood, 'hand.R', rig)
        # axe head as flat shape (scaled cube)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.70*hx, 0, 2.00*hz))
        ax = bpy.context.object
        ax.scale = (0.35*hx, 0.12*hy, 0.22*hz)
        bpy.ops.object.transform_apply(scale=True)
        attach(ax, 'Axe head', steel, 'hand.R', rig)

    def weapon_twin_swords():
        weapon_sword('R')
        weapon_sword('L')

    def weapon_twin_axes():
        weapon_axe()
        # left axe
        rod('Axe handle L', (-0.70*hx, 0, 0.50*hz), (-0.70*hx, 0, 2.10*hz), 0.05*hx, wood, 'hand.L', rig)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.70*hx, 0, 2.00*hz))
        axl = bpy.context.object
        axl.scale = (0.35*hx, 0.12*hy, 0.22*hz)
        bpy.ops.object.transform_apply(scale=True)
        attach(axl, 'Axe head L', steel, 'hand.L', rig)

    def weapon_hammer():
        rod('Hammer handle', (0.70*hx, 0, 0.60*hz), (0.70*hx, 0, 2.00*hz), 0.05*hx, wood, 'hand.R', rig)
        ball('Hammer head', (0.70*hx, 0, 2.10*hz), (0.25*hx, 0.30*hy, 0.25*hz), steel, 'hand.R', rig)

    def weapon_whip():
        # chain whip / 双鞭 - coiled metal segments
        rod('Whip handle', (0.70*hx, 0, 1.00*hz), (0.70*hx, 0, 1.30*hz), 0.05*hx, dark, 'hand.R', rig)
        for i in range(8):
            ball(f'Whip link {i}',
                 (0.70*hx + math.sin(i*0.5)*0.1*hx, 0, 1.35*hz + i*0.18*hz),
                 (0.07*hx, 0.07*hy, 0.06*hz), steel, 'hand.R', rig)

    def weapon_dart():
        # hidden darts / 暗器 - small
        for j in range(3):
            rod(f'Dart {j}', (0.68*hx+j*0.05*hx, -0.02*hy, 1.05*hz+j*0.08*hz),
                (0.68*hx+j*0.05*hx, -0.02*hy, 1.20*hz+j*0.08*hz), 0.015, steel, 'hand.R', rig)
        # dart pouch at waist
        ball('Dart pouch', (0.30*hx, -0.25*hy, 1.00*hz), (0.15*hx, 0.10*hy, 0.12*hz), dark, 'body', rig)

    def weapon_fan():
        # feather fan - 羽扇
        for i in range(7):
            angle = (i - 3) * 0.25
            rod(f'Fan feather {i}',
                (0.65*hx, -0.05*hy, 1.15*hz),
                (0.65*hx + math.sin(angle)*0.35*hx, -0.05*hy, 1.15*hz + math.cos(angle)*0.40*hz),
                0.02, accent, 'hand.R', rig)
        ball('Fan handle', (0.65*hx, -0.05*hy, 1.10*hz), (0.06*hx, 0.06*hy, 0.12*hz), gold, 'hand.R', rig)

    def weapon_brush():
        rod('Brush handle', (0.70*hx, 0, 1.10*hz), (0.70*hx, 0, 1.80*hz), 0.03*hx, wood, 'hand.R', rig)
        ball('Brush tip', (0.70*hx, 0, 1.88*hz), (0.08*hx, 0.08*hy, 0.12*hz), hair, 'hand.R', rig)

    def weapon_lute():
        # pipa / 琵琶 (held more like a lute)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.55*hx, 0, 1.20*hz))
        lb = bpy.context.object
        lb.scale = (0.30*hx, 0.12*hy, 0.45*hz)
        bpy.ops.object.transform_apply(scale=True)
        attach(lb, 'Lute body', wood, 'hand.R', rig)
        rod('Lute neck', (0.55*hx, 0, 1.65*hz), (0.55*hx, 0, 2.20*hz), 0.04*hx, wood, 'hand.R', rig)

    def weapon_dagger():
        rod('Dagger blade R', (0.70*hx, 0, 1.00*hz), (0.70*hx, 0, 1.55*hz), 0.05*hx, steel, 'hand.R', rig, 0.01)
        rod('Dagger guard R', (0.60*hx, 0, 1.00*hz), (0.80*hx, 0, 1.00*hz), 0.025*hx, gold, 'hand.R', rig)

    def weapon_shield():
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.55*hx, 0, 1.40*hz))
        sh = bpy.context.object
        sh.scale = (0.08*hx, 0.25*hy, 0.40*hz)
        bpy.ops.object.transform_apply(scale=True)
        attach(sh, 'Shield', steel, 'hand.L', rig)
        ball('Shield boss', (-0.48*hx, 0, 1.40*hz), (0.05*hx, 0.15*hy, 0.15*hz), gold, 'hand.L', rig)

    def weapon_crutch():
        # 铁拐 - iron crutch
        rod('Crutch shaft', (0.65*hx, 0, 0.20*hz), (0.65*hx, 0, 1.80*hz), 0.05*hx, wood, 'hand.R', rig)
        rod('Crutch top', (0.55*hx, 0, 1.80*hz), (0.75*hx, 0, 1.80*hz), 0.06*hx, wood, 'hand.R', rig)

    def weapon_rake():
        # 九齿钉耙
        rod('Rake handle', (0.70*hx, 0, 0.50*hz), (0.70*hx, 0, 2.00*hz), 0.05*hx, wood, 'hand.R', rig)
        rod('Rake head', (0.55*hx, 0, 2.00*hz), (0.85*hx, 0, 2.00*hz), 0.06*hx, steel, 'hand.R', rig)
        for i in range(5):
            tx = 0.58*hx + i*0.07*hx
            rod(f'Rake tooth {i}', (tx, 0, 2.00*hz), (tx, 0, 2.25*hz), 0.015, steel, 'hand.R', rig, 0.005)

    def weapon_spear_pair():
        weapon_spear('R')
        weapon_spear('L')

    def weapon_chain():
        # 铁链
        for i in range(6):
            ball(f'Chain link {i}',
                 (0.65*hx + math.sin(i*0.8)*0.15*hx, 0, 1.00*hz + i*0.20*hz),
                 (0.08*hx, 0.05*hy, 0.05*hz), steel, 'hand.R', rig)

    def weapon_knife():
        rod('Knife blade', (0.70*hx, 0, 1.00*hz), (0.70*hx, 0, 1.45*hz), 0.06*hx, steel, 'hand.R', rig, 0.02)
        rod('Knife handle', (0.70*hx, 0, 0.88*hz), (0.70*hx, 0, 1.00*hz), 0.04*hx, dark, 'hand.R', rig)

    def weapon_hook():
        # 钩镰枪
        rod('Hook spear shaft', (0.72*hx, 0, 0.50*hz), (0.72*hx, 0, 2.60*hz), 0.04*hx, wood, 'hand.R', rig)
        rod('Hook blade', (0.72*hx, 0, 2.60*hz), (0.72*hx, 0, 2.90*hz), 0.10*hx, steel, 'hand.R', rig, 0)
        # the hook
        rod('Hook curve', (0.72*hx, 0, 2.80*hz), (0.90*hx, 0, 2.70*hz), 0.03*hx, steel, 'hand.R', rig)

    def weapon_fist():
        # bare hands / 相扑 - wraps
        for side, sign in [('L', -1), ('R', 1)]:
            ball(f'Hand wrap {side}', (sign*0.69*hx, -0.02*hy, 1.04*hz),
                 (0.15*hx, 0.16*hy, 0.18*hz), cloth, f'hand.{side}', rig)

    weapon_map = {
        'spear': weapon_spear, 'sword': lambda: weapon_sword('R'), 'bow': weapon_bow,
        'staff': weapon_staff, 'axe': weapon_axe, 'twin_swords': weapon_twin_swords,
        'twin_axes': weapon_twin_axes, 'hammer': weapon_hammer, 'whip': weapon_whip,
        'dart': weapon_dart, 'fan': weapon_fan, 'brush': weapon_brush,
        'lute': weapon_lute, 'dagger': weapon_dagger, 'shield': weapon_shield,
        'crutch': weapon_crutch, 'rake': weapon_rake, 'spear_pair': weapon_spear_pair,
        'chain': weapon_chain, 'knife': weapon_knife, 'hook': weapon_hook, 'fist': weapon_fist,
    }
    weapon_fn = weapon_map.get(weapon, weapon_sword)
    weapon_fn()

    # Female: add skirt detail / ribbon
    if gender == '女':
        # sash
        line('Sash',
             [(-0.30*hx, -0.15*hy, 1.55*hz), (-0.10*hx, -0.20*hy, 1.20*hz),
              (0.10*hx, -0.20*hy, 1.20*hz), (0.30*hx, -0.15*hy, 1.55*hz)],
             0.03, accent, 'body', rig)

    return rig, quality

# ---------- animations (single-frame poses for sheet) ----------
def make_sheet_poses(rig, weapon, gender):
    """Define key poses for the 7-frame action strip.
    Each pose is a single frame; we render frame 1 of each action and tile them."""
    poses = {
        'idle': {},
        'walkA': {'leg.L': (20, 0, 0), 'leg.R': (-20, 0, 0), 'arm.L': (-15, 0, 0), 'arm.R': (15, 0, 0), 'body': (0, 0, 3)},
        'walkB': {'leg.L': (-20, 0, 0), 'leg.R': (20, 0, 0), 'arm.L': (15, 0, 0), 'arm.R': (-15, 0, 0), 'body': (0, 0, -2)},
        'attack': _attack_pose(weapon, 'normal'),
        'skill': _attack_pose(weapon, 'skill'),
        'hit': {'body': (-18, 0, 5), 'head': (-12, 0, 0), 'arm.L': (15, 0, 10), 'arm.R': (-10, 0, -10)},
        'down': {'body': (0, 0, -70), 'head': (0, 0, -15), 'leg.L': (-50, 0, 0), 'leg.R': (-55, 0, 0)},
    }
    return poses

def _attack_pose(weapon, kind):
    """Return pose dict for an attack/skill based on weapon type."""
    if weapon == 'spear' or weapon == 'spear_pair':
        if kind == 'normal':
            return {'body': (8, 0, 20), 'arm.R': (-90, 0, 20), 'leg.L': (-15, 0, 0), 'head': (0, 0, -5)}
        return {'body': (15, 0, 35), 'arm.R': (-110, 0, 30), 'arm.L': (-60, 0, 0), 'head': (0, 0, -10)}
    if weapon == 'bow':
        if kind == 'normal':
            return {'body': (0, 0, 25), 'arm.L': (-75, 0, -20), 'arm.R': (-55, 0, 60), 'hand.R': (0, 0, 35)}
        return {'body': (0, 0, 30), 'arm.L': (-85, 0, -25), 'arm.R': (-45, 0, 80), 'head': (0, 0, 5)}
    if weapon in ('sword', 'dagger', 'knife', 'hook'):
        if kind == 'normal':
            return {'body': (10, 0, 15), 'arm.R': (-100, 0, 25), 'leg.R': (-20, 0, 0), 'head': (0, 0, -5)}
        return {'body': (15, 0, 30), 'arm.R': (-130, 0, 40), 'arm.L': (-45, 0, 10), 'head': (0, 0, -10)}
    if weapon in ('axe', 'hammer', 'twin_axes'):
        if kind == 'normal':
            return {'body': (15, 0, -5), 'arm.R': (-120, 0, 30), 'leg.L': (-25, 0, 0), 'head': (0, 0, 5)}
        return {'body': (25, 0, 15), 'arm.R': (-160, 0, 40), 'arm.L': (-60, 0, 15), 'head': (0, 0, -5)}
    if weapon in ('staff', 'crutch'):
        if kind == 'normal':
            return {'body': (5, 0, 20), 'arm.R': (-85, 0, 10), 'arm.L': (-40, 0, -10)}
        return {'body': (10, 0, 35), 'arm.R': (-120, 0, 25), 'arm.L': (-70, 0, 0), 'head': (0, 0, -10)}
    if weapon in ('twin_swords', 'whip', 'chain'):
        if kind == 'normal':
            return {'body': (5, 0, 10), 'arm.R': (-100, 0, 30), 'arm.L': (60, 0, -20), 'head': (0, 0, -5)}
        return {'body': (10, 0, 25), 'arm.R': (-130, 0, 40), 'arm.L': (80, 0, -30), 'head': (0, 0, -10)}
    if weapon in ('fan', 'brush', 'lute', 'dart'):
        if kind == 'normal':
            return {'body': (0, 0, 15), 'arm.R': (-70, 0, 20), 'arm.L': (-30, 0, -10)}
        return {'body': (0, 0, 30), 'arm.R': (-100, 0, 40), 'arm.L': (-50, 0, -15), 'head': (0, 0, 10)}
    if weapon == 'fist':
        if kind == 'normal':
            return {'body': (8, 0, 10), 'arm.R': (-90, 0, 30), 'arm.L': (45, 0, -10), 'leg.R': (-15, 0, 0)}
        return {'body': (15, 0, 20), 'arm.R': (-120, 0, 45), 'arm.L': (70, 0, -20), 'head': (0, 0, -5)}
    if weapon == 'rake':
        if kind == 'normal':
            return {'body': (5, 0, 15), 'arm.R': (-80, 0, 15), 'leg.L': (-15, 0, 0)}
        return {'body': (10, 0, 25), 'arm.R': (-110, 0, 25), 'head': (0, 0, -5)}
    # default
    if kind == 'normal':
        return {'body': (8, 0, 15), 'arm.R': (-85, 0, 20)}
    return {'body': (15, 0, 30), 'arm.R': (-115, 0, 35)}

# ---------- render helpers ----------
def setup_scene(rig):
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
        ((3.5, -4.5, 6.0), 700, 5),
        ((-4.5, -2.5, 3.5), 400, 4),
        ((0, 4.5, 5.0), 800, 3.5),
    ]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.shape = 'DISK'
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0, 0, 1.4)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()

    scene.world.color = (0.20, 0.20, 0.22)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 704
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    return scene, cam

def render_pose(rig, scene, pose, out_path):
    """Apply a single pose and render."""
    # clear animation
    rig.animation_data_clear()
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)
    for bone, v in pose.items():
        if bone in rig.pose.bones:
            rig.pose.bones[bone].rotation_euler = tuple(math.radians(n) for n in v)
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)

def render_portrait(rig, scene, out_path):
    """Render a square portrait still (game standard: 512x512, RGBA)."""
    rig.animation_data_clear()
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)
    # adjust camera for portrait — tighter framing, square aspect
    cam = scene.camera
    orig_loc = cam.location.copy()
    orig_scale = cam.data.ortho_scale
    cam.location = (cam.location.x * 0.85, cam.location.y * 0.85, cam.location.z + 0.4)
    cam.data.ortho_scale = 2.6
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    # restore
    cam.location = orig_loc
    cam.data.ortho_scale = orig_scale
    scene.render.resolution_x = 704
    scene.render.resolution_y = 512

def assemble_sheet(frame_paths, out_path, cols=7, rows=1, w=704, h=512):
    """Assemble rendered frames into a horizontal sprite sheet using bpy.image."""
    total_w = w * cols
    total_h = h * rows
    # Use bpy's image API since Blender Python may not have PIL
    img = bpy.data.images.new('sheet', total_w, total_h, alpha=True, float_buffer=False)
    # start with transparent
    pixels = [0.0] * (total_w * total_h * 4)

    for i, fp in enumerate(frame_paths):
        # load frame image
        frame_img = bpy.data.images.load(fp)
        fw = frame_img.size[0]
        fh = frame_img.size[1]
        # get pixels
        frame_pixels = list(frame_img.pixels)
        # target position (centered)
        tx = (i % cols) * w + (w - fw) // 2
        ty = (i // cols) * h + (h - fh) // 2

        for fy in range(fh):
            for fx in range(fw):
                src_idx = (fy * fw + fx) * 4
                dst_x = tx + fx
                dst_y = ty + fy
                if 0 <= dst_x < total_w and 0 <= dst_y < total_h:
                    dst_idx = (dst_y * total_w + dst_x) * 4
                    pixels[dst_idx:dst_idx+4] = frame_pixels[src_idx:src_idx+4]
        bpy.data.images.remove(frame_img)

    img.pixels = pixels
    img.filepath_raw = str(out_path)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    return out_path

# ---------- main ----------
def main():
    manifest = []
    for (rank, name, epithet, weapon, headgear, body_type, complexion, beard, face_mark, gender) in SEATS:
        if rank < start_rank or rank > end_rank:
            continue
        hero_id = f'hero-{rank:03d}'
        slug = f'{hero_id}-{name}'
        print(f'\n{"="*60}')
        print(f'Building rank {rank}: {epithet}·{name} ({gender}, {weapon}, {headgear})')
        print(f'{"="*60}')

        try:
            rig, quality = build_character(rank, name, epithet, weapon, headgear, body_type, complexion, beard, face_mark, gender)
            scene, cam = setup_scene(rig)
            poses = make_sheet_poses(rig, weapon, gender)

            # render each pose to a temp file
            pose_order = ['idle', 'walkA', 'walkB', 'attack', 'skill', 'hit', 'down']
            tmp_dir = OUT / 'tmp_frames' / hero_id
            tmp_dir.mkdir(parents=True, exist_ok=True)
            frame_paths = []
            for pname in pose_order:
                fp = tmp_dir / f'{pname}.png'
                render_pose(rig, scene, poses[pname], str(fp))
                frame_paths.append(str(fp))

            # assemble sheet
            sheet_path = SHEET_DIR / f'{hero_id}-sheet.png'
            assemble_sheet(frame_paths, str(sheet_path), cols=7, rows=1, w=704, h=512)
            print(f'Sheet saved: {sheet_path}')

            # render portrait
            portrait_path = PORTRAIT_DIR / f'{hero_id}-portrait.png'
            render_portrait(rig, scene, str(portrait_path))
            print(f'Portrait saved: {portrait_path}')

            # save source blend
            src_path = SRC / f'{hero_id}.blend'
            bpy.ops.wm.save_as_mainfile(filepath=str(src_path))

            manifest.append({
                'id': hero_id,
                'rank': rank,
                'name': name,
                'epithet': epithet,
                'quality': quality,
                'gender': gender,
                'weapon': weapon,
                'headgear': headgear,
                'body_type': body_type,
                'sheet': f'sheets/{hero_id}-sheet.png',
                'portrait': f'portraits/{hero_id}-portrait.png',
                'source': f'blender-src/{hero_id}.blend',
                'art_source': 'local_blender_procedural_3d',
                'status': 'generated_pending_review',
                'frames': pose_order,
                'frame_size': [704, 512],
                'columns': 7,
            })

            # cleanup temp frames
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

        except Exception as e:
            print(f'ERROR building rank {rank}: {e}')
            import traceback
            traceback.print_exc()
            manifest.append({
                'id': hero_id, 'rank': rank, 'name': name, 'epithet': epithet,
                'status': 'failed', 'error': str(e),
            })

    # write manifest
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f'\nDone. {len(manifest)} heroes processed. Manifest: {OUT / "manifest.json"}')

if __name__ == '__main__':
    main()
