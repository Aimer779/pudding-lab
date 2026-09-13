import { makeVolumeMesh, repairRemoval, tetVolume, cellCoords, nodeIndex } from './mesh.ts';
import type { Vec3, VolumeMesh } from './mesh.ts';

/** The bowl is an ellipsoid; `yaw` is its rotation about y (three.js convention), long axis along local x. */
export interface Spoon { center: Vec3; radii: Vec3; yaw?: number }
/** A removed bite together with the body state it was cut from, so a visual chunk can be built from it. */
export interface Bite { cells: number[]; source: { mesh: VolumeMesh; position: Float64Array } }
/** Long axis along the handle, shallow depth, narrower across. */
export const SPOON_RADII: Vec3 = [.42, .26, .30];
/** Rim plane in normalised bowl height; only the dish below it exists physically, the rest is the heap it can hold. */
export const SPOON_RIM = -.35;
/** Handle points toward the viewer's right (+x, +z in world). */
export const SPOON_YAW = -Math.atan2(.6, .8);
/** Normalised bowl-local coordinates of a world point: unit sphere is the bowl surface. */
export function spoonLocal(spoon: Spoon, x: number, y: number, z: number): Vec3 {
  const c = Math.cos(spoon.yaw ?? 0), s = Math.sin(spoon.yaw ?? 0), dx = x-spoon.center[0], dz = z-spoon.center[2];
  return [(c*dx-s*dz)/spoon.radii[0], (y-spoon.center[1])/spoon.radii[1], (s*dx+c*dz)/spoon.radii[2]];
}

export class SoftBody {
  mesh:VolumeMesh;
  position:Float64Array;
  previous:Float64Array;
  velocity:Float64Array;
  inverseMass:Float64Array;
  private old:Float64Array;
  private readonly full:VolumeMesh;
  private readonly gradients=new Float64Array(12);
  /** Rest volumes straight from the grid, before any snapping; the guard for how far a cut node may move. */
  private pristine:Float64Array;
  /** Rest offsets by grid node id from snapping cut faces toward the spoon; reapplied after every rebuild. */
  private readonly restOffsets=new Map<number,Vec3>();
  /** Increments whenever the topology changes so bound surfaces know to rebuild. */
  version=0;
  firmness=.45;
  damping=3.04;
  grab: {weights:[number,number][];target:Vec3;cursor:Vec3;anchor:Vec3} | null=null;
  spoon: Spoon | null=null;
  constructor(mesh=makeVolumeMesh()) {
    this.full=mesh.removed.size?makeVolumeMesh(mesh.n,mesh.layers):mesh;
    this.mesh=mesh;this.position=mesh.rest.slice();this.previous=mesh.rest.slice();
    this.old=mesh.rest.slice();this.velocity=new Float64Array(mesh.rest.length);
    this.inverseMass=Float64Array.from(mesh.mass,m=>1/m);this.pristine=mesh.volumes.slice();
  }
  get eaten(){return this.mesh.removed;}
  get empty(){return this.mesh.cells.length===0;}
  get snappedNodes(){return this.restOffsets.size;}
  reset(drop=0) {
    this.restOffsets.clear();
    if(this.mesh!==this.full)this.rebuild(this.full);
    this.position.set(this.mesh.rest);this.velocity.fill(0);this.grab=null;this.spoon=null;
    for(let i=1;i<this.position.length;i+=3) this.position[i]+=drop;
    this.previous.set(this.position);this.old.set(this.position);
  }
  point(weights:[number,number][]):Vec3 {
    const p:Vec3=[0,0,0];
    for(const [id,w] of weights) for(let k=0;k<3;k++) p[k]+=this.position[id*3+k]*w;
    return p;
  }
  /** Current centre of an active cell, averaged over its eight corner nodes. */
  cellCenter(index:number):Vec3 {
    const {n,lookup}=this.mesh,[x,y,z]=cellCoords(this.mesh.cells[index],n),c:Vec3=[0,0,0];
    for(const dx of [0,1])for(const dy of [0,1])for(const dz of [0,1]) {
      const j=lookup[nodeIndex(x+dx,y+dy,z+dz,n)]*3;
      for(let k=0;k<3;k++)c[k]+=this.position[j+k]/8;
    }
    return c;
  }
  /**
   * Eats every cell whose centre lies inside the spoon (grown by `margin`), then repairs the remainder into
   * one closed body. Returns the bite and the pre-cut state, or null when nothing was inside the spoon.
   */
  scoop(spoon:Spoon,margin=.06):Bite|null {
    const {n,layers,cells}=this.mesh,removed=new Set(this.mesh.removed);
    const grown:Spoon={...spoon,radii:spoon.radii.map(r=>r+margin) as Vec3};
    const distance=(c:Vec3)=>Math.hypot(...spoonLocal(grown,c[0],c[1],c[2]));
    const scores=new Map<number,number>();
    for(let i=0;i<cells.length;i++){const d=distance(this.cellCenter(i));scores.set(cells[i],d);if(d<1)removed.add(cells[i]);}
    if(removed.size===this.mesh.removed.size)return null;
    repairRemoval(n,layers,removed,cell=>scores.get(cell)??Infinity);
    const bite=[...removed].filter(id=>!this.mesh.removed.has(id));
    const source={mesh:this.mesh,position:this.position.slice()};
    this.rebuild(makeVolumeMesh(n,layers,removed));
    this.snap(grown);
    return {cells:bite,source};
  }
  private rebuild(mesh:VolumeMesh) {
    const old=this.mesh,position=this.position,velocity=this.velocity,count=mesh.mass.length;
    this.mesh=mesh;this.pristine=mesh.volumes.slice();this.position=new Float64Array(count*3);this.velocity=new Float64Array(count*3);
    for(let i=0;i<count;i++) {
      const j=old.lookup[mesh.nodeIds[i]],offset=this.restOffsets.get(mesh.nodeIds[i]);
      for(let k=0;k<3;k++) {
        if(offset)mesh.rest[i*3+k]+=offset[k];
        this.position[i*3+k]=j>=0?position[j*3+k]:mesh.rest[i*3+k];this.velocity[i*3+k]=j>=0?velocity[j*3+k]:0;
      }
    }
    this.previous=this.position.slice();this.old=this.position.slice();
    this.refreshRest();this.grab=null;this.version++;
  }
  /** Recomputes rest lengths, rest volumes and masses after the rest positions moved. */
  private refreshRest() {
    const {rest,tets,volumes,edges,lengths,mass}=this.mesh;mass.fill(0);
    for(let t=0;t<volumes.length;t++) {
      const a=tets[t*4],b=tets[t*4+1],c=tets[t*4+2],d=tets[t*4+3],v=tetVolume(rest,a,b,c,d);
      volumes[t]=v;mass[a]+=v/4;mass[b]+=v/4;mass[c]+=v/4;mass[d]+=v/4;
    }
    for(let e=0;e<lengths.length;e++) {
      const a=edges[e*2]*3,b=edges[e*2+1]*3;
      lengths[e]=Math.hypot(rest[a]-rest[b],rest[a+1]-rest[b+1],rest[a+2]-rest[b+2]);
    }
    this.inverseMass=Float64Array.from(mass,m=>1/m);
  }
  /**
   * Vertex snapping: boundary nodes near the spoon surface move onto it, in rest space and deformed space
   * alike, so the hole follows the bowl instead of the cell staircase. Each move is capped below half a
   * cell and rejected when an incident tetrahedron would leave 30%–250% of its grid rest volume. The
   * original outer skin is only ever pulled toward the hole, never bulged outward.
   */
  private snap(spoon:Spoon) {
    const mesh=this.mesh,{rest,tets,quads,outer,nodeIds}=mesh,p=this.position;
    const cap=.42*Math.min(2/mesh.n,mesh.height/mesh.layers),c=Math.cos(spoon.yaw??0),s=Math.sin(spoon.yaw??0);
    const incident:number[][]=Array.from({length:mesh.mass.length},()=>[]);
    for(let t=0;t<tets.length;t++)incident[tets[t]].push(t>>2);
    for(const i of new Set(quads.flat())) {
      const [qx,qy,qz]=spoonLocal(spoon,p[i*3],p[i*3+1],p[i*3+2]),d=Math.hypot(qx,qy,qz);
      if(d<1e-6||Math.abs(d-1)>.4||(outer[i]&&d<1))continue;
      const k=1/d-1,lx=qx*spoon.radii[0]*k,lz=qz*spoon.radii[2]*k;
      let dx=c*lx+s*lz,dy=qy*spoon.radii[1]*k,dz=-s*lx+c*lz;
      const length=Math.hypot(dx,dy,dz);if(length<1e-4)continue;
      const scale=Math.min(1,cap/length);dx*=scale;dy*=scale;dz*=scale;
      for(let attempt=0;attempt<3;attempt++) {
        rest[i*3]+=dx;rest[i*3+1]+=dy;rest[i*3+2]+=dz;
        const ok=incident[i].every(t=>{
          const v=tetVolume(rest,tets[t*4],tets[t*4+1],tets[t*4+2],tets[t*4+3]);
          return v>.3*this.pristine[t]&&v<2.5*this.pristine[t];
        });
        if(ok) {
          for(const arr of [p,this.previous,this.old]){arr[i*3]+=dx;arr[i*3+1]+=dy;arr[i*3+2]+=dz;}
          const prior=this.restOffsets.get(nodeIds[i])??[0,0,0];
          this.restOffsets.set(nodeIds[i],[prior[0]+dx,prior[1]+dy,prior[2]+dz]);break;
        }
        rest[i*3]-=dx;rest[i*3+1]-=dy;rest[i*3+2]-=dz;dx*=.5;dy*=.5;dz*=.5;
      }
    }
    this.refreshRest();
  }
  beginGrab(weights:[number,number][]) {
    const anchor=this.point(weights);
    this.grab={weights,target:[...anchor],cursor:[...anchor],anchor};
  }
  moveGrab(target:Vec3) {
    if(!this.grab)return;
    const delta=target.map((v,k)=>v-this.grab!.anchor[k]);
    const length=Math.hypot(...delta),scale=Math.min(1,.62/(length||1));
    this.grab.target=this.grab.anchor.map((v,k)=>v+delta[k]*scale) as Vec3;
    this.grab.target[0]=Math.max(-1.1,Math.min(1.1,this.grab.target[0]));
    this.grab.target[2]=Math.max(-1.1,Math.min(1.1,this.grab.target[2]));
    this.grab.target[1]=Math.max(.16,Math.min(1.95,this.grab.target[1]));
  }
  release() {this.grab=null;}
  nudge(direction=1) {
    for(let i=0;i<this.mesh.mass.length;i++) {
      const h=this.mesh.rest[i*3+1]/this.mesh.height;
      this.velocity[i*3]+=1.8*direction*h*h;
      this.velocity[i*3+1]+=.22*h;
      this.velocity[i*3+2]+=.18*h;
    }
  }
  tap(point:Vec3) {
    for(let i=0;i<this.mesh.mass.length;i++) {
      const j=i*3,d=Math.hypot(this.position[j]-point[0],this.position[j+1]-point[1],this.position[j+2]-point[2]);
      const strength=Math.exp(-d*d/0.16);
      this.velocity[j+1]-=.75*strength;
      this.velocity[j]+=.25*strength;
    }
  }
  step(dt:number) {
    const p=this.position,v=this.velocity,w=this.inverseMass;
    this.previous.set(p);this.old.set(p);
    for(let i=0;i<w.length;i++) {
      const j=i*3;v[j+1]-=9.81*dt;
      for(let k=0;k<3;k++) p[j+k]+=v[j+k]*dt;
    }
    // Small-step XPBD: multipliers start at zero each substep, one projection per constraint.
    this.solveEdges(dt);
    this.solveGrab(dt);
    this.solveVolumes(dt);
    this.collide();
    for(let i=0;i<v.length;i++)v[i]=(p[i]-this.old[i])/dt;
    this.dampInternal(dt);
    for(let i=0;i<w.length;i++) {
      const j=i*3;
      if(p[j+1]<=.0001) {
        // Dissipate tangential contact motion, while deformation damping remains internal.
        const speed=Math.hypot(v[j],v[j+2]);
        const normalImpulse=Math.max(0,-(p[j+1]-this.old[j+1])/dt)+9.81*dt;
        const factor=Math.max(0,1-.8*normalImpulse/(speed+1e-12));
        v[j]*=factor;v[j+2]*=factor;v[j+1]=Math.max(0,v[j+1]);
      }
    }
  }
  private solveEdges(dt:number) {
    const p=this.position,w=this.inverseMass,{edges,lengths}=this.mesh;
    const alpha=(.003+Math.pow(1-this.firmness,2)*.2)/(dt*dt);
    for(let e=0;e<lengths.length;e++) {
      const ia=edges[e*2],ib=edges[e*2+1],a=ia*3,b=ib*3;
      const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2];
      const len=Math.hypot(x,y,z);if(len<1e-9)continue;
      const dl=-(len-lengths[e])/(w[ia]+w[ib]+alpha)/len;
      p[a]+=x*dl*w[ia];p[a+1]+=y*dl*w[ia];p[a+2]+=z*dl*w[ia];
      p[b]-=x*dl*w[ib];p[b+1]-=y*dl*w[ib];p[b+2]-=z*dl*w[ib];
    }
  }
  private solveVolumes(dt:number) {
    const p=this.position,w=this.inverseMass,{tets,volumes}=this.mesh,g=this.gradients;
    const alpha=1e-10/(dt*dt);
    for(let t=0;t<volumes.length;t++) {
      const a=tets[t*4]*3,b=tets[t*4+1]*3,c=tets[t*4+2]*3,d=tets[t*4+3]*3;
      const bx=p[b]-p[a],by=p[b+1]-p[a+1],bz=p[b+2]-p[a+2];
      const cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2];
      const dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
      g[3]=(cy*dz-cz*dy)/6;g[4]=(cz*dx-cx*dz)/6;g[5]=(cx*dy-cy*dx)/6;
      g[6]=(dy*bz-dz*by)/6;g[7]=(dz*bx-dx*bz)/6;g[8]=(dx*by-dy*bx)/6;
      g[9]=(by*cz-bz*cy)/6;g[10]=(bz*cx-bx*cz)/6;g[11]=(bx*cy-by*cx)/6;
      for(let k=0;k<3;k++)g[k]=-g[3+k]-g[6+k]-g[9+k];
      const volume=bx*g[3]+by*g[4]+bz*g[5];
      let denom=alpha;
      for(let j=0;j<4;j++)denom+=w[tets[t*4+j]]*(g[j*3]**2+g[j*3+1]**2+g[j*3+2]**2);
      const dl=-(volume-volumes[t])/denom;
      for(let j=0;j<4;j++)for(let k=0;k<3;k++)p[tets[t*4+j]*3+k]+=w[tets[t*4+j]]*g[j*3+k]*dl;
    }
  }
  private solveGrab(dt:number) {
    if(!this.grab)return;
    const {weights,target,cursor}=this.grab,current=this.point(weights);
    const distance=Math.hypot(target[0]-cursor[0],target[1]-cursor[1],target[2]-cursor[2]);
    const follow=Math.min(1,2.5*dt/(distance||1));
    for(let k=0;k<3;k++)cursor[k]+=(target[k]-cursor[k])*follow;
    let denom=.0000004/(dt*dt);
    for(const [id,weight] of weights)denom+=this.inverseMass[id]*weight*weight;
    for(let k=0;k<3;k++) {
      const correction=cursor[k]-current[k];
      for(const [id,weight] of weights)this.position[id*3+k]+=correction*this.inverseMass[id]*weight/denom;
    }
  }
  private collide() {
    const p=this.position;
    if(this.spoon) {
      // A soft pusher shaped like the dish below the rim: nodes under the bowl move part of the way to its
      // surface each substep, so the spoon sinks in instead of acting as a rigid wall. Pudding above the rim
      // plane is left alone; that is what ends up sitting in the spoon.
      const {radii}=this.spoon,c=Math.cos(this.spoon.yaw??0),s=Math.sin(this.spoon.yaw??0);
      for(let i=0;i<p.length;i+=3) {
        const [qx,qy,qz]=spoonLocal(this.spoon,p[i],p[i+1],p[i+2]);
        const d=Math.hypot(qx,qy,qz);if(qy>=SPOON_RIM||d>=1||d<1e-6)continue;
        const k=.25*(1/d-1),lx=qx*radii[0]*k,lz=qz*radii[2]*k;
        p[i]+=c*lx+s*lz;p[i+1]+=qy*radii[1]*k;p[i+2]+=-s*lx+c*lz;
      }
    }
    for(let i=0;i<p.length;i+=3) {
      p[i+1]=Math.max(0,p[i+1]);
    }
    // A collective stage constraint preserves shape at the interaction boundary.
    // Clipping each particle against an invisible wall collapses whole tetrahedra.
    let x=0,z=0,mass=0;
    for(let i=0;i<this.mesh.mass.length;i++){const m=this.mesh.mass[i];mass+=m;x+=this.position[i*3]*m;z+=this.position[i*3+2]*m;}
    if(mass<=0)return;
    x/=mass;z/=mass;
    const dx=Math.max(-.38,Math.min(.38,x))-x,dz=Math.max(-.3,Math.min(.3,z))-z;
    if(dx||dz)for(let i=0;i<this.position.length;i+=3){this.position[i]+=dx;this.position[i+2]+=dz;}
  }
  private dampInternal(dt:number) {
    const {edges,lengths}=this.mesh,p=this.position,v=this.velocity,w=this.inverseMass;
    const amount=1-Math.exp(-this.damping*dt*.04);
    for(let e=0;e<lengths.length;e++) {
      const ia=edges[e*2],ib=edges[e*2+1],a=ia*3,b=ib*3;
      const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2],len2=x*x+y*y+z*z;
      if(len2<1e-12)continue;
      // Pairwise central impulses conserve translation and rotation.
      const impulse=((v[a]-v[b])*x+(v[a+1]-v[b+1])*y+(v[a+2]-v[b+2])*z)*amount/(len2*(w[ia]+w[ib]));
      v[a]-=x*impulse*w[ia];v[a+1]-=y*impulse*w[ia];v[a+2]-=z*impulse*w[ia];
      v[b]+=x*impulse*w[ib];v[b+1]+=y*impulse*w[ib];v[b+2]+=z*impulse*w[ib];
    }
  }
  metrics() {
    let volume=0,rest=0,minRatio=Infinity,energy=0,minY=Infinity,maxRadius=0;
    for(let t=0;t<this.mesh.volumes.length;t++) {
      const ids=this.mesh.tets.subarray(t*4,t*4+4);
      const v=tetVolume(this.position,ids[0],ids[1],ids[2],ids[3]);
      volume+=v;rest+=this.mesh.volumes[t];minRatio=Math.min(minRatio,v/this.mesh.volumes[t]);
    }
    for(let i=0;i<this.mesh.mass.length;i++) {
      const j=i*3;
      energy+=.5*this.mesh.mass[i]*(this.velocity[j]**2+this.velocity[j+1]**2+this.velocity[j+2]**2);
      minY=Math.min(minY,this.position[j+1]);maxRadius=Math.max(maxRadius,Math.hypot(this.position[j],this.position[j+2]));
    }
    let eatenVolume=0;for(const cell of this.mesh.removed)eatenVolume+=this.mesh.cellVolumes[cell];
    const empty=this.mesh.volumes.length===0;
    return {volumeRatio:empty?1:volume/rest,minTetRatio:empty?1:minRatio,energy,minY:empty?0:minY,maxRadius,eatenRatio:eatenVolume/this.mesh.fullVolume,finite:this.position.every(Number.isFinite)};
  }
}
