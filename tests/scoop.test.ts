import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/physics/simulation.ts';
import { SPOON_RADII } from '../src/physics/soft-body.ts';
import type { Vec3 } from '../src/physics/mesh.ts';
import { makeVolumeMesh, repairRemoval, cellIndex } from '../src/physics/mesh.ts';
import { PuddingSurface } from '../src/pudding/surface.ts';
import { buildChunk } from '../src/pudding/chunk.ts';
import { surfaceAttributes } from '../src/pudding/attributes.ts';

const run=(s:Simulation,seconds:number)=>{for(let i=0;i<seconds*60;i++)s.advance(1/60);};
const closed=(quads:[number,number,number,number][])=>{
  const edges=new Map<string,number>();
  for(const q of quads)for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4];const k=a<b?`${a},${b}`:`${b},${a}`;edges.set(k,(edges.get(k)??0)+1);}
  return [...edges.values()].every(c=>c===2);
};

test('the complete cage is unchanged by the cell-removal refactor',()=>{
  const m=makeVolumeMesh();
  assert.equal(m.mass.length,486);assert.equal(m.volumes.length,1920);assert.equal(m.quads.length,288);
  assert.ok(m.outer.every(v=>v===1||v===0));assert.equal(m.removed.size,0);
  assert.ok(Math.abs(m.fullVolume-m.volumes.reduce((a,b)=>a+b,0))<1e-9);
  assert.ok(closed(m.quads));assert.equal(new PuddingSurface(m).indices.length/3,9216);
});

test('removing cells keeps a closed manifold boundary and exposes interior nodes as cut',()=>{
  const n=8,removed=new Set([cellIndex(3,4,3,n),cellIndex(4,4,3,n),cellIndex(3,4,4,n),cellIndex(4,4,4,n),cellIndex(4,3,4,n)]);
  const m=makeVolumeMesh(n,5,removed),skin=new PuddingSurface(m);
  assert.equal(m.cells.length,320-5);assert.equal(m.volumes.length,315*6);
  assert.ok(closed(m.quads));assert.ok(m.quads.length>288);
  const {glaze,cut}=surfaceAttributes(skin,m);
  assert.ok(cut.some(v=>v>.9),'freshly exposed floor must be fully cut');
  assert.ok(glaze.some(v=>v>.9),'the remaining rim keeps its caramel');
  for(let i=0;i<skin.count;i++)assert.ok(glaze[i]+cut[i]<=1.0001);
  const outerNodes=m.nodeIds.filter((_,i)=>m.outer[i]===1).length;
  assert.ok(outerNodes>0&&outerNodes<m.mass.length);
});

test('removal repair eliminates edge-only and vertex-only contacts and drops loose crumbs',()=>{
  const n=8,layers=5;
  // Diagonal pair around a vertical edge on the top layer.
  const diagonal=new Set([cellIndex(3,4,3,n),cellIndex(4,4,4,n)]);
  repairRemoval(n,layers,diagonal,()=>0);
  assert.ok(closed(makeVolumeMesh(n,layers,diagonal).quads));
  // A single cell left hanging on by one edge after its neighbours are gone.
  const ring=new Set<number>();
  for(let x=0;x<n;x++)for(let z=0;z<n;z++)if(!(x===0&&z===0))ring.add(cellIndex(x,4,z,n));
  ring.delete(cellIndex(1,4,1,n));
  repairRemoval(n,layers,ring,c=>c);
  const repaired=makeVolumeMesh(n,layers,ring);
  assert.ok(closed(repaired.quads));
  assert.ok(ring.has(cellIndex(0,4,0,n))||ring.has(cellIndex(1,4,1,n)),'one of the edge-touching cells is eaten');
  // Whole slice removal splits nothing but a full column cut removes the smaller side.
  const split=new Set<number>();
  for(let y=0;y<layers;y++)for(let z=0;z<n;z++)split.add(cellIndex(2,y,z,n));
  repairRemoval(n,layers,split,()=>0);
  for(let y=0;y<layers;y++)for(let z=0;z<n;z++)for(let x=0;x<2;x++)assert.ok(split.has(cellIndex(x,y,z,n)));
  assert.ok(closed(makeVolumeMesh(n,layers,split).quads));
});

test('a spoon press deforms without inversion and the scoop removes a bounded bite',()=>{
  const s=new Simulation();run(s,2);
  const spoon={center:[.25,s.body.mesh.height+SPOON_RADII[1]*.9,.1] as Vec3,radii:SPOON_RADII};
  s.body.spoon=spoon;let minRatio=Infinity;
  for(let i=0;i<90;i++){spoon.center[1]-=.3/90;s.advance(1/60);minRatio=Math.min(minRatio,s.body.metrics().minTetRatio);}
  assert.ok(minRatio>0,`press inverted ${minRatio}`);
  const before=s.body.metrics(),nodesBefore=s.body.mesh.mass.length,version=s.body.version;
  const started=performance.now(),bite=s.body.scoop(spoon),took=performance.now()-started;
  s.body.spoon=null;
  assert.ok(bite,'a pressed spoon must take a bite');
  assert.ok(bite.cells.length>=2&&bite.cells.length<=14,`bite of ${bite.cells.length} cells`);
  assert.equal(s.body.version,version+1);assert.ok(s.body.mesh.mass.length<nodesBefore);
  assert.ok(closed(s.body.mesh.quads));
  const chunk=buildChunk(bite);assert.ok(chunk,'a compact bite is a closed chunk');
  assert.ok(chunk.positions.every(Number.isFinite)&&chunk.skin.indices.length>0);
  const after=s.body.metrics();
  assert.ok(after.eatenRatio>0&&after.eatenRatio<.15,`eaten ${after.eatenRatio}`);
  assert.ok(after.finite&&after.minTetRatio>0);
  run(s,5);const settled=s.body.metrics();
  assert.ok(settled.finite&&settled.minTetRatio>0&&Math.abs(settled.volumeRatio-1)<.03,JSON.stringify(settled));
  console.log('scoop',{bite:bite.cells.length,scoopMs:took,nodes:s.body.mesh.mass.length,tets:s.body.mesh.volumes.length,before:before.volumeRatio,eaten:after.eatenRatio});
});

test('the whole pudding can be eaten bite by bite and reset restores the complete cage',()=>{
  const s=new Simulation();run(s,1);
  let bites=0,chunks=0,sizes:number[]=[];
  while(!s.body.empty&&bites<120) {
    let best=0,top=-Infinity;
    for(let i=0;i<s.body.mesh.cells.length;i++){const c=s.body.cellCenter(i);if(c[1]>top){top=c[1];best=i;}}
    const c=s.body.cellCenter(best);
    const bite=s.body.scoop({center:[c[0],c[1]+.05,c[2]],radii:SPOON_RADII});
    assert.ok(bite,`bite ${bites} at ${c}`);bites++;sizes.push(bite.cells.length);if(buildChunk(bite))chunks++;
    run(s,.5);const m=s.body.metrics();
    assert.ok(m.finite&&m.minTetRatio>0,JSON.stringify({bites,...m}));
  }
  assert.ok(s.body.empty,'everything was eaten');
  assert.ok(Math.abs(s.body.metrics().eatenRatio-1)<1e-9);
  assert.ok(bites>=8&&bites<120,`${bites} bites`);
  s.advance(1/60);
  s.reset();
  assert.equal(s.body.mesh.mass.length,486);assert.equal(s.body.eaten.size,0);assert.equal(s.body.metrics().eatenRatio,0);
  assert.deepEqual(s.body.position,s.body.mesh.rest);
  assert.ok(chunks>=bites*.8,`${chunks} of ${bites} bites were closed chunks`);
  console.log('eaten in',bites,'bites; chunks',chunks,'sizes',sizes.join(' '));
});
