import * as THREE from 'three/webgpu';
import { attribute, mix, uniform } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PuddingSurface } from '../pudding/surface.ts';
import type { Simulation } from '../physics/simulation.ts';

export const flavors={
  vanilla:{body:'#e4b763',top:'#672408'},
  berry:{body:'#e4aaa6',top:'#81283e'},
  matcha:{body:'#acbb79',top:'#4c642c'},
};
export type Flavor=keyof typeof flavors;
export async function createWorld(canvas:HTMLCanvasElement,sim:Simulation) {
  if(!navigator.gpu)throw new Error('This browser cannot serve WebGPU yet. Open this page in a WebGPU-enabled browser.');
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter)throw new Error('No WebGPU adapter is available. Please check hardware acceleration and try again.');
  const renderer=new THREE.WebGPURenderer({canvas,antialias:true,alpha:false});
  await renderer.init();
  if((renderer.backend as {isWebGPUBackend?:boolean}).isWebGPUBackend!==true) {renderer.dispose();throw new Error('A native WebGPU renderer is required.');}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e7e1');scene.fog=new THREE.Fog('#e9e7e1',10,24);
  const camera=new THREE.PerspectiveCamera(31,1,.1,50);
  camera.position.set(3.4,2.9,6.8);camera.lookAt(0,.67,0);
  const env=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
  const envTarget=pmrem.fromScene(env,.035);scene.environment=envTarget.texture;scene.environmentIntensity=.7;env.dispose();pmrem.dispose();
  const light=new THREE.DirectionalLight('#fff4db',2.2);light.position.set(-3,7,3);light.castShadow=true;
  light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-3;light.shadow.camera.right=3;
  light.shadow.camera.top=3;light.shadow.camera.bottom=-3;light.shadow.camera.near=.5;light.shadow.camera.far=15;
  light.shadow.normalBias=.012;light.shadow.bias=-.00015;light.shadow.radius=4;light.shadow.blurSamples=8;scene.add(light);
  const fill=new THREE.HemisphereLight('#fff9e7','#b7b9a7',.6);scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardNodeMaterial({color:'#e0dfd7',roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.006;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(24,48,'#989e90','#989e90');grid.position.y=-.004;
  (grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.045;scene.add(grid);
  const skin=new PuddingSurface(sim.body.mesh);
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(skin.indices,1));
  geometry.setAttribute('position',new THREE.BufferAttribute(skin.positions,3).setUsage(THREE.DynamicDrawUsage));
  const glaze=new Float32Array(skin.count);
  for(let i=0;i<skin.count;i++) {
    const x=skin.rest[i*3],y=skin.rest[i*3+1],z=skin.rest[i*3+2];
    const angle=Math.atan2(z,x),edge=1.235+.014*Math.sin(3*angle)+.012*Math.sin(7*angle);
    const t=THREE.MathUtils.clamp((y-edge)/.045,0,1);glaze[i]=t*t*(3-2*t);
  }
  geometry.setAttribute('glaze',new THREE.BufferAttribute(glaze,1));geometry.computeVertexNormals();
  const bodyColor=uniform(new THREE.Color(flavors.vanilla.body)),topColor=uniform(new THREE.Color(flavors.vanilla.top));
  const g=attribute<'float'>('glaze','float');
  const material=new THREE.MeshPhysicalNodeMaterial({metalness:0,ior:1.42,roughness:.34,clearcoat:.3});
  material.colorNode=mix(bodyColor,topColor,g);material.roughnessNode=mix(.34,.18,g);material.clearcoatNode=mix(.22,.85,g);
  material.clearcoatRoughness=.18;
  const pudding=new THREE.Mesh(geometry,material);pudding.castShadow=true;pudding.receiveShadow=true;scene.add(pudding);
  const wire=new THREE.Mesh(geometry,new THREE.MeshBasicNodeMaterial({color:'#655937',wireframe:true,transparent:true,opacity:.12,depthWrite:false}));
  wire.visible=false;scene.add(wire);
  const targetBody=new THREE.Color(flavors.vanilla.body),targetTop=new THREE.Color(flavors.vanilla.top);
  function flavor(name:Flavor){targetBody.set(flavors[name].body);targetTop.set(flavors[name].top);}
  function resize() {
    const {width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;
    if(width>1280)camera.setViewOffset(width,height,-width*.035,-height*.09,width,height);
    else camera.setViewOffset(width,height,0,-height*.125,width,height);
    camera.position.set(3.4,2.9,width>1280?6.8:7.7);camera.lookAt(0,.67,0);camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function update(dt:number) {
    const a=sim.paused||sim.hidden?1:sim.alpha;
    skin.update(sim.body.previous,sim.body.position,a);
    geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
    bodyColor.value.lerp(targetBody,1-Math.exp(-dt*8));topColor.value.lerp(targetTop,1-Math.exp(-dt*8));
  }
  function dispose(){observer.disconnect();renderer.setAnimationLoop(null);geometry.dispose();material.dispose();wire.material.dispose();ground.geometry.dispose();ground.material.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();envTarget.dispose();light.shadow.dispose();renderer.dispose();}
  const info=adapter.info;
  return {renderer,scene,camera,pudding,skin,wire,flavor,update,dispose,deviceInfo:{backend:'WebGPU',adapter:{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description},userAgent:navigator.userAgent,dpr:renderer.getPixelRatio(),three:THREE.REVISION}};
}
export type World=Awaited<ReturnType<typeof createWorld>>;
