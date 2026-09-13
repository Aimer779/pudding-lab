import * as THREE from 'three/webgpu';
import { attribute, mix, uniform } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PuddingSurface } from '../pudding/surface.ts';
import { surfaceAttributes } from '../pudding/attributes.ts';
import { buildChunk } from '../pudding/chunk.ts';
import type { VolumeMesh } from '../physics/mesh.ts';
import { SPOON_RADII, SPOON_RIM, SPOON_YAW } from '../physics/soft-body.ts';
import type { Bite } from '../physics/soft-body.ts';
import { buildSpoon } from './spoon-mesh.ts';
import type { Simulation } from '../physics/simulation.ts';

export const flavors={
  vanilla:{body:'#e4b763',top:'#672408',cut:'#f0cf86'},
  berry:{body:'#e4aaa6',top:'#81283e',cut:'#f2c9c4'},
  matcha:{body:'#acbb79',top:'#4c642c',cut:'#c3cf98'},
};
export type Flavor=keyof typeof flavors;
const SERVE_SECONDS=1.6;
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
  /** The visible skin is rebuilt from the current cage whenever a bite changes the topology. */
  function skinGeometry(skin:PuddingSurface,mesh:VolumeMesh,positions:Float32Array) {
    const geometry=new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(skin.indices,1));
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    const {glaze,cut}=surfaceAttributes(skin,mesh);
    geometry.setAttribute('glaze',new THREE.BufferAttribute(glaze,1));geometry.setAttribute('cut',new THREE.BufferAttribute(cut,1));
    geometry.computeVertexNormals();return geometry;
  }
  const bodyColor=uniform(new THREE.Color(flavors.vanilla.body)),topColor=uniform(new THREE.Color(flavors.vanilla.top)),cutColor=uniform(new THREE.Color(flavors.vanilla.cut));
  const g=attribute<'float'>('glaze','float'),c=attribute<'float'>('cut','float');
  const material=new THREE.MeshPhysicalNodeMaterial({metalness:0,ior:1.42,roughness:.34,clearcoat:.3});
  material.colorNode=mix(mix(bodyColor,topColor,g),cutColor,c);material.roughnessNode=mix(mix(.34,.18,g),.62,c);material.clearcoatNode=mix(mix(.22,.85,g),.04,c);
  material.clearcoatRoughness=.18;
  let skin=new PuddingSurface(sim.body.mesh),skinVersion=sim.body.version;
  const pudding=new THREE.Mesh(skinGeometry(skin,sim.body.mesh,skin.positions),material);pudding.castShadow=true;pudding.receiveShadow=true;scene.add(pudding);
  const wire=new THREE.Mesh(pudding.geometry,new THREE.MeshBasicNodeMaterial({color:'#655937',wireframe:true,transparent:true,opacity:.12,depthWrite:false}));
  wire.visible=false;scene.add(wire);
  let showMesh=false;
  function rebuildSkin() {
    skin=new PuddingSurface(sim.body.mesh);skinVersion=sim.body.version;
    pudding.geometry.dispose();pudding.geometry=skinGeometry(skin,sim.body.mesh,skin.positions);wire.geometry=pudding.geometry;
    pudding.visible=!sim.body.empty;wire.visible=showMesh&&!sim.body.empty;
  }
  // The spoon: a dish matching the physics pusher, turned so the handle points toward the viewer's right.
  // The bite sits on an unrotated plate so its frozen world-space vertices keep their orientation.
  const steel=new THREE.MeshStandardNodeMaterial({color:'#dcdbd5',metalness:.94,roughness:.2,side:THREE.DoubleSide});
  const spoon=new THREE.Group();spoon.visible=false;
  const cutlery=buildSpoon(steel);cutlery.group.rotation.y=SPOON_YAW;spoon.add(cutlery.group);
  const plate=new THREE.Group();spoon.add(plate);scene.add(spoon);
  const spoonTarget=new THREE.Vector3(0,1.9,0),lift=new THREE.Vector3(),toward=new THREE.Vector3(3.4,2.2,6.8).normalize();
  let serving:{chunk:THREE.Mesh;time:number}|null=null;
  /** Lifts the bite on the spoon toward the viewer and shrinks it away: eaten. */
  function serve(bite:Bite) {
    const built=buildChunk(bite);if(!built)return;
    const chunk=new THREE.Mesh(skinGeometry(built.skin,built.mesh,built.positions),material);chunk.castShadow=true;
    // Seat the bite in the dish: its underside rests just above the dish bottom and heaps over the rim.
    chunk.geometry.computeBoundingBox();const centre=chunk.geometry.boundingBox!.getCenter(new THREE.Vector3());
    chunk.position.copy(centre).negate().setY(-chunk.geometry.boundingBox!.min.y-SPOON_RADII[1]*(1-(1+SPOON_RIM)*.35));plate.add(chunk);plate.scale.setScalar(1);
    if(serving)finishServing();
    serving={chunk,time:0};
  }
  function finishServing() {
    if(!serving)return;
    plate.remove(serving.chunk);serving.chunk.geometry.dispose();serving=null;lift.set(0,0,0);
  }
  const targetBody=new THREE.Color(flavors.vanilla.body),targetTop=new THREE.Color(flavors.vanilla.top),targetCut=new THREE.Color(flavors.vanilla.cut);
  function flavor(name:Flavor){targetBody.set(flavors[name].body);targetTop.set(flavors[name].top);targetCut.set(flavors[name].cut);}
  function resize() {
    const {width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;
    if(width>1280)camera.setViewOffset(width,height,-width*.035,-height*.09,width,height);
    else camera.setViewOffset(width,height,0,-height*.125,width,height);
    camera.position.set(3.4,2.9,width>1280?6.8:7.7);camera.lookAt(0,.67,0);camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function update(dt:number) {
    if(skinVersion!==sim.body.version)rebuildSkin();
    const a=sim.paused||sim.hidden?1:sim.alpha;
    if(!sim.body.empty) {
      skin.update(sim.body.previous,sim.body.position,a);
      const geometry=pudding.geometry;
      geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
    }
    if(serving) {
      serving.time+=dt;const t=Math.min(1,serving.time/SERVE_SECONDS),ease=t*t*(3-2*t);
      lift.copy(toward).multiplyScalar(ease*.9).setY(ease*.55);
      const bitten=Math.min(1,Math.max(0,(t-.6)/.35));plate.scale.setScalar(1-bitten*bitten*(3-2*bitten));
      if(t>=1)finishServing();
    }
    spoon.position.copy(spoonTarget).add(lift);
    const k=1-Math.exp(-dt*8);
    bodyColor.value.lerp(targetBody,k);topColor.value.lerp(targetTop,k);cutColor.value.lerp(targetCut,k);
  }
  function dispose(){observer.disconnect();renderer.setAnimationLoop(null);finishServing();pudding.geometry.dispose();material.dispose();wire.material.dispose();steel.dispose();cutlery.dispose();ground.geometry.dispose();ground.material.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();envTarget.dispose();light.shadow.dispose();renderer.dispose();}
  const info=adapter.info;
  return {
    renderer,scene,camera,pudding,wire,spoon,spoonTarget,flavor,update,dispose,serve,
    get skin(){return skin;},
    get serving(){return serving!==null;},
    /** Wireframe visibility follows the toggle but never shows an empty cage. */
    set mesh(visible:boolean){showMesh=visible;wire.visible=visible&&!sim.body.empty;},
    get mesh(){return showMesh;},
    deviceInfo:{backend:'WebGPU',adapter:{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description},userAgent:navigator.userAgent,dpr:renderer.getPixelRatio(),three:THREE.REVISION},
  };
}
export type World=Awaited<ReturnType<typeof createWorld>>;
