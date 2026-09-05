import { mkdirSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Simulation } from '../src/physics/simulation.ts';
import { PuddingSurface } from '../src/pudding/surface.ts';
import { tetVolume } from '../src/physics/mesh.ts';

const s=new Simulation(),skin=new PuddingSurface(s.body.mesh);
let top=0,nearest=Infinity;
for(let i=0;i<skin.count;i++) {
  const p=skin.rest,d=Math.hypot(p[i*3],p[i*3+1]-s.body.mesh.height,p[i*3+2]);
  if(d<nearest){nearest=d;top=i;}
}
const weights=skin.hitWeights([top],[1]);
for(let i=0;i<120;i++)s.advance(1/60);
let minTetRatio=Infinity,minVolume=Infinity,maxVolume=0,minY=Infinity,maxRadius=0;
let anchor=[0,0,0];
const start=performance.now();
for(let frame=0;frame<3600;frame++) {
  const phase=frame%480;
  if(phase===0)s.body.nudge(frame%960===0?1:-1);
  if(phase===120){s.body.beginGrab(weights);anchor=[...s.body.grab!.anchor];}
  if(phase>=120&&phase<240) {
    const t=(phase-120)/120;
    s.body.moveGrab([anchor[0]+.4*Math.sin(t*Math.PI*2),anchor[1]+.405*Math.sin(t*Math.PI*2),anchor[2]+.2*Math.sin(t*Math.PI)]);
  }
  if(phase===240)s.body.release();
  for(let substep=0;substep<4;substep++) {
  s.body.step(s.stepSize);
  const m=s.body.metrics();
  minTetRatio=Math.min(minTetRatio,m.minTetRatio);minVolume=Math.min(minVolume,m.volumeRatio);maxVolume=Math.max(maxVolume,m.volumeRatio);minY=Math.min(minY,m.minY);maxRadius=Math.max(maxRadius,m.maxRadius);
  assert.ok(m.finite,`nonfinite frame ${frame}`);
  if(m.minTetRatio<=0) {
    for(let t=0;t<s.body.mesh.volumes.length;t++) {
      const ids=Array.from(s.body.mesh.tets.subarray(t*4,t*4+4));
      if(tetVolume(s.body.position,ids[0],ids[1],ids[2],ids[3])<=0)console.log({frame,t,ids,points:ids.map(id=>Array.from(s.body.position.subarray(id*3,id*3+3))),metrics:m});
    }
  }
  assert.ok(m.minTetRatio>0,`inversion frame ${frame}: ${m.minTetRatio}`);
  }
}
const durationMs=performance.now()-start;s.body.release();for(let i=0;i<360;i++)s.advance(1/60);
const settled=s.body.metrics();assert.ok(Math.abs(settled.volumeRatio-1)<.03);assert.ok(minY>=-.01*s.body.mesh.height);
const oscillation=new Simulation();for(let i=0;i<180;i++)oscillation.advance(1/60);
const center=()=>{
  let tx=0,bx=0,tn=0,bn=0;
  for(let i=0;i<oscillation.body.mesh.mass.length;i++) {
    const h=oscillation.body.mesh.rest[i*3+1];
    if(h>.9*oscillation.body.mesh.height){tx+=oscillation.body.position[i*3];tn++;}
    if(h<.1){bx+=oscillation.body.position[i*3];bn++;}
  }
  return tx/tn-bx/bn;
};
const baseline=center();oscillation.nudge();
const samples:{t:number;x:number;energy:number}[]=[];
for(let i=0;i<360;i++){oscillation.advance(1/60);samples.push({t:(i+1)/60,x:center()-baseline,energy:oscillation.body.metrics().energy});}
const peaks=samples.filter((v,i)=>i>0&&i<samples.length-1&&Math.abs(v.x)>Math.abs(samples[i-1].x)&&Math.abs(v.x)>=Math.abs(samples[i+1].x));
const peakMagnitude=Math.max(...samples.map(s=>Math.abs(s.x)));
const visiblePeaks=peaks.filter(s=>Math.abs(s.x)>peakMagnitude*.08);
const lastVisible=samples.findLast(s=>Math.abs(s.x)>peakMagnitude*.08)?.t??0;
const energyRatioAt2Seconds=samples[119].energy/Math.max(...samples.map(s=>s.energy));
assert.ok(visiblePeaks.length>=4,'Nudge needs at least two visible back-and-forth cycles');
assert.ok(energyRatioAt2Seconds<.05,'Nudge should significantly settle by two seconds');
const report={simulatedSeconds:60,checkedSubsteps:14400,wallMilliseconds:durationMs,cage:s.body.mesh.quality,nodes:s.body.mesh.mass.length,tetrahedra:s.body.mesh.volumes.length,surfaceTriangles:skin.indices.length/3,minTetRatio,minVolume,maxVolume,minY,maxRadius,settled,oscillation:{peakMagnitude,visiblePeaks,lastVisible,energyRatioAt2Seconds},scope:'Every fixed substep checked during deterministic bounded grabs and alternating nudges at defaults; not a GPU benchmark'};
mkdirSync('evidence',{recursive:true});writeFileSync('evidence/physics-validation.json',JSON.stringify(report,null,2),'utf8');
writeFileSync('evidence/nudge-response.csv','seconds,topRelativeX,kineticEnergy\n'+samples.map(s=>`${s.t},${s.x},${s.energy}`).join('\n'),'utf8');
console.log(JSON.stringify(report,null,2));
