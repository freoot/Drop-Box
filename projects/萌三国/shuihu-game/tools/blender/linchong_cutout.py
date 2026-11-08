"""Local 2D cutout proof from existing artwork, no synthesis or repainting."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/models/cutout';OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
img=bpy.data.images.load(str(ROOT/'assets/tavern/rest/linchong.png'));img.pack()
mat=bpy.data.materials.new('Original artwork — unlit colour');mat.use_nodes=True
n=mat.node_tree.nodes;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=img;em=n.new('ShaderNodeEmission');transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');out=n.new('ShaderNodeOutputMaterial');l=mat.node_tree.links;l.new(tex.outputs['Color'],em.inputs[0]);l.new(tex.outputs['Alpha'],mix.inputs[0]);l.new(transparent.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],out.inputs[0])
# A continuous tiled image at rest; shared seams avoid double imagery.
# Coordinates are normalized image coordinates, top-left origin.
parts={
 'head':([(0,0),(1,0),(1,.43),(.64,.43),(.57,.405),(.48,.43),(0,.43)],(.57,.425),.004),
 'body':([(0,.43),(.48,.43),(.57,.405),(.64,.43),(1,.43),(1,.66),(0,.66)],(.55,.65),.002),
 'lower':([(0,.66),(1,.66),(1,1),(0,1)],(.55,.66),0)}
objects={}
for name,(points,pivot,depth) in parts.items():
 m=bpy.data.meshes.new(name);verts=[((x-pivot[0])*2,depth,(pivot[1]-y)*2.3) for x,y in points];m.from_pydata(verts,[],[tuple(range(len(verts)))]);m.update();uv=m.uv_layers.new()
 for poly in m.polygons:
  for i in poly.loop_indices:x,y=points[m.loops[i].vertex_index];uv.data[i].uv=(x,1-y)
 o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.location=((pivot[0]-.5)*2,0,(1-pivot[1])*2.3);m.materials.append(mat);objects[name]=o
# Small motions only: the source has no hidden joint paintings.
head=objects['head'];body=objects['body'];origin=head.location.copy()
for frame,angle,lift in [(1,0,0),(13,-.8,.004),(25,0,0),(37,.8,.004),(49,0,0)]:
 head.rotation_euler[1]=math.radians(angle);head.location=origin+Vector((0,0,lift));head.keyframe_insert('rotation_euler',frame=frame);head.keyframe_insert('location',frame=frame)
 body.scale=(1,1,1+lift*.3);body.keyframe_insert('scale',frame=frame)
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=48;scene.render.fps=24
bpy.ops.object.camera_add(location=(0,-8,1.15));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.15))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.45;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.resolution_x=640;scene.render.resolution_y=736;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.world.color=(.065,.085,.10);scene.view_settings.view_transform='Standard'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'frames/idle_')
scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'linchong-cutout.blend'));bpy.ops.render.render(animation=True)
