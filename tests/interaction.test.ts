import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute,BufferGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera } from 'three/webgpu';
import { Simulation } from '../src/physics/simulation.ts';
import { PuddingSurface } from '../src/pudding/surface.ts';
import { installGrab } from '../src/interaction/grab.ts';
import { installSpoon } from '../src/interaction/spoon.ts';
import type { Bite } from '../src/physics/soft-body.ts';
import type { World } from '../src/scene/world.ts';
import { createWorld } from '../src/scene/world.ts';
import { Vector3 } from 'three/webgpu';

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

test('the spoon tool presses on pointer down, bites on release and keeps the grab tool idle',()=>{
  const windowBefore=Object.getOwnPropertyDescriptor(globalThis,'window');
  const fakeWindow=new EventTarget();Object.defineProperty(globalThis,'window',{value:fakeWindow,configurable:true});
  const sim=new Simulation(),skin=new PuddingSurface(sim.body.mesh);
  const geometry=new BufferGeometry();geometry.setIndex(new BufferAttribute(skin.indices,1));geometry.setAttribute('position',new BufferAttribute(skin.positions,3));
  const pudding=new Mesh(geometry,new MeshBasicMaterial()),camera=new PerspectiveCamera(31,1,.1,20);
  // Looking down at the top so that dragging down on screen digs into the pudding.
  camera.position.set(0,5.5,3.5);camera.lookAt(0,.67,0);camera.updateMatrixWorld();pudding.updateMatrixWorld();
  class Canvas extends EventTarget {
    captured=false;classes=new Set<string>();
    classList={add:(c:string)=>{this.classes.add(c);},remove:(c:string)=>{this.classes.delete(c);}};
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
    setPointerCapture(){this.captured=true;}
    hasPointerCapture(){return this.captured;}
    releasePointerCapture(){this.captured=false;}
  }
  const canvas=new Canvas(),bites:Bite[]=[];
  const world={camera,pudding,skin,spoonTarget:new Vector3(),serving:false} as unknown as World;
  const event=(type:string,x=50,y=50)=>Object.assign(new Event(type),{pointerId:3,button:0,clientX:x,clientY:y});
  const grab=installGrab(canvas as unknown as HTMLCanvasElement,world,sim);
  const spoon=installSpoon(canvas as unknown as HTMLCanvasElement,world,sim,bite=>bites.push(bite));
  try {
    for(let i=0;i<60;i++)sim.advance(1/60);
    canvas.dispatchEvent(event('pointerdown'));assert.equal(sim.body.spoon===null,true,'the spoon is idle while fingers are active');
    assert.ok(sim.body.grab);canvas.dispatchEvent(event('pointerup'));
    sim.tool='spoon';
    canvas.dispatchEvent(event('pointermove'));assert.ok(world.spoonTarget.y>sim.body.mesh.height,'hovering rests the bowl just above the top it points at');
    canvas.dispatchEvent(event('pointerdown'));assert.equal(sim.body.grab,null);
    const pressing=sim.body.spoon;assert.ok(pressing);assert.ok(canvas.classes.has('pressing'));
    const cells=sim.body.mesh.cells.length,startY=pressing.center[1];
    for(let i=0;i<40;i++){canvas.dispatchEvent(event('pointermove',50,50+i*.5));sim.advance(1/60);}
    assert.ok(pressing.center[1]<startY-.15,`the bowl pressed down from ${startY} to ${pressing.center[1]}`);
    const pressed=sim.body.metrics();assert.ok(pressed.finite&&pressed.minTetRatio>0);
    canvas.dispatchEvent(event('pointerup'));
    assert.equal(sim.body.spoon,null);assert.equal(canvas.captured,false);
    assert.equal(bites.length,1);assert.ok(bites[0].cells.length>0);assert.equal(sim.body.mesh.cells.length,cells-bites[0].cells.length);
    assert.ok(sim.body.metrics().eatenRatio>0);
    canvas.dispatchEvent(event('pointerdown'));fakeWindow.dispatchEvent(new Event('blur'));
    assert.equal(sim.body.spoon,null,'blur cancels a press without biting');assert.equal(bites.length,1);
    const before=sim.body.mesh.cells.length;spoon.bite();
    assert.equal(bites.length,2);assert.ok(sim.body.mesh.cells.length<before,'the keyboard bite removes cells');
    sim.pause(true);canvas.dispatchEvent(event('pointerdown'));assert.equal(sim.body.spoon,null);
  } finally {
    grab.dispose();spoon.dispose();geometry.dispose();pudding.material.dispose();
    if(windowBefore)Object.defineProperty(globalThis,'window',windowBefore);else Reflect.deleteProperty(globalThis,'window');
  }
});
