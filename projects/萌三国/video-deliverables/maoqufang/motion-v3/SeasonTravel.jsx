// Adapted from TimelineTravel.tsx (video-shotcraft, Apache-2.0).
// Modified: transparent seasonal journey with a settled production-cycle label.
import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {phase,out,fade,travel} from './motion';
export default function SeasonTravel({item}) {
  const frame=useCurrentFrame(),{fps,durationInFrames}=useVideoConfig();
  const t=frame/fps,p=item.props,move=travel(t),arrival=out(phase(t,1.68,2.08));
  return <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:28,opacity:fade(t,durationInFrames/fps),color:p.color,fontFamily:p.fontFamily,textShadow:'0 3px 9px #211307'}}>
    <div style={{width:940,height:190,position:'relative',overflow:'hidden',opacity:1-arrival*.55,transform:`scale(${1+arrival*.04})`}}>
      <div style={{position:'absolute',left:470-move,top:20,width:1600,height:160}}>
        <div style={{position:'absolute',left:0,top:119,width:1440,height:3,background:p.accentColor}}/>
        {Array.from({length:25},(_,i)=><div key={i} style={{position:'absolute',left:i*60,top:109,width:2,height:i%8===0?25:12,background:p.accentColor,opacity:.65}}/>)}
        {['春','夏','秋','冬'].map((s,i)=><div key={s} style={{position:'absolute',left:i*480-70,top:0,width:140,display:'flex',flexDirection:'column',alignItems:'center',gap:25,transform:`translateY(${(1-out(phase(t,.12+i*.25,.44+i*.25)))*20}px)`,opacity:phase(t,.05+i*.25,.25+i*.25)}}><span style={{fontSize:76,fontWeight:700}}>{s}</span><span style={{width:13,height:13,borderRadius:'50%',background:p.accentColor}}/></div>)}
      </div>
      <div style={{position:'absolute',left:468,top:155,width:4,height:20,background:p.accentColor}}/>
    </div>
    <div style={{fontFamily:'Noto Sans SC',fontSize:52,fontWeight:600,letterSpacing:4,opacity:arrival,transform:`translateY(${(1-arrival)*20}px)`}}>{p.title}</div>
  </div>;
}
