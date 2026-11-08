/* Procedural cutout gait over existing art; no generated video is used. */
(function(root){
 const rigs={
 'hero-006':{split:435,left:[322,435,62,50],right:[426,435,48,50]},
 'hero-009':{split:437,left:[239,437,62,48],right:[416,437,63,48]},
 'hero-022':{split:430,left:[257,430,73,55],right:[406,430,66,55]},
 'hero-001':{split:455,left:[316,455,44,30],right:[386,455,49,30]},
 'hero-003':{split:459,left:[295,459,40,26],right:[373,459,40,26]}
 };
 // A planted foot travels backward relative to the root at constant speed.
 // The returning foot lifts, passes the supporting foot, then lands.
 function foot(phase){const p=((phase%1)+1)%1;if(p<.6)return{x:18-36*p/.6,y:0};const t=(p-.6)/.4;return{x:-18+36*t,y:-18*Math.sin(Math.PI*t)};}
 function draw(ctx,img,id,distance,moving,facing=1){
  const r=rigs[id];ctx.clearRect(0,0,704,512);ctx.save();ctx.translate(352,0);ctx.scale(facing,1);ctx.translate(-400,0);
  if(!r||!moving){ctx.drawImage(img,0,0,704,512,0,0,704,512);ctx.restore();return;}
  const phase=distance/(36*.36/704*100/.6);
  for(const [i,box] of [r.left,r.right].entries()){
   const [x,y,w,h]=box,offset=foot(phase+i*.5);
   // Upper joint fixed under the garment; the shin bends towards the lifted foot.
   const kneeX=offset.x*.4,kneeY=offset.y*.25;
   ctx.save();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w+offset.x,y+h+offset.y);ctx.lineTo(x+offset.x,y+h+offset.y);ctx.closePath();ctx.clip();
   ctx.transform(1,0,kneeX/(h*.5),1+kneeY/(h*.5),-kneeX*y/(h*.5),-kneeY*y/(h*.5));
   ctx.drawImage(img,x,y,w,h*.5,x,y,w,h*.5+1);ctx.restore();
   ctx.save();ctx.transform(1,0,(offset.x-kneeX)/(h*.5),1+(offset.y-kneeY)/(h*.5),kneeX-(offset.x-kneeX)*(y+h*.5)/(h*.5),kneeY-(offset.y-kneeY)*(y+h*.5)/(h*.5));
   ctx.drawImage(img,x,y+h*.5,w,h*.5,x,y+h*.5,w,h*.5);ctx.restore();
  }
  // Exclude only the two original lower legs; weapons and capes stay intact.
  ctx.save();ctx.beginPath();ctx.rect(0,0,704,512);for(const [x,y,w,h] of [r.left,r.right])ctx.rect(x,y,w,h);ctx.clip('evenodd');ctx.drawImage(img,0,0,704,512,0,0,704,512);ctx.restore();ctx.restore();
 }
 const api={foot,draw,rigs};if(typeof module!=='undefined')module.exports=api;root.SHUIHU_GAIT=api;
})(typeof window==='undefined'?globalThis:window);
