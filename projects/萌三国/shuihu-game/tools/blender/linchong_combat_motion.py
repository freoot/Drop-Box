"""Local mesh deformation studies from owned artwork, with editable shape-key poses.
No cloud image generation. Mesh deformation is not a replacement for missing painted joints.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/models/cutout';FPS=24

def clamp(x):return min(1,max(0,x))
def smooth(a,b,x):
 t=clamp((x-a)/(b-a));return t*t*(3-2*t)
def make(kind):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 source=ROOT/('assets/tavern/rest/linchong.png' if kind=='run' else 'assets/q/linchong-portrait.png')
 image=bpy.data.images.load(str(source),check_existing=True);image.pack();H=2.3;W=H*image.size[0]/image.size[1]
 mat=bpy.data.materials.new(kind+'_original_colour');mat.use_nodes=True;n=mat.node_tree.nodes;n.clear();t=n.new('ShaderNodeTexImage');t.image=image;e=n.new('ShaderNodeEmission');a=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');out=n.new('ShaderNodeOutputMaterial');links=mat.node_tree.links
 for x,y in [(t.outputs['Color'],e.inputs[0]),(t.outputs['Alpha'],mix.inputs[0]),(a.outputs[0],mix.inputs[1]),(e.outputs[0],mix.inputs[2]),(mix.outputs[0],out.inputs[0])]:links.new(x,y)
 N=100;vertices=[];coords=[];faces=[]
 for j in range(N+1):
  for i in range(N+1):u=i/N;v=j/N;coords.append((u,v));vertices.append(((u-.5)*W,0,(1-v)*H))
 for j in range(N):
  for i in range(N):k=j*(N+1)+i;faces.extend([(k,k+1,k+N+2),(k,k+N+2,k+N+1)])
 mesh=bpy.data.meshes.new(kind+'_art_grid');mesh.from_pydata(vertices,[],faces);mesh.update();uv=mesh.uv_layers.new()
 for face in mesh.polygons:
  for k in face.loop_indices:u,v=coords[mesh.loops[k].vertex_index];uv.data[k].uv=(u,1-v)
 actor=bpy.data.objects.new('LinChong_'+kind,mesh);bpy.context.collection.objects.link(actor);mesh.materials.append(mat);actor.shape_key_add(name='Original')
 for frame in range(1,26):
  phase=(frame-1)/24;key=actor.shape_key_add(name=f'{kind}_pose_{frame:02}');cycle=math.sin(phase*math.tau)
  # Run is in-place: the game must advance root distance separately.
  for index,(u,v) in enumerate(coords):
   x,y,z=vertices[index];dx=dz=0
   if kind=='run':
    leg=smooth(.82,.91,v);left=1-smooth(.47,.52,u);legphase=cycle*(2*left-1)
    dx=.075*leg*legphase
    # A planted foot stays at ground height; only the returning foot lifts.
    dz=.07*leg*max(0,-legphase)
    body=1-smooth(.76,.89,v);dz+=.010*(1-math.cos(phase*math.tau*2))*body
    arm=smooth(.53,.65,v)*(1-smooth(.72,.78,v));side=smooth(.14,.26,abs(u-.54));dx+=.018*cycle*arm*side
   elif kind=='attack':
    # Anticipation -> fast extension -> held contact -> recovery, with a fixed ground anchor.
    if phase<.32:amount=-.04*math.sin(phase/.32*math.pi/2)
    elif phase<11/24:amount=-.04+.18*((phase-.32)/(11/24-.32))**2
    elif phase<.56:amount=.14
    else:amount=.14*(1-smooth(.56,1,phase))
    upper=1-smooth(.69,.89,v);spear=smooth(.43,.72,u)*(1-smooth(.72,.85,v))
    dx=amount*(upper*.4+spear);dz=amount*(spear*.34)
    # Opposed front/rear leg weight transfer during the thrust, preserving ground height.
    stance=smooth(.72,.84,v)*(1-smooth(.91,.98,v))
    dx+=amount*.25*stance*(2*smooth(.42,.54,u)-1)
   else:
    amount=math.sin(min(1,phase/.24)*math.pi/2)*(1-smooth(.24,1,phase))
    dx=-.035*amount*(1-smooth(.63,.91,v));dz=-.009*amount*(1-smooth(.63,.91,v))
   key.data[index].co=(x+dx,y,z+dz)
  key.value=0;key.keyframe_insert('value',frame=frame-1);key.value=1;key.keyframe_insert('value',frame=frame);key.value=0;key.keyframe_insert('value',frame=frame+1)
 scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=24;scene.render.fps=FPS
 bpy.ops.object.camera_add(location=(0,-8,H/2));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,H/2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.55;scene.camera=cam
 scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard'
 directory=OUT/'frames'/kind;directory.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(directory/(kind+'_'));scene.frame_set(1)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('linchong-'+kind+'.blend')));bpy.ops.render.render(animation=True)
for kind in ['run','attack','hit']:make(kind)
(OUT/'motion-manifest.json').write_text(json.dumps({'source':'local_blender_existing_art','fps':24,'frameSize':640,'columns':6,'rows':4,'frames':24,'clips':['run','attack','hit'],'impactFrame':11,'status':'deformation_study_not_final_character_animation'},indent=2))
