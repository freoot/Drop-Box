"""Local Blender authoring. No network, downloaded assets or image models.
Run with Blender --background --python this_file.py. Rigid segmented prototype rig.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[2]/'assets/models'
SPECS=[dict(id='hero-006',slug='linchong',name='豹子头·林冲',color=(.08,.30,.55,1),accent=(.58,.14,.12,1),weapon='spear',attacks=['踏步拧枪','寒星穿阵','回身扫雪']),dict(id='hero-009',slug='huarong',name='小李广·花荣',color=(.08,.42,.31,1),accent=(.79,.62,.20,1),weapon='bow',attacks=['侧身引弓','穿杨一线','三羽齐发']),dict(id='hero-004',slug='gongsunsheng',name='入云龙·公孙胜',color=(.27,.25,.56,1),accent=(.12,.56,.57,1),weapon='sword',attacks=['并指飞符','五雷落阵','流风护身'])]
BONES={
'root':((0,0,0),(0,0,.3),None),'body':((0,0,1),(0,0,1.7),'root'),
'head':((0,0,1.68),(0,0,2.5),'body'),'eyes':((0,-.53,2.25),(0,-.53,2.4),'head'),
'arm.L':((-.43,0,1.57),(-.66,0,1.15),'body'),'hand.L':((-.66,0,1.15),(-.7,-.05,.93),'arm.L'),
'arm.R':((.43,0,1.57),(.66,0,1.15),'body'),'hand.R':((.66,0,1.15),(.7,-.05,.93),'arm.R'),
'leg.L':((-.22,0,1),(-.22,0,.56),'root'),'foot.L':((-.22,0,.56),(-.22,-.06,.16),'leg.L'),
'leg.R':((.22,0,1),(.22,0,.56),'root'),'foot.R':((.22,0,.56),(.22,-.06,.16),'leg.R')}
def material(name,c,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=c;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=c;p.inputs['Roughness'].default_value=.58;p.inputs['Metallic'].default_value=metal;return m

def attach(o,name,mat,bone=None):
 o.name=name;o.data.materials.append(mat)
 for face in o.data.polygons:face.use_smooth=True
 if bone:
  vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE');mod=o.modifiers.new('Rigid bone binding','ARMATURE');mod.object=rig;o.parent=rig
 return o

def ball(name,loc,scale,mat,bone=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return attach(o,name,mat,bone)

def rod(name,a,b,r,mat,bone=None,r2=None):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return attach(o,name,mat,bone)

def line(name,points,r,mat,bone):
 for i in range(len(points)-1):rod(name+str(i),points[i],points[i+1],r,mat,bone)

def pose(frame,values):
 for b in rig.pose.bones:
  b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
 for bone,v in values.items():
  b=rig.pose.bones[bone];b.rotation_euler=tuple(math.radians(n) for n in v)
 for b in rig.pose.bones:
  b.keyframe_insert('rotation_euler',frame=frame);b.keyframe_insert('location',frame=frame);b.keyframe_insert('scale',frame=frame)

def animation(name,keys):
 rig.animation_data_create();rig.animation_data.action=None
 for f,v in keys:pose(f,v)
 action=rig.animation_data.action;action.name=name;action.use_fake_user=True
 slot=rig.animation_data.action_slot
 track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,action)
 if hasattr(strip,'action_slot'):strip.action_slot=slot
 track.mute=True
 rig.animation_data.action=None
 return action

manifest=[]
for spec in SPECS:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 skin=material('Warm porcelain skin',(.85,.57,.38,1));hair=material('Ink hair',(.025,.035,.055,1));white=material('Ivory silk',(.91,.85,.67,1));gold=material('Antique gold',(.7,.44,.13,1),.65);dark=material('Leather',(.055,.065,.09,1));cloth=material('Signature cloth',spec['color']);accent=material('Accent',spec['accent']);steel=material('Silver steel',(.51,.66,.72,1),.8)
 bpy.ops.object.armature_add();rig=bpy.context.object;rig.name=spec['slug']+'_rig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
 for name,(head,tail,parent) in BONES.items():
  b=rig.data.edit_bones.new(name);b.head=head;b.tail=tail
  if parent:b.parent=rig.data.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
 ball('Robe torso',(0,0,1.34),(.46,.29,.53),cloth,'body')
 rod('Robe skirt',(0,0,.7),(0,0,1.12),.44,cloth,'body',.35)
 ball('Belt',(0,-.005,1.03),(.445,.31,.08),dark,'body');ball('Belt medallion',(0,-.32,1.04),(.10,.035,.10),gold,'body')
 line('Cross collar',[(-.27,-.25,1.73),(.12,-.31,1.43),(.2,-.29,1.15)],.044,white,'body')
 line('Collar trim',[(.27,-.25,1.73),(-.12,-.31,1.43),(-.16,-.29,1.18)],.025,gold,'body')
 for side,x in [('L',-.22),('R',.22)]:
  rod('Trousers '+side,(x,0,.96),(x,0,.53),.15,dark,'leg.'+side)
  rod('Boot shaft '+side,(x,0,.55),(x,-.02,.19),.15,dark,'foot.'+side)
  ball('Boot toe '+side,(x,-.115,.15),(.16,.27,.14),dark,'foot.'+side)
  rod('Boot cuff '+side,(x,0,.51),(x,0,.56),.16,gold,'foot.'+side)
 for side,sign in [('L',-1),('R',1)]:
  rod('Sleeve '+side,(sign*.43,0,1.55),(sign*.66,0,1.15),.19,cloth,'arm.'+side,.14)
  ball('Shoulder '+side,(sign*.43,0,1.53),(.22,.23,.19),gold if spec['weapon']=='spear' else cloth,'arm.'+side)
  rod('Sleeve cuff '+side,(sign*.65,0,1.19),(sign*.68,0,1.10),.15,white,'hand.'+side)
  ball('Hand '+side,(sign*.69,-.02,1.04),(.12,.13,.15),skin,'hand.'+side)
 ball('Head',(0,0,2.13),(.57,.43,.61),skin,'head')
 ball('Hair cap',(0,.055,2.4),(.59,.43,.39),hair,'head')
 for sign in [-1,1]:
  ball('Ear',(sign*.55,0,2.12),(.10,.09,.15),skin,'head')
  ball('Eye white',(sign*.21,-.393,2.18),(.14,.055,.17),white,'eyes')
  ball('Iris',(sign*.21,-.441,2.17),(.083,.026,.12),hair,'eyes')
  ball('Eye glint',(sign*.19,-.466,2.21),(.025,.013,.035),white,'eyes')
  line('Brow',[(sign*.09,-.425,2.39),(sign*.33,-.39,2.41)],.032,hair,'head')
  ball('Cheek',(sign*.34,-.35,2.00),(.08,.027,.04),accent,'head')
 ball('Nose',(0,-.44,2.05),(.065,.07,.07),skin,'head')
 line('Smile',[(-.10,-.386,1.92),(0,-.41,1.90),(.10,-.386,1.92)],.014,hair,'head')
 ball('Top knot',(0,.07,2.78),(.19,.19,.19),hair,'head')
 ball('Head band',(0,.012,2.49),(.59,.44,.055),accent,'head')
 for x in [-.28,-.10,.08,.26]:ball('Fringe',(x,-.32,2.47),(.12,.12,.20),hair,'head')
 if spec['weapon']=='spear':
  rod('Long spear shaft',(.72,0,.12),(.72,0,2.80),.035,dark,'hand.R')
  rod('Spear blade',(.72,0,2.8),(.72,0,3.17),.11,steel,'hand.R',0)
  for j in range(5):line('Red tassel',[(.72,0,2.76),(.74+j*.025,.02,2.45-j*.025)],.018,accent,'hand.R')
  ball('Short moustache',(0,-.419,1.98),(.13,.025,.025),hair,'head')
 elif spec['weapon']=='bow':
  pts=[(-.73,-.04,1.08+z) for z in []]
  pts=[(-.73,-.05-.30*math.sin(math.pi*i/12),.56+i*.095) for i in range(13)]
  line('Carved bow',pts,.035,gold,'hand.L');line('Bow string',[pts[0],pts[-1]],.008,white,'hand.L')
  rod('Quiver',(.25,.30,1.02),(.25,.36,1.76),.12,dark,'body')
  for j in range(3):rod('Spare arrow',(.18+j*.075,.34,1.40),(.18+j*.075,.37,2.02),.012,gold,'body')
  rod('Arrow in hand',(.69,-.03,.9),(.69,-.03,1.8),.015,gold,'hand.R')
 else:
  rod('Jade crown',(0,.07,2.79),(0,.07,3.02),.13,accent,'head',.10)
  rod('Daoist beard',(0,-.35,1.96),(0,-.31,1.60),.11,hair,'head',.018)
  rod('Sword grip',(.7,0,1.02),(.7,0,1.25),.045,dark,'hand.R')
  rod('Sword blade',(.7,0,1.25),(.7,0,2.11),.055,steel,'hand.R',.005)
  rod('Sword guard',(.56,0,1.25),(.84,0,1.25),.03,gold,'hand.R')
  for j in range(3):rod('Robe embroidery',(-.25+j*.25,-.31,.74),(-.25+j*.25,-.31,.91),.017,gold,'body')
 idle=animation('01_idle',[(1,{}),(25,{'body':(0,0,2),'head':(0,0,-2)}),(49,{})])
 walk=animation('02_walk',[(1,{'leg.L':(25,0,0),'leg.R':(-25,0,0),'arm.L':(-18,0,0),'arm.R':(18,0,0)}),(7,{'foot.R':(-35,0,0)}),(13,{'leg.L':(-25,0,0),'leg.R':(25,0,0),'arm.L':(18,0,0),'arm.R':(-18,0,0)}),(19,{'foot.L':(-35,0,0)}),(25,{'leg.L':(25,0,0),'leg.R':(-25,0,0),'arm.L':(-18,0,0),'arm.R':(18,0,0)})])
 attacks={
 'spear':[{'body':(0,0,-22),'arm.R':(-25,0,-30)},{'body':(12,0,28),'arm.R':(-100,0,15),'leg.L':(-25,0,0)}],
 'bow':[{'body':(0,0,32),'arm.L':(-85,0,-18),'arm.R':(-65,0,55),'hand.R':(0,0,40)},{'body':(0,0,32),'arm.L':(-85,0,-18),'arm.R':(-50,0,80)}],
 'sword':[{'arm.L':(-45,0,-20),'hand.L':(-25,0,0),'head':(0,0,-12)},{'arm.L':(-110,0,8),'arm.R':(-65,0,20),'body':(0,0,12)}]}
 wind,hit=attacks[spec['weapon']]
 animation('03_normal_attack',[(1,{}),(9,wind),(13,hit),(19,hit),(30,{})])
 animation('04_skill_primary',[(1,{}),(12,wind),(20,{**hit,'body':(0,0,40),'head':(0,0,-20)}),(32,hit),(48,{})])
 animation('05_skill_secondary',[(1,{}),(14,{'arm.L':(-120,0,-35),'arm.R':(-120,0,35)}),(24,{**hit,'body':(0,0,-40)}),(38,{})])
 animation('06_hit',[(1,{}),(4,{'body':(-18,0,5),'head':(-12,0,0)}),(14,{})])
 animation('07_sit',[(1,{'leg.L':(-75,0,0),'leg.R':(-75,0,0),'foot.L':(75,0,0),'foot.R':(75,0,0)}),(48,{'leg.L':(-75,0,0),'leg.R':(-75,0,0),'foot.L':(75,0,0),'foot.R':(75,0,0),'head':(0,0,8)})])
 # A separate facial action compresses the eye mesh around its own bone origin.
 rig.animation_data.action=None
 for frame,scale in [(1,1),(20,1),(22,.06),(24,1),(72,1)]:
  b=rig.pose.bones['eyes'];b.scale=(1,scale,1);b.keyframe_insert('scale',frame=frame)
 blink=rig.animation_data.action;blink.name='08_blink';blink.use_fake_user=True
 tr=rig.animation_data.nla_tracks.new();tr.name=blink.name;st=tr.strips.new(blink.name,1,blink);st.action_slot=rig.animation_data.action_slot;tr.mute=True
 rig.animation_data.action=None
 for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.scale=(1,1,1)
 scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=49
 rig.animation_data.action=idle
 scene.frame_set(1)
 bpy.ops.object.camera_add(location=(4,-7,3.7));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.9;scene.camera=cam
 for loc,energy,size in [((3,-4,6),600,5),((-4,-2,3),350,4),((0,4,5),700,3)]:
  bpy.ops.object.light_add(type='AREA',location=loc);lamp=bpy.context.object;lamp.data.energy=energy;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,1.4))-lamp.location).to_track_quat('-Z','Y').to_euler()
 scene.world.color=(.18,.18,.18);scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.film_transparent=True
 scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/(spec['slug']+'.png'))
 # Keep a usable studio viewport when the user opens the source.
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=5;area.spaces.active.region_3d.view_location=Vector((0,0,1.4))
 bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/(spec['slug']+'.blend')))
 bpy.ops.render.render(write_still=True)
 manifest.append({**spec,'source':'source/'+spec['slug']+'.blend','preview':spec['slug']+'.png','actions':['01_idle','02_walk','03_normal_attack','04_skill_primary','05_skill_secondary','06_hit','07_sit','08_blink'],'fps':24,'status':'prototype_unreviewed','art_source':'local_blender_procedural','limitations':['Rigid segmented binding; not production skinning','Weapons remain attached during sitting; tavern equipment toggle pending','Projectiles and skill VFX not included','No game integration or visual verification yet']})
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('Saved three editable local Blender character prototypes.')
