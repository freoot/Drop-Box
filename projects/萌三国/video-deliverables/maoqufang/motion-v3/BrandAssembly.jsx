// Adapted from LetterformDriftAssembly.tsx (video-shotcraft, Apache-2.0).
// Modified: three Chinese characters, transparent footage overlay, warm gold.
import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {phase,out,fade,driftState} from './motion';
export default function BrandAssembly({item}) {
  const frame=useCurrentFrame(),{fps,durationInFrames}=useVideoConfig();
  const t=frame/fps,p=item.props,lock=out(phase(t,.9,1.3));
  const breathe=1+.025*Math.sin(Math.PI*phase(t,1.1,2));
  return <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:43,opacity:fade(t,durationInFrames/fps),color:p.color,fontFamily:p.fontFamily,textShadow:'0 4px 15px #190e03'}}>
    <div style={{display:'flex',gap:17,transform:`scale(${breathe})`}}>{Array.from(p.title).map((char,i)=>{const d=driftState(t,i);return <span key={i} style={{fontSize:190,fontWeight:700,lineHeight:1.2,opacity:d.opacity,transform:`translate(${d.x}px,${d.y}px)`,filter:`blur(${d.blur}px)`}}>{char}</span>;})}</div>
    <div style={{height:4,width:380,background:p.accentColor,transform:`scaleX(${lock})`}}/>
    <div style={{fontFamily:'Noto Sans SC',fontSize:45,letterSpacing:6,opacity:phase(t,1.05,1.4)}}>把时间，酿进味道里</div>
    <div style={{fontFamily:'Noto Sans SC',fontSize:33,letterSpacing:5,color:p.accentColor,opacity:phase(t,1.4,1.7)}}>喝好酒 · 少喝酒 · 喝老酒</div>
  </div>;
}
