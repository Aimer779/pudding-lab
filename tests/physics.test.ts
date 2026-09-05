import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/physics/simulation.ts';
import { PuddingSurface } from '../src/pudding/surface.ts';

const run=(s:Simulation,seconds:number)=>{for(let i=0;i<seconds*60;i++)s.advance(1/60);};
test('closed skin preserves translations with normalized nonnegative weights',()=>{
  const s=new Simulation(),skin=new PuddingSurface(s.body.mesh);
  const translated=s.body.position.map((x,i)=>x+[2,3,-1][i%3]);
  skin.update(translated,translated,1);
  for(let i=0;i<skin.count*3;i++)assert.ok(Math.abs(skin.positions[i]-skin.rest[i]-[2,3,-1][i%3])<1e-6);
  assert.ok(s.body.mesh.quality.minQuality>.08);
});
test('resting volume, contact and finite positions after a small drop',()=>{
  const s=new Simulation();s.reset(.12);run(s,6);
  const m=s.body.metrics();
  assert.ok(m.finite);assert.ok(m.minTetRatio>0,JSON.stringify(m));
  assert.ok(Math.abs(m.volumeRatio-1)<.03,JSON.stringify(m));
  assert.ok(m.minY>=-.0135);console.log('settled',m);
});
test('pause, reset, slow motion and background recovery keep their observable contracts',()=>{
  const s=new Simulation();run(s,1);
  s.body.beginGrab([[0,1]]);s.pause(true);
  const before=s.body.position.slice();s.nudge();run(s,2);
  assert.deepEqual(s.body.position,before);assert.equal(s.body.grab,null);
  s.reset();s.slow=true;run(s,1);assert.ok(Math.abs(s.time-.25)<.005);
  s.visibility(true);const time=s.time;run(s,20);assert.equal(s.time,time);
  s.visibility(false);assert.ok(s.advance(20)<=12);
  s.reset();assert.equal(s.paused,false);assert.equal(s.slow,false);
  assert.deepEqual(s.body.position,s.body.mesh.rest);assert.ok(s.body.velocity.every(v=>v===0));
});
test('bounded top grab, 30% compression and release remain volumetric',()=>{
  const s=new Simulation(),skin=new PuddingSurface(s.body.mesh);run(s,2);
  let nearest=0,dist=Infinity;
  for(let i=0;i<skin.count;i++) {
    const d=Math.hypot(skin.rest[i*3],skin.rest[i*3+1]-s.body.mesh.height,skin.rest[i*3+2]);
    if(d<dist){dist=d;nearest=i;}
  }
  s.body.beginGrab(skin.hitWeights([nearest],[1]));
  const anchor=[...s.body.grab!.anchor];let minimum=Infinity;
  for(let i=0;i<180;i++) {
    const t=Math.min(1,i/90);
    s.body.moveGrab([anchor[0]+.12*t,anchor[1]-.405*t,anchor[2]]);
    s.advance(1/60);minimum=Math.min(minimum,s.body.metrics().minTetRatio);
  }
  const compression=(anchor[1]-s.body.point(s.body.grab!.weights)[1])/s.body.mesh.height;
  assert.ok(compression>.26&&compression<.34,`actual compression ${compression}`);
  s.body.release();run(s,5);
  const m=s.body.metrics();assert.ok(minimum>0,`min ratio ${minimum}`);
  assert.ok(Math.abs(m.volumeRatio-1)<.03,JSON.stringify(m));
});
test('slider endpoints remain finite and preserve positive tetrahedra under repeated nudges',()=>{
  for(const firmness of [0,1])for(const damping of [0,8]) {
    const s=new Simulation();s.body.firmness=firmness;s.body.damping=damping;
    for(let i=0;i<600;i++) {
      if(i%90===0)s.body.nudge(i%180===0?1:-1);
      s.advance(1/60);
      if(i%10===0){const m=s.body.metrics();assert.ok(m.finite&&m.minTetRatio>0,JSON.stringify({firmness,damping,i,...m}));}
    }
  }
});
