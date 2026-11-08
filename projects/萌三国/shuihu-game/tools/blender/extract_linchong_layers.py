"""Extract visible regions locally in Blender. No invented hidden anatomy or cloud calls."""
import bpy,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/rigs/linchong-layers';OUT.mkdir(exist_ok=True)
source=bpy.data.images.load(str(ROOT/'assets/tavern/rest/linchong.png'));w,h=source.size
raw=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(raw);raw=raw.reshape(h,w,4)[::-1].copy()
y,x=np.mgrid[0:h,0:w];x=(x+.5)/w;y=(y+.5)/h
# Hand-traced visible contours, not generative reconstruction.
regions=[
('hand_near',[(.389,.658),(.435,.649),(.458,.687),(.454,.715),(.437,.731),(.406,.724),(.387,.694)]),
('forearm_near',[(.368,.578),(.421,.579),(.442,.647),(.434,.662),(.389,.678),(.379,.638)]),
('upper_arm_near',[(.396,.412),(.458,.435),(.466,.483),(.438,.518),(.453,.579),(.419,.601),(.367,.621),(.318,.585),(.351,.531),(.35,.487)]),
('hand_far',[(.624,.661),(.658,.657),(.674,.690),(.671,.718),(.648,.730),(.628,.714)]),
('forearm_far',[(.608,.602),(.649,.590),(.672,.660),(.653,.676),(.626,.673)]),
('upper_arm_far',[(.597,.462),(.626,.485),(.640,.541),(.669,.582),(.654,.606),(.609,.616),(.606,.554)]),
('head',[(0,0),(1,0),(1,.428),(.606,.428),(.570,.409),(.507,.394),(.467,.399),(.439,.423),(.353,.464),(.309,.505),(0,.505)]),
('foot_near',[(.391,.903),(.446,.900),(.461,.949),(.451,.964),(.381,.958)]),
('foot_far',[(.529,.900),(.588,.900),(.618,.922),(.645,.922),(.644,.954),(.529,.956)]),
('shin_near',[(.392,.861),(.459,.860),(.449,.909),(.393,.919)]),
('shin_far',[(.526,.859),(.593,.855),(.590,.908),(.526,.919)]),
('thigh_near',[(.383,.824),(.472,.825),(.461,.871),(.392,.871)]),
('thigh_far',[(.517,.815),(.608,.819),(.599,.868),(.521,.873)]),
('cape',[(.315,.609),(.359,.615),(.337,.756),(.361,.877),(.312,.873),(.268,.823),(.259,.748)]),
('pelvis',[(0,.603),(1,.603),(1,1),(0,1)]),
('torso',[(0,0),(1,0),(1,1),(0,1)])]
def mask(poly):
 inside=np.zeros((h,w),bool);j=len(poly)-1
 for i,(xi,yi) in enumerate(poly):
  xj,yj=poly[j]
  if yi!=yj:inside^=((yi>y)!=(yj>y))&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)
  j=i
 return inside
claimed=np.zeros((h,w),bool);results=[]
for name,poly in regions:
 selection=mask(poly)&~claimed;claimed|=selection
 pixels=raw.copy();pixels[:,:,3]*=selection
 image=bpy.data.images.new(name,width=w,height=h,alpha=True);image.pixels.foreach_set(np.ascontiguousarray(pixels[::-1]).ravel());image.filepath_raw=str(OUT/(name+'.png'));image.file_format='PNG';image.save()
 results.append({'id':name,'asset':'assets/rigs/linchong-layers/'+name+'.png','status':'visible_region_only','polygon':poly,'hiddenJointPaint':'missing'})
planpath=ROOT/'assets/rigs/linchong-production-plan.json';plan=json.loads(planpath.read_text())
lookup={p['id']:p for p in results}
# Correct the initial draft landmarks to the visible near-side elbow, wrist and feet.
coords={'upper_arm_near':[.408,.473],'forearm_near':[.399,.597],'hand_near':[.414,.664],'upper_arm_far':[.615,.503],'forearm_far':[.637,.602],'hand_far':[.647,.665],'thigh_near':[.428,.827],'shin_near':[.425,.862],'foot_near':[.421,.911],'thigh_far':[.563,.823],'shin_far':[.559,.860],'foot_far':[.560,.913]}
for part in plan['parts']:
 if part['id'] in lookup:part.update({k:lookup[part['id']][k] for k in ['asset','status']})
 if part['id'] in coords:part['pivot']=coords[part['id']]
plan['status']='visible_layers_pending_joint_paint';plan['pivotStatus']='visible_landmarks_authored_not_motion_validated';planpath.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
(OUT/'manifest.json').write_text(json.dumps({'source':'assets/tavern/rest/linchong.png','canvas':[w,h],'parts':results,'missing':['spear','occluded_joint_extensions','eye_mouth_layers'],'status':'extracted_not_finished_art'},ensure_ascii=False,indent=2))
print('Saved 16 full-canvas visible artwork layers in local Blender.')
