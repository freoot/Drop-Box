// Adapted from OdometerDigitRoll.tsx (video-shotcraft, Apache-2.0).
// Modified: four speech-aligned single-digit reels over transparent footage.
import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {phase,out,fade,reelPosition} from './motion';
export default function ProcessReels({item}) {
  const frame=useCurrentFrame(),{fps,durationInFrames}=useVideoConfig();
  const t=frame/fps,p=item.props,row=166;
  const columns=[{n:2,label:'投料',at:0},{n:9,label:'蒸煮',at:1.3533},{n:8,label:'发酵',at:2.7133},{n:7,label:'取酒',at:3.9933}];
  return <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'space-around',opacity:fade(t,durationInFrames/fps),color:p.color,fontFamily:p.fontFamily,textShadow:'0 3px 9px #201005'}}>
    {columns.map(({n,label,at},i)=>{
      const local=t-at,pos=reelPosition(local,n)%10;
      const velocity=Math.abs(reelPosition(local+1/120,n)-reelPosition(local,n))*120;
      const ghost=phase(velocity,2,25)*.19;
      const bounce=1+.035*Math.sin(Math.PI*phase(local,.34,.56));
      const strip=(dy,opacity)=><div style={{position:'absolute',top:0,left:0,right:0,transform:`translateY(${(-pos+dy)*row}px)`,opacity}}>{Array.from({length:20},(_,j)=><div key={j} style={{height:row,fontSize:156,fontWeight:600,lineHeight:`${row}px`,textAlign:'center'}}>{j%10}</div>)}</div>;
      return <div key={i} style={{width:205,display:'flex',flexDirection:'column',alignItems:'center',gap:22,opacity:phase(local,0,.15),transform:`translateY(${(1-out(phase(local,0,.32)))*30}px) scale(${bounce})`}}>
        <div style={{height:row,width:155,position:'relative',overflow:'hidden',color:p.accentColor}}>{strip(-.46,ghost)}{strip(.46,ghost*.55)}{strip(0,1)}</div>
        <div style={{fontFamily:'Noto Sans SC',fontSize:42,fontWeight:600,letterSpacing:5}}>{label}</div>
        <div style={{height:3,width:84,background:p.accentColor,transform:`scaleX(${out(phase(local,.35,.65))})`}}/>
      </div>;
    })}
  </div>;
}
