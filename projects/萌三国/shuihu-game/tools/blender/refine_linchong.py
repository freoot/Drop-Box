"""Local mesh refinement against existing in-game Lin Chong portrait. No cloud calls."""
from pathlib import Path
base=Path(__file__).with_name('build_heroes.py')
exec(base.read_text().split('manifest=[]')[0])
bpy.ops.wm.open_mainfile(filepath=str(OUT/'source/linchong.blend'))
rig=bpy.data.objects['linchong_rig'];rig.animation_data.action=None
for tr in rig.animation_data.nla_tracks:tr.mute=True
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.scale=(1,1,1);b.location=(0,0,0)
for o in list(bpy.data.objects):
 if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
skin=material('V2 warm skin',(.88,.61,.39,1));hair=material('V2 ink hair',(.018,.022,.036,1));shine=material('V2 hair ridges',(.065,.074,.10,1));white=material('V2 pearl silk',(.86,.90,.93,1));gold=material('V2 engraved gold',(.64,.36,.075,1),.72);dark=material('V2 under armour',(.028,.045,.068,1));blue=material('V2 cobalt blue',(.018,.16,.48,1));silver=material('V2 silver plates',(.46,.58,.72,1),.7);iris=material('V2 amber iris',(.24,.09,.025,1));lip=material('V2 warm lip',(.34,.12,.08,1))
skin.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8
hair.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.65

def mesh(name,verts,faces,mat,bone,sub=1):
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);attach(o,name,mat,bone)
 if sub:mod=o.modifiers.new('Silhouette smoothing','SUBSURF');mod.levels=sub
 return o

def sweep(name,points,widths,depth,mat,bone):
 # Flattened tapered sculpted lock or ribbon, with a broad central ridge.
 verts=[];n=10
 for (x,y,z),w in zip(points,widths):
  for j in range(n):
   a=2*math.pi*j/n;verts.append((x+w*math.cos(a),y+depth*math.sin(a)*(w/max(widths)),z))
 faces=[tuple(range(n-1,-1,-1))]
 for i in range(len(points)-1):
  for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 faces.append(tuple(range((len(points)-1)*n,len(points)*n)))
 return mesh(name,verts,faces,mat,bone,2)

def curve(name,pts,r,mat,bone):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for b,co in zip(s.bezier_points,pts):b.co=co;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;attach(o,name,mat,bone);o.select_set(False);return o

def plate(name,points,mat,bone):
 o=mesh(name,points,[tuple(range(len(points)))],mat,bone,0);m=o.modifiers.new('Plate thickness','SOLIDIFY');m.thickness=.035;m=o.modifiers.new('Soft metal edge','BEVEL');m.width=.025;m.segments=3
 curve(name+' gold edge',points+[points[0]],.012,gold,bone);return o
# A shaped jaw, cheek and brow volume: no spherical toddler face.
verts=[];rings=[(1.73,.08,.13),(1.80,.24,.25),(1.94,.43,.34),(2.10,.51,.38),(2.28,.53,.39),(2.48,.48,.36),(2.64,.32,.27),(2.7,.04,.05)];N=48
for z,rx,ry in rings:
 for j in range(N):a=j*2*math.pi/N;verts.append((rx*math.cos(a),ry*math.sin(a),z))
faces=[]
for k in range(len(rings)-1):
 for j in range(N):faces.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
mesh('Sculpted face',verts,faces,skin,'head',2)
for sign in [-1,1]:
 ball('Ear',(sign*.50,0,2.12),(.09,.07,.13),skin,'head')
 # Slim almond eye rims, brown iris and sharp lid, rather than protruding buttons.
 ball('Eye whites',(sign*.21,-.352,2.19),(.145,.033,.115),white,'eyes')
 ball('Amber iris',(sign*.21,-.382,2.18),(.067,.018,.089),iris,'eyes')
 ball('Pupil',(sign*.21,-.398,2.18),(.032,.012,.069),hair,'eyes')
 ball('Eye light',(sign*.19,-.410,2.22),(.017,.009,.024),white,'eyes')
 curve('Upper eyelid',[(sign*.065,-.375,2.24),(sign*.20,-.395,2.30),(sign*.36,-.32,2.30)],.018,hair,'head')
 curve('Sword eyebrow',[(sign*.065,-.377,2.34),(sign*.22,-.374,2.40),(sign*.38,-.29,2.41)],.028,hair,'head')
 ball('Sideburn',(sign*.43,-.16,1.99),(.08,.10,.18),hair,'head')
ball('Small sculpted nose',(0,-.389,2.05),(.045,.045,.055),skin,'head')
curve('Mouth',[(-.075,-.325,1.94),(0,-.351,1.925),(.075,-.325,1.94)],.010,lip,'head')
# Closely cropped beard, with pointed locks along the jaw.
for j in range(15):
 x=-.40+j*.8/14;z=1.78+.28*(abs(x)/.4)**1.5;y=-.22-.12*(1-abs(x)/.4)
 sweep('Jaw beard '+str(j),[(x,y,z+.14),(x,y-.025,z+.035),(x*.96,y,z-.045)],[.055,.048,.001],.025,hair,'head')
for sign in [-1,1]:curve('Moustache',[(0,-.37,1.995),(sign*.09,-.35,2.0),(sign*.14,-.32,1.97)],.018,hair,'head')
# Swept pointed hair sections and forehead band.
ball('Hair crown',(0,.07,2.48),(.54,.40,.32),hair,'head')
for j in range(7):
 x=-.46+j*.145
 sweep('Swept lock '+str(j),[(x*.4+.13,.03,2.76),(x+.08,-.20,2.65),(x,-.34,2.50),(x-.10,-.36,2.32-(.10 if j<3 else 0))],[.04,.15,.12,.002],.075,hair,'head')
 curve('Fine hair groove '+str(j),[(x*.4+.12,-.035,2.76),(x+.07,-.27,2.65),(x-.04,-.405,2.47)],.007,shine,'head')
for sign in [-1,1]:sweep('Temple hair',[(sign*.46,.02,2.51),(sign*.52,-.13,2.30),(sign*.46,-.18,2.05)],[.10,.09,.001],.065,hair,'head')
ball('Topknot',(0,.16,2.83),(.23,.21,.20),hair,'head')
curve('Knot tie',[(-.20,.03,2.78),(0,-.03,2.75),(.20,.03,2.78)],.035,white,'head')
curve('White forehead band',[(-.48,-.16,2.46),(-.25,-.36,2.47),(0,-.40,2.47),(.25,-.36,2.47),(.48,-.16,2.46)],.045,white,'head')
for sign in [-1,1]:sweep('Flowing head tie',[(0,.28,2.62),(sign*.36,.38,2.45),(sign*.65,.36,2.24),(sign*.85,.31,2.30)],[.07,.09,.07,.005],.015,white,'head')
# Layered costume: fitted undersuit, skirt panels, breastplate and lamellar shoulders.
ball('Fitted under tunic',(0,0,1.37),(.36,.235,.40),dark,'body')
plate('Silver breastplate',[(-.32,-.21,1.65),(0,-.30,1.72),(.32,-.21,1.65),(.28,-.29,1.20),(0,-.34,1.14),(-.28,-.29,1.20)],silver,'body')
plate('Chest crest',[(0,-.35,1.61),(.075,-.35,1.48),(0,-.37,1.35),(-.075,-.35,1.48)],gold,'body')
curve('White collar',[(-.22,-.20,1.73),(0,-.32,1.57),(.22,-.20,1.73)],.04,white,'body')
ball('Blue sash',(0,0,1.10),(.38,.26,.09),blue,'body');ball('Gold buckle',(0,-.27,1.10),(.08,.028,.07),gold,'body')
for sign in [-1,1]:
 plate('Ivory skirt panel',[(sign*.03,-.23,1.07),(sign*.32,-.16,1.05),(sign*.44,-.18,.54),(sign*.10,-.29,.48)],white,'body')
 plate('Blue skirt panel',[(sign*.22,-.24,1.10),(sign*.36,-.12,1.08),(sign*.49,-.15,.57),(sign*.30,-.30,.49)],blue,'body')
 side='L' if sign<0 else 'R';x=sign*.22
 rod('Trouser',(x,0,.91),(x,0,.53),.125,dark,'leg.'+side)
 rod('Greave',(x,0,.53),(x,-.02,.19),.13,silver,'foot.'+side)
 plate('Knee plate',[(x-.11,-.13,.62),(x+.11,-.13,.62),(x+.13,-.16,.51),(x,-.19,.43),(x-.13,-.16,.51)],silver,'foot.'+side)
 ball('Boot',(x,-.09,.15),(.135,.22,.13),dark,'foot.'+side)
 plate('Boot cap',[(x-.11,-.25,.17),(x,-.33,.19),(x+.11,-.25,.17),(x+.09,-.09,.27),(x-.09,-.09,.27)],silver,'foot.'+side)
 rod('White sleeve',(sign*.41,0,1.54),(sign*.64,0,1.18),.14,white,'arm.'+side,.12)
 for row in range(3):
  z=1.65-row*.095;xx=sign*(.40+row*.065)
  plate('Layered pauldron',[(xx-sign*.14,-.17,z),(xx+sign*.14,-.12,z-.025),(xx+sign*.17,-.07,z-.13),(xx,-.24,z-.12),(xx-sign*.13,-.20,z-.08)],silver,'arm.'+side)
 rod('Bracer',(sign*.64,0,1.20),(sign*.69,-.02,1.02),.135,dark,'hand.'+side,.10)
 curve('Bracer rim',[(sign*.56,-.10,1.15),(sign*.65,-.14,1.17),(sign*.74,-.10,1.15)],.02,gold,'hand.'+side)
 ball('Palm',(sign*.69,-.02,.96),(.085,.08,.11),skin,'hand.'+side)
 for finger in range(4):ball('Finger',(sign*(.64+finger*.027),-.075,.91),(.016,.024,.055),skin,'hand.'+side)
# Blue cape, tailored surface with folds, ivory lining and gold border.
rows=14;cols=16;vs=[]
for i in range(rows):
 t=i/(rows-1)
 for j in range(cols):
  u=j/(cols-1)*2-1;x=u*(.27+.45*t);y=.19+.25*t+.10*math.sin(u*math.pi*3)*t;z=1.68-1.16*t+.07*math.cos(u*math.pi*2)*t
  vs.append((x,y,z))
fs=[]
for i in range(rows-1):
 for j in range(cols-1):k=i*cols+j;fs.append((k,k+1,k+1+cols,k+cols))
o=mesh('Blue silk cape',vs,fs,blue,'body',2);o.modifiers.new('Fabric thickness','SOLIDIFY').thickness=.018
curve('Cape hem',vs[-cols:],.02,white,'body')
# Spear with a leaf-shaped metal head instead of a cone.
rod('Blue spear shaft',(.76,0,.07),(.76,0,2.66),.027,blue,'hand.R')
for z in [.15,.65,1.1,2.55]:rod('Spear gold ring',(.76,0,z),(.76,0,z+.045),.037,gold,'hand.R')
plate('Leaf spearhead',[(.76,-.02,2.58),(.61,-.02,2.80),(.76,-.02,3.23),(.91,-.02,2.80)],silver,'hand.R')
curve('Blade ridge',[(.76,-.06,2.62),(.76,-.06,2.86),(.76,-.04,3.23)],.012,white,'hand.R')
for j in range(7):sweep('Blue spear tassel',[(.76,0,2.61),(.85+j*.018,.03,2.45),(.83+j*.025,.04,2.21)],[.023,.018,.001],.01,blue if j%2 else white,'hand.R')
scene=bpy.context.scene;scene.frame_set(1)
cam=scene.camera;cam.location=(3,-8,3.1);cam.rotation_euler=(Vector((0,0,1.57))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.65
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.cycles.samples=48
scene.render.filepath=str(OUT/'linchong-refined.png')
# Reference empty is packed for opening in Blender, excluded from rendered delivery.
ref=bpy.data.images.load(str(OUT.parent/'q/linchong-portrait.png'));ref.pack()
bpy.ops.object.empty_add(type='IMAGE',location=(-2,0,1.5));reference=bpy.context.object;reference.name='REFERENCE_existing_game_portrait';reference.data=ref;reference.empty_display_size=3;reference.rotation_euler=(math.pi/2,0,0);reference.hide_render=True
rig.animation_data.action=bpy.data.actions.get('01_idle');scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/linchong-refined.blend'))
bpy.ops.render.render(write_still=True)
