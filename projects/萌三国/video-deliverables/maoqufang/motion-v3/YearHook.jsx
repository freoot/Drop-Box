// Adapted from MarkerUnderlineTitle.tsx (video-shotcraft, Apache-2.0).
// Modified: transparent Chinese overlay, ivory/gold, speech-aligned marker stroke.
import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {phase,out,fade,strokePath} from './motion';
export default function YearHook({item}) {
  const frame=useCurrentFrame();
  const {fps,durationInFrames}=useVideoConfig();
  const t=frame/fps, duration=durationInFrames/fps;
  const p=item.props, enter=out(phase(t,.08,.5)), draw=out(phase(t,2.72,3.05));
  return <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:18,background:'transparent',opacity:fade(t,duration),color:p.color,fontFamily:p.fontFamily,textShadow:'0 3px 10px #251305',transform:`translateY(${(1-enter)*34}px)`}}>
    <div style={{fontSize:40,fontFamily:'Noto Sans SC',fontWeight:500,letterSpacing:5}}>光酿造，就要</div>
    <div style={{position:'relative',fontSize:176,fontWeight:700,lineHeight:1.2,whiteSpace:'nowrap'}}>{p.title}
      <svg width="390" height="42" viewBox="0 0 390 42" style={{position:'absolute',left:'50%',bottom:-17,transform:'translateX(-50%)'}}>
        <defs><clipPath id="year-marker"><rect width={draw*390} height="42"/></clipPath></defs>
        <path d={strokePath(390)} fill={p.accentColor} clipPath="url(#year-marker)"/>
      </svg>
    </div>
  </div>;
}
