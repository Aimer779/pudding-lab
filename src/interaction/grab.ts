import { Raycaster,Vector2,Vector3,Plane,Triangle } from 'three/webgpu';
import type { World } from '../scene/world.ts';
import type { Simulation } from '../physics/simulation.ts';
export function installGrab(canvas:HTMLCanvasElement,world:World,sim:Simulation) {
  const abort=new AbortController(),options={signal:abort.signal};
  const ray=new Raycaster(),pointer=new Vector2(),plane=new Plane(),target=new Vector3();
  let active:number|null=null,start:[number,number]=[0,0],distance=0,startPoint:Vector3|null=null;
  const stats={starts:0,moves:0,releases:0,lastReleaseDistance:0,lastReleaseEnergy:0};
  function rayAt(e:PointerEvent) {
    const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    ray.setFromCamera(pointer,world.camera);
  }
  function cancel(){sim.body.release();if(active!==null&&canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);active=null;canvas.classList.remove('grabbing');}
  canvas.addEventListener('pointerdown',e=>{
    if(sim.tool!=='grab'||sim.paused||sim.hidden||active!==null||e.button!==0)return;
    rayAt(e);const hit=ray.intersectObject(world.pudding)[0];if(!hit?.face)return;
    const {a,b,c}=hit.face,positions=world.pudding.geometry.attributes.position;
    const bary=Triangle.getBarycoord(hit.point,new Vector3().fromBufferAttribute(positions,a),new Vector3().fromBufferAttribute(positions,b),new Vector3().fromBufferAttribute(positions,c),new Vector3());
    if(!bary)return;
    sim.body.beginGrab(world.skin.hitWeights([a,b,c],[bary.x,bary.y,bary.z]));
    stats.starts++;
    startPoint=hit.point.clone();plane.setFromNormalAndCoplanarPoint(world.camera.getWorldDirection(new Vector3()),hit.point);
    active=e.pointerId;start=[e.clientX,e.clientY];distance=0;canvas.setPointerCapture(active);canvas.classList.add('grabbing');
  },options);
  canvas.addEventListener('pointermove',e=>{
    if(active!==e.pointerId)return;
    if(sim.paused||!sim.body.grab){cancel();return;}
    distance=Math.max(distance,Math.hypot(e.clientX-start[0],e.clientY-start[1]));rayAt(e);
    stats.moves++;
    if(ray.ray.intersectPlane(plane,target))sim.body.moveGrab([target.x,target.y,target.z]);
  },options);
  canvas.addEventListener('pointerup',e=>{
    if(active!==e.pointerId)return;
    stats.releases++;stats.lastReleaseDistance=distance;stats.lastReleaseEnergy=sim.body.metrics().energy;
    const tapped=distance<5&&startPoint&&!sim.paused;cancel();
    if(tapped&&startPoint)sim.body.tap([startPoint.x,startPoint.y,startPoint.z]);
  },options);
  canvas.addEventListener('pointercancel',cancel,options);canvas.addEventListener('lostpointercapture',cancel,options);
  window.addEventListener('blur',cancel,options);
  return {cancel,stats,dispose(){cancel();abort.abort();}};
}
