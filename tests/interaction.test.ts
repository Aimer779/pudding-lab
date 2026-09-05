import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute,BufferGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera } from 'three/webgpu';
import { Simulation } from '../src/physics/simulation.ts';
import { PuddingSurface } from '../src/pudding/surface.ts';
import { installGrab } from '../src/interaction/grab.ts';
import type { World } from '../src/scene/world.ts';
import { createWorld } from '../src/scene/world.ts';

test('a browser without WebGPU receives an explicit initialization failure',async()=>{
  assert.equal(navigator.gpu,undefined,'This test exercises the real non-GPU Node environment');
  await assert.rejects(createWorld({} as HTMLCanvasElement,new Simulation()),/cannot serve WebGPU/);
});

test('actual pointer handlers grab visible skin and release on cancel, lost capture and blur',()=>{
  const windowBefore=Object.getOwnPropertyDescriptor(globalThis,'window');
  const fakeWindow=new EventTarget();Object.defineProperty(globalThis,'window',{value:fakeWindow,configurable:true});
  const sim=new Simulation(),skin=new PuddingSurface(sim.body.mesh);
  const geometry=new BufferGeometry();geometry.setIndex(new BufferAttribute(skin.indices,1));geometry.setAttribute('position',new BufferAttribute(skin.positions,3));
  const pudding=new Mesh(geometry,new MeshBasicMaterial()),camera=new PerspectiveCamera(31,1,.1,20);
  camera.position.set(0,.67,6.8);camera.lookAt(0,.67,0);camera.updateMatrixWorld();pudding.updateMatrixWorld();
  class Canvas extends EventTarget {
    captured=false;
    classList={add:()=>{},remove:()=>{}};
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
    setPointerCapture(){this.captured=true;}
    hasPointerCapture(){return this.captured;}
    releasePointerCapture(){this.captured=false;}
  }
  const canvas=new Canvas();
  const event=(type:string,x=50,y=50)=>Object.assign(new Event(type),{pointerId:7,button:0,clientX:x,clientY:y});
  const handler=installGrab(canvas as unknown as HTMLCanvasElement,{camera,pudding,skin} as unknown as World,sim);
  try {
    for(const kind of ['pointercancel','lostpointercapture','blur']) {
      canvas.dispatchEvent(event('pointerdown'));assert.ok(sim.body.grab);assert.equal(canvas.captured,true);
      canvas.dispatchEvent(event('pointermove',58,42));assert.notDeepEqual(sim.body.grab.target,sim.body.grab.anchor);
      (kind==='blur'?fakeWindow:canvas).dispatchEvent(event(kind));assert.equal(sim.body.grab,null);assert.equal(canvas.captured,false);
    }
    canvas.dispatchEvent(event('pointerdown'));canvas.dispatchEvent(event('pointerup'));
    assert.ok(sim.body.velocity.some(v=>v!==0),'A short click must apply a tap impulse');
    sim.pause(true);canvas.dispatchEvent(event('pointerdown'));assert.equal(sim.body.grab,null);
  } finally {
    handler.dispose();geometry.dispose();pudding.material.dispose();
    if(windowBefore)Object.defineProperty(globalThis,'window',windowBefore);else Reflect.deleteProperty(globalThis,'window');
  }
});
