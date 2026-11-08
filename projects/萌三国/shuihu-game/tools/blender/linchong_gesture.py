"""Local original-art mesh segmentation. Limited gesture study, not a repainted rig."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/models/cutout';FRAMES=OUT/'frames/gesture';FRAMES.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
img=bpy.data.images.load(str(ROOT/'assets/tavern/rest/linchong.png'));img.pack()
height=2.3;width=height*img.size[0]/img.size[1]
mat=bpy.data.materials.new('Source colours, no relighting');mat.use_nodes=True
n=mat.node_tree.nodes;n.clear();t=n.new('ShaderNodeTexImage');t.image=img;e=n.new('ShaderNodeEmission');a=n.new('ShaderNodeBsdfTransparent');m=n.new('ShaderNodeMixShader');o=n.new('ShaderNodeOutputMaterial');l=mat.node_tree.links;l.new(t.outputs['Color'],e.inputs[0]);l.new(t.outputs['Alpha'],m.inputs[0]);l.new(a.outputs[0],m.inputs[1]);l.new(e.outputs[0],m.inputs[2]);l.new(m.outputs[0],o.inputs[0])
# Follow the visible near forearm; keep the shoulder and chest stationary.
arm=[(.348,.565),(.400,.555),(.433,.590),(.441,.636),(.460,.680),(.450,.723),(.418,.744),(.389,.711),(.382,.669),(.367,.625)]
def inside(x,y,poly):
 odd=False;j=len(poly)-1
 for i,(xi,yi) in enumerate(poly):
  xj,yj=poly[j]
  if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:odd=not odd
  j=i
 return odd
# Tessellation means each original pixel region has one owner, without a duplicate arm beneath.
verts=[];uvs=[];groups={'portrait':[],'forearm':[]};NX=240;NY=264
for y in range(NY+1):
 for x in range(NX+1):uvs.append((x/NX,y/NY));verts.append(((x/NX-.5)*width,0,(1-y/NY)*height))
for y in range(NY):
 for x in range(NX):
  k=y*(NX+1)+x
  for tri in [(k,k+1,k+NX+2),(k,k+NX+2,k+NX+1)]:
   cx=sum(uvs[i][0] for i in tri)/3;cy=sum(uvs[i][1] for i in tri)/3
   groups['forearm' if inside(cx,cy,arm) else 'portrait'].append(tri)
objects={};pivot=Vector(((.391-.5)*width,-.001,(1-.585)*height))
for name,faces in groups.items():
 mesh=bpy.data.meshes.new(name);origin=pivot if name=='forearm' else Vector((0,0,0));mesh.from_pydata([Vector(v)-origin for v in verts],[],faces);mesh.update();uv=mesh.uv_layers.new()
 for face in mesh.polygons:
  for i in face.loop_indices:x,y=uvs[mesh.loops[i].vertex_index];uv.data[i].uv=(x,1-y)
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.location=origin;mesh.materials.append(mat);objects[name]=obj
hand=objects['forearm']
for frame,angle in [(1,0),(12,0),(26,-5),(38,-5),(54,0),(72,0)]:
 hand.rotation_euler[1]=math.radians(angle);hand.keyframe_insert('rotation_euler',frame=frame)
# No whole-image side drift or leg motion is used to imply walking.
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=72;scene.render.fps=24
bpy.ops.object.camera_add(location=(0,-8,height/2));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,height/2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=height*1.07;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.resolution_x=720;scene.render.resolution_y=788;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.world.color=(.065,.085,.10);scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(FRAMES/'gesture_');scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'linchong-gesture.blend'));bpy.ops.render.render(animation=True)
