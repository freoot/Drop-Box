"""Build an editable control rig from character-rigging data; never fake missing art."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
plan=json.loads((ROOT/'assets/rigs/linchong-production-plan.json').read_text())
OUT=ROOT/'assets/rigs/linchong-controls';OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
img=bpy.data.images.load(str(ROOT/plan['sourceImage']));img.pack();H=2.3;W=H*img.size[0]/img.size[1]
def point(p):return Vector(((p[0]-.5)*W,0,(1-p[1])*H))
byid={p['id']:p for p in plan['parts']};children={p['id']:[] for p in plan['parts']}
for p in plan['parts']:
 if p['parent']:children[p['parent']].append(p['id'])
# Reference is deliberately an empty: no mesh is falsely bound to every bone.
bpy.ops.object.empty_add(type='IMAGE',location=(0,.02,H/2));ref=bpy.context.object;ref.name='REFERENCE_ONLY_not_animated';ref.data=img;ref.empty_display_size=W;ref.rotation_euler=(math.pi/2,0,0);ref.color[3]=.5;ref.hide_render=True
bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='LinChong_2D_Production_Controls';rig.show_in_front=True;rig.data.display_type='STICK';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
nextbone={'thigh_near':'shin_near','shin_near':'foot_near','thigh_far':'shin_far','shin_far':'foot_far','upper_arm_near':'forearm_near','forearm_near':'hand_near','upper_arm_far':'forearm_far','forearm_far':'hand_far','torso':'head'}
for p in plan['parts']:
 b=rig.data.edit_bones.new(p['id']);b.head=point(p['pivot']);b.tail=point(byid[nextbone[p['id']]]['pivot']) if p['id'] in nextbone else b.head+Vector((0,0,.08))
 if p['id'].startswith('foot_'):b.tail=b.head+Vector((.08,0,-.01))
 if p['parent']:b.parent=rig.data.edit_bones[p['parent']]
 b.use_deform=p['id']!='root'
for side in ['near','far']:
 b=rig.data.edit_bones.new('foot_target_'+side);b.head=point(byid['foot_'+side]['pivot']);b.tail=b.head+Vector((.08,0,0));b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
for p in plan['parts']:
 b=rig.pose.bones[p['id']];b.rotation_mode='XYZ';b['art_status']=p['status'];b['layer']=p['layer'];b['pivot_normalized']=p['pivot']
 if p['id']!='root':
  limit=b.constraints.new('LIMIT_ROTATION');limit.name='Local joint rotation boundary';limit.owner_space='LOCAL';limit.use_limit_x=limit.use_limit_y=limit.use_limit_z=True;limit.min_x=limit.max_x=limit.min_y=limit.max_y=0;limit.min_z=math.radians(p['rotationDegrees'][0]);limit.max_z=math.radians(p['rotationDegrees'][1])
for side in ['near','far']:
 shin=rig.pose.bones['shin_'+side];ik=shin.constraints.new('IK');ik.name='Two-bone planted-foot solver';ik.target=rig;ik.subtarget='foot_target_'+side;ik.chain_count=2;ik.use_stretch=False
 for name in ['thigh_'+side,'shin_'+side]:rig.pose.bones[name].lock_ik_x=True;rig.pose.bones[name].lock_ik_y=True
# Contact study only. Targets are unparented, so stance positions do not inherit root motion.
# This control-only cycle may be edited, but is not advertised as finished character animation.
stride=.10*W
for frame in range(1,26):
 t=(frame-1)/24;r=rig.pose.bones['root'];r.location.x=stride*t;r.keyframe_insert('location',frame=frame)
 for side,offset in [('near',0),('far',.5)]:
  phase=(t+offset)%1;cycle=math.floor(t+offset)
  target=rig.pose.bones['foot_target_'+side]
  if phase<.6:dx=cycle*stride;lift=0
  else:
   u=(phase-.6)/.4;s=u*u*(3-2*u);dx=(cycle+s)*stride;lift=.035*math.sin(math.pi*u)
  # Target local X is the screen horizontal axis for these horizontal control bones only
  # use matrix conversion so no bone-local axis assumption leaks into world foot position.
  rest=rig.data.bones[target.name].matrix_local.to_3x3();target.location=rest.inverted()@Vector((dx,0,lift));target.keyframe_insert('location',frame=frame)
rig.animation_data.action.name='CONTROL_ONLY_foot_contact_study';rig.animation_data.action.use_fake_user=True
# Start in clean bind state rather than showing unsupported motion as final art.
rig.animation_data.action=None
for b in rig.pose.bones:b.location=(0,0,0)
missing=[];bound=[]
for p in plan['parts']:
 if p['id']=='root':continue
 if not p['asset']:missing.append(p['id']);continue
 # Future input must be a full-canvas transparent registered layer.
 path=ROOT/p['asset']
 if not path.is_file():missing.append(p['id']);continue
 texture=bpy.data.images.load(str(path));texture.pack()
 mat=bpy.data.materials.new(p['id']+'_art');mat.use_nodes=True;n=mat.node_tree.nodes;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=texture;em=n.new('ShaderNodeEmission');a=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');out=n.new('ShaderNodeOutputMaterial');l=mat.node_tree.links
 for source,dest in [(tex.outputs['Color'],em.inputs[0]),(tex.outputs['Alpha'],mix.inputs[0]),(a.outputs[0],mix.inputs[1]),(em.outputs[0],mix.inputs[2]),(mix.outputs[0],out.inputs[0])]:l.new(source,dest)
 vertices=[(-W/2,-p['layer']*.0001,0),(W/2,-p['layer']*.0001,0),(W/2,-p['layer']*.0001,H),(-W/2,-p['layer']*.0001,H)];mesh=bpy.data.meshes.new(p['id']);mesh.from_pydata(vertices,[],[(0,1,2,3)]);mesh.update();uv=mesh.uv_layers.new()
 for i,v in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=v
 obj=bpy.data.objects.new(p['id']+'_layer',mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat);group=obj.vertex_groups.new(name=p['id']);group.add([0,1,2,3],1,'REPLACE');mod=obj.modifiers.new('Part bone binding','ARMATURE');mod.object=rig;obj.parent=rig;bound.append(p['id'])
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=25
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   view=area.spaces.active.region_3d;view.view_distance=3;view.view_location=Vector((0,0,H/2));view.view_rotation=Vector((0,1,0)).to_track_quat('-Z','Y');view.view_perspective='ORTHO'
bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='POSE')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'linchong-production-controls.blend'))
(OUT/'build-status.json').write_text(json.dumps({'status':('partially_bound_missing_art' if bound else 'controls_only_missing_art') if missing else 'bound_pending_review','boundParts':bound,'missingParts':missing,'coordinateSpace':plan['coordinateSpace'],'source':plan['sourceImage'],'notes':['No replacement of game assets','Control study is not a validated walk cycle','Original image is an unbound reference empty'],'validation':'not_run_at_user_request'},ensure_ascii=False,indent=2))
