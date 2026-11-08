"""Validate actual ChatCut v3 state and independently decode its exported video."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from validate_delivery import ROOT, probe, validate_fullscreen, validate_render


def validate_timeline():
    old = validate_fullscreen()
    new = json.loads((ROOT / 'timeline-v3.json').read_text())
    assert new['width'] == 1080 and new['height'] == 1920
    assert new['fps'] == 30 and new['durationFrames'] == 1950
    rows = new['items']
    clips = sorted((r['item'] for r in rows if r['track']['id'] == '2c168c4701'), key=lambda i: i['startFrame'])
    before = sorted((r['item'] for r in old['items'] if r['track']['id'] == '0f20758455'), key=lambda i: i['startFrame'])
    assert len(clips) == len(before) == 27
    # All original full-screen crops and shot/source timing must survive duplication.
    fields = ['assetId', 'startFrame', 'durationFrames', 'sourceIn', 'speed', 'left', 'top',
              'width', 'height', 'cropLeft', 'cropRight', 'cropTop', 'cropBottom']
    for a, b in zip(clips, before):
        assert {k:a.get(k) for k in fields} == {k:b.get(k) for k in fields}
    mg = sorted((r['item'] for r in rows if r['item']['type'] == 'motion-graphic'), key=lambda i:i['startFrame'])
    assert [(i['startFrame'], i['durationFrames']) for i in mg] == [(0,108),(416,163),(638,126),(1845,105)]
    for item in mg:
        assert item['left'] >= 0 and item['left'] + item['width'] <= 1080
        assert item['top'] >= 0 and item['top'] + item['height'] < 1590
        assert item['startFrame'] + item['durationFrames'] <= 1950
    # ChatCut canonicalizes properties equal to the asset defaults back to null.
    assets = json.loads((ROOT/'motion-v3/assets.json').read_text())
    assert len(assets) == 4
    hook = next(a for a in assets if a['id'] == mg[0]['assetId'])
    defaults = {p['key']:p['defaultValue'] for p in hook['properties']}
    assert (mg[0]['propertyOverrides'] or {}).get('accentColor', defaults['accentColor']) == '#E8BC6A'
    assert len([r for r in rows if r['item']['type'] == 'image']) == 1
    assert len(new['captionCards']) == 25
    for a, b in zip(new['captionCards'], old['captionCards']):
        for key in ['text', 'start', 'end', 'layout', 'style']:
            assert a.get(key) == b.get(key), f'Caption changed: {key}'
    pips = [r['item'] for r in rows if r['track']['id'] == '97324e5f11' and r['item']['type'] == 'video']
    masks = [r['item'] for r in rows if r['item']['type'] == 'pixel-effect']
    assert len(pips) == len(masks) == 3
    for pip in pips:
        mask = next(m for m in masks if m['target']['itemId'].replace('-','').startswith(pip['id']))
        assert mask['mask']['nodes'][0]['kind'] == 'ellipse'
        radius = mask['propertyOverrides']['mask.speaker_circle.radius_x']
        assert radius == mask['propertyOverrides']['mask.speaker_circle.radius_y']
        tracks = pip['animation']['tracks']
        points = [tracks['transform.'+name]['points'] for name in ['width','height','x','y']]
        assert all(len(p) == 5 for p in points)
        for w,h,x,y in zip(*points):
            assert w['time'] == h['time'] == x['time'] == y['time']
            assert w['time'] < pip['durationFrames']/30*1e6
            width,height=w['value'],h['value']
            assert abs(width/height-448/960) < 1e-8, 'PIP distorted'
            cx=x['value']+210/448*width;cy=y['value']+310/960*height
            assert abs(cx-850)<.001 and abs(cy-1400)<.001
            diameter=radius*min(width,height)
            assert diameter <= 352.01 and cx+diameter/2<1080 and cy+diameter/2<1590
        assert all(p.get('easing') == 'ease-out-cubic' for arr in points for p in arr[:-1])
    assert next(t for t in new['tracks'] if t['id']=='3e8ea9fbe0')['muted']
    bgm = next(r['item'] for r in rows if r['item']['id']=='bef12506ee')
    assert bgm['decibelAdjustment']==-21
    assert bgm['processing']['music-separation']['propertyOverrides']['output']=='instrumental'
    voice = next(r['item'] for r in rows if r['item']['id']=='51426f925a')
    assert voice['assetId']=='7f044605a5' and voice['durationFrames']==1843
    return new


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--state-only',action='store_true')
    args=parser.parse_args()
    model=validate_timeline()
    subprocess.run(['node',str(ROOT/'motion-v3/motion.test.mjs')],check=True)
    if args.state_only:
        print('PASS: actual timeline, preserved full-screen footage, captions, circle animation bounds and audio settings')
        return
    path=ROOT/'茅曲坊-动效卡片版-v3.mp4'
    info=probe(path);v=next(s for s in info['streams'] if s['codec_type']=='video')
    assert (v['width'],v['height'])==(1080,1920)
    assert v['avg_frame_rate']=='30/1'
    assert abs(float(info['format']['duration'])-65)<.1
    assert any(s['codec_type']=='audio' for s in info['streams'])
    subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'],check=True)
    rendered=validate_render(path)
    report=dict(status='pass',file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                bytes=path.stat().st_size,width=1080,height=1920,fps=30,duration_seconds=65,
                full_decode='pass',main_shots=27,motion_cards=4,circular_presenter_segments=3,
                captions=len(model['captionCards']),motion_math_tests='pass',**rendered)
    (ROOT/'validation-report-v3.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
