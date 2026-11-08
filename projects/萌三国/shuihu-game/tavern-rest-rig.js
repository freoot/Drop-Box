/* Two-joint cutout rest rig. Authored art, code-driven movement; no combat sprites. */
(function(root){
 function foot(p){p=((p%1)+1)%1;return p<.6?{x:16-32*p/.6,y:0}:{x:-16+32*(p-.6)/.4,y:-16*Math.sin(Math.PI*(p-.6)/.4)};}
 function draw(ctx,img,mode,distance,facing,time,id){
  ctx.clearRect(0,0,512,768);ctx.save();ctx.translate(256,0);ctx.scale(facing,1);ctx.translate(-256,0);
  // The base master is normalized into a single 512×768 canvas.
  const scaleX=img.naturalWidth/512,scaleY=img.naturalHeight/768;
  function part(x,y,w,h,dx=x,dy=y,dw=w,dh=h){ctx.drawImage(img,x*scaleX,y*scaleY,w*scaleX,h*scaleY,dx,dy,dw,dh)}
  const hip=565,knee=634,ground=714;
  if(mode==='walk'){
   for(let i=0;i<2;i++){const x=i?256:144,w=112,o=foot(distance/3.2+i*.5);ctx.save();ctx.transform(1,0,o.x/(ground-hip),1+o.y/(ground-hip),-o.x*hip/(ground-hip),-o.y*hip/(ground-hip));part(x,hip,w,ground-hip);ctx.restore();}
   part(0,0,512,hip+2);
  }else if(mode==='sit'){
   // Seat supports the hips. Thighs extend forward, lower legs hang down.
   ctx.fillStyle='#543921';ctx.fillRect(190,637,130,15);ctx.fillRect(203,651,12,63);ctx.fillRect(290,651,12,63);
   part(0,0,512,hip,0,80,512,hip);
   for(let i=0;i<2;i++){const x=i?256:144;ctx.save();ctx.translate(x+48,hip+80);ctx.rotate(-.9);part(x,hip,112,knee-hip,-48,0,112,knee-hip);ctx.restore();part(x,knee,112,ground-knee,x+48,hip+95,112,ground-knee);}
  }else{part(0,0,512,768);}
  ctx.restore();
 }
 const api={draw,foot};root.SHUIHU_REST_RIG=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
