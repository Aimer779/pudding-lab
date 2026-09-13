import { Raycaster,Vector2,Vector3,Plane } from 'three/webgpu';
import type { World } from '../scene/world.ts';
import type { Simulation } from '../physics/simulation.ts';
import { SPOON_RADII, SPOON_YAW } from '../physics/soft-body.ts';
import type { Bite, Spoon } from '../physics/soft-body.ts';

/** The spoon hovers over the skin, presses in while the pointer is down, and takes its bite on release. */
export function installSpoon(canvas:HTMLCanvasElement,world:World,sim:Simulation,onBite:(bite:Bite)=>void) {
  const abort=new AbortController(),options={signal:abort.signal};
  const ray=new Raycaster(),pointer=new Vector2(),plane=new Plane(),target=new Vector3(),rest=new Plane(new Vector3(0,1,0),-1.1);
  const spoon:Spoon={center:[0,1.9,0],radii:SPOON_RADII,yaw:SPOON_YAW};
  let active:number|null=null;
  const stats={presses:0,bites:0,lastBiteCells:0};
  function rayAt(e:PointerEvent) {
    const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    ray.setFromCamera(pointer,world.camera);
  }
  function place(x:number,y:number,z:number) {
    // The bowl bottom stays clear of the ground so the lowest layer is never crushed against it.
    spoon.center=[Math.max(-1.3,Math.min(1.3,x)),Math.max(SPOON_RADII[1]+.12,Math.min(2.4,y)),Math.max(-1.3,Math.min(1.3,z))];
    world.spoonTarget.set(spoon.center[0],spoon.center[1],spoon.center[2]);
  }
  function hover(e:PointerEvent) {
    rayAt(e);const hit=ray.intersectObject(world.pudding)[0];
    if(hit?.face){const n=hit.face.normal;place(hit.point.x+n.x*SPOON_RADII[1]*.95,hit.point.y+n.y*SPOON_RADII[1]*.95,hit.point.z+n.z*SPOON_RADII[1]*.95);}
    else if(ray.ray.intersectPlane(rest,target))place(target.x,target.y,target.z);
  }
  function cancel() {
    sim.body.spoon=null;
    if(active!==null&&canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);
    active=null;canvas.classList.remove('pressing');
  }
  function take(bite:Bite|null) {
    if(!bite)return;stats.bites++;stats.lastBiteCells=bite.cells.length;onBite(bite);
  }
  canvas.addEventListener('pointerdown',e=>{
    if(sim.tool!=='spoon'||sim.paused||sim.hidden||active!==null||e.button!==0||world.serving)return;
    hover(e);active=e.pointerId;stats.presses++;
    plane.setFromNormalAndCoplanarPoint(world.camera.getWorldDirection(new Vector3()),world.spoonTarget);
    sim.body.spoon=spoon;canvas.setPointerCapture(active);canvas.classList.add('pressing');
  },options);
  canvas.addEventListener('pointermove',e=>{
    if(sim.tool!=='spoon')return;
    if(active===null){if(!world.serving)hover(e);return;}
    if(active!==e.pointerId)return;
    if(sim.paused||!sim.body.spoon){cancel();return;}
    rayAt(e);if(ray.ray.intersectPlane(plane,target))place(target.x,target.y,target.z);
  },options);
  canvas.addEventListener('pointerup',e=>{
    if(active!==e.pointerId)return;
    const bite=sim.paused||sim.body.empty?null:sim.body.scoop(spoon);
    cancel();take(bite);
    // Rest the bowl just above the fresh hole; the serve animation lifts it further from there.
    if(bite)place(spoon.center[0],spoon.center[1]+.3,spoon.center[2]);
  },options);
  canvas.addEventListener('pointercancel',cancel,options);canvas.addEventListener('lostpointercapture',cancel,options);
  window.addEventListener('blur',cancel,options);
  return {
    cancel,stats,spoon,
    /** Keyboard alternative: bite the highest remaining part of the pudding, preferring the side facing the viewer. */
    bite() {
      if(sim.paused||sim.hidden||sim.body.empty||world.serving)return;
      const centers=Array.from(sim.body.mesh.cells,(_,i)=>sim.body.cellCenter(i));
      const top=Math.max(...centers.map(c=>c[1]));
      let best=0,front=-Infinity;
      centers.forEach((c,i)=>{if(c[1]>top-.1&&c[0]+c[2]>front){front=c[0]+c[2];best=i;}});
      const c=centers[best];place(c[0],c[1]-.04,c[2]);
      take(sim.body.scoop(spoon));
    },
    dispose(){cancel();abort.abort();},
  };
}
