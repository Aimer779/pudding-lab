import { makeVolumeMesh, tetVolume } from './mesh.ts';
import type { Vec3, VolumeMesh } from './mesh.ts';

export class SoftBody {
  readonly mesh:VolumeMesh;
  readonly position:Float64Array;
  readonly previous:Float64Array;
  readonly velocity:Float64Array;
  readonly inverseMass:Float64Array;
  private readonly old:Float64Array;
  private readonly gradients=new Float64Array(12);
  firmness=.45;
  damping=3.04;
  grab: {weights:[number,number][];target:Vec3;cursor:Vec3;anchor:Vec3} | null=null;
  constructor(mesh=makeVolumeMesh()) {
    this.mesh=mesh;this.position=mesh.rest.slice();this.previous=mesh.rest.slice();
    this.old=mesh.rest.slice();this.velocity=new Float64Array(mesh.rest.length);
    this.inverseMass=Float64Array.from(mesh.mass,m=>1/m);
  }
  reset(drop=0) {
    this.position.set(this.mesh.rest);this.velocity.fill(0);this.grab=null;
    for(let i=1;i<this.position.length;i+=3) this.position[i]+=drop;
    this.previous.set(this.position);this.old.set(this.position);
  }
  point(weights:[number,number][]):Vec3 {
    const p:Vec3=[0,0,0];
    for(const [id,w] of weights) for(let k=0;k<3;k++) p[k]+=this.position[id*3+k]*w;
    return p;
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
    for(let i=0;i<this.position.length;i+=3) {
      this.position[i+1]=Math.max(0,this.position[i+1]);
    }
    // A collective stage constraint preserves shape at the interaction boundary.
    // Clipping each particle against an invisible wall collapses whole tetrahedra.
    let x=0,z=0,mass=0;
    for(let i=0;i<this.mesh.mass.length;i++){const m=this.mesh.mass[i];mass+=m;x+=this.position[i*3]*m;z+=this.position[i*3+2]*m;}
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
    let volume=0,minRatio=Infinity,energy=0,minY=Infinity,maxRadius=0;
    for(let t=0;t<this.mesh.volumes.length;t++) {
      const ids=this.mesh.tets.subarray(t*4,t*4+4);
      const v=tetVolume(this.position,ids[0],ids[1],ids[2],ids[3]);
      volume+=v;minRatio=Math.min(minRatio,v/this.mesh.volumes[t]);
    }
    for(let i=0;i<this.mesh.mass.length;i++) {
      const j=i*3;
      energy+=.5*this.mesh.mass[i]*(this.velocity[j]**2+this.velocity[j+1]**2+this.velocity[j+2]**2);
      minY=Math.min(minY,this.position[j+1]);maxRadius=Math.max(maxRadius,Math.hypot(this.position[j],this.position[j+2]));
    }
    return {volumeRatio:volume/this.mesh.volumes.reduce((a,b)=>a+b,0),minTetRatio:minRatio,energy,minY,maxRadius,finite:this.position.every(Number.isFinite)};
  }
}
