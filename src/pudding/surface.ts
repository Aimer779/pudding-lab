import type { Quad, VolumeMesh } from '../physics/mesh.ts';
/** A sparse convex combination of physics nodes: parallel id/weight arrays. */
type Weight = { ids: number[]; ws: number[] };
/** Combines stencils through a dense scratch accumulator; far cheaper than Map merges when rebuilding after a bite. */
class Combiner {
  private readonly acc: Float64Array;
  private readonly touched: number[]=[];
  private readonly mark: Uint8Array;
  constructor(nodeCount:number){this.acc=new Float64Array(nodeCount);this.mark=new Uint8Array(nodeCount);}
  combine(items: [Weight,number][]): Weight {
    const {acc,mark,touched}=this;
    for(const [weights,factor] of items) {
      const {ids,ws}=weights;
      for(let i=0;i<ids.length;i++){const id=ids[i];if(!mark[id]){mark[id]=1;touched.push(id);}acc[id]+=ws[i]*factor;}
    }
    const out:Weight={ids:touched.slice(),ws:[]};
    for(const id of out.ids){out.ws.push(acc[id]);acc[id]=0;mark[id]=0;}
    touched.length=0;return out;
  }
}

/** Catmull–Clark stencils are precomputed once. All weights are convex: no outside-tet extrapolation. */
export class PuddingSurface {
  readonly indices: Uint32Array;
  readonly offsets: Uint32Array;
  readonly nodes: Uint32Array;
  readonly weights: Float64Array;
  readonly rest: Float32Array;
  readonly positions: Float32Array;
  /** Area-weighted vertex normals and a conservative bounding sphere, refreshed by `update` in one pass. */
  readonly normals: Float32Array;
  readonly bounds={center:[0,0,0] as [number,number,number],radius:0};
  readonly count: number;
  constructor(mesh: VolumeMesh, levels=2) {
    const used=[...new Set(mesh.quads.flat())];
    const remap=new Map(used.map((v,i)=>[v,i])),combiner=new Combiner(mesh.mass.length);
    const combine=(items:[Weight,number][])=>combiner.combine(items);
    let stencil: Weight[]=used.map(id=>({ids:[id],ws:[1]}));
    let faces: Quad[]=mesh.quads.map(q=>q.map(v=>remap.get(v)!) as Quad);
    for(let level=0;level<levels;level++) {
      const fpoints=faces.map(q=>combine(q.map(id=>[stencil[id],.25] as [Weight,number])));
      const edgeMap=new Map<number,{a:number;b:number;faces:number[];id:number}>();
      const vertexFaces=stencil.map(()=>[] as number[]), vertexEdges=stencil.map(()=>[] as number[]);
      const count=stencil.length, key=(a:number,b:number)=>a<b?a*count+b:b*count+a;
      faces.forEach((q,fi)=>q.forEach((a,j)=>{
        vertexFaces[a].push(fi);
        const b=q[(j+1)%4],k=key(a,b);
        if(!edgeMap.has(k)) { edgeMap.set(k,{a,b,faces:[],id:0}); vertexEdges[a].push(k);vertexEdges[b].push(k); }
        edgeMap.get(k)!.faces.push(fi);
      }));
      const next:Weight[]=stencil.map((w,i)=>{
        const n=vertexFaces[i].length;
        const terms:[Weight,number][]=[[w,(n-3)/n]];
        for(const fi of vertexFaces[i]) terms.push([fpoints[fi],1/(n*n)]);
        for(const k of vertexEdges[i]) { const e=edgeMap.get(k)!;terms.push([stencil[e.a],1/(n*n)],[stencil[e.b],1/(n*n)]); }
        return combine(terms);
      });
      for(const e of edgeMap.values()) {
        if(e.faces.length!==2) throw new Error('Surface must be closed and manifold');
        e.id=next.length;
        next.push(combine([[stencil[e.a],.25],[stencil[e.b],.25],[fpoints[e.faces[0]],.25],[fpoints[e.faces[1]],.25]]));
      }
      const foffset=next.length; next.push(...fpoints);
      const nextFaces:Quad[]=[];
      faces.forEach((q,fi)=>q.forEach((a,j)=>nextFaces.push([a,edgeMap.get(key(a,q[(j+1)%4]))!.id,foffset+fi,edgeMap.get(key(q[(j+3)%4],a))!.id])));
      stencil=next;faces=nextFaces;
    }
    this.count=stencil.length;
    const offsets=[0],nodes:number[]=[],weights:number[]=[];
    for(const s of stencil) {
      let sum=0;
      for(let i=0;i<s.ids.length;i++) {const w=s.ws[i];if(w<-1e-10) throw new Error('Negative skin weight'); nodes.push(s.ids[i]);weights.push(w);sum+=w;}
      if(Math.abs(sum-1)>1e-8) throw new Error('Unnormalized skin');
      offsets.push(nodes.length);
    }
    this.indices=new Uint32Array(faces.flatMap(([a,b,c,d])=>[a,b,c,a,c,d]));
    this.offsets=new Uint32Array(offsets);this.nodes=new Uint32Array(nodes);this.weights=new Float64Array(weights);
    this.positions=new Float32Array(this.count*3);this.normals=new Float32Array(this.count*3);
    this.update(mesh.rest,mesh.rest,1);
    this.rest=this.positions.slice();
  }
  update(previous:Float64Array,current:Float64Array,alpha:number) {
    const p=this.positions,n=this.normals,idx=this.indices;
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=0;i<this.count;i++) {
      let x=0,y=0,z=0;
      for(let k=this.offsets[i];k<this.offsets[i+1];k++) {
        const j=this.nodes[k]*3,w=this.weights[k];
        x+=(previous[j]+(current[j]-previous[j])*alpha)*w;
        y+=(previous[j+1]+(current[j+1]-previous[j+1])*alpha)*w;
        z+=(previous[j+2]+(current[j+2]-previous[j+2])*alpha)*w;
      }
      p[i*3]=x;p[i*3+1]=y;p[i*3+2]=z;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
    }
    n.fill(0);
    for(let t=0;t<idx.length;t+=3) {
      const a=idx[t]*3,b=idx[t+1]*3,c=idx[t+2]*3;
      const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      n[a]+=nx;n[a+1]+=ny;n[a+2]+=nz;n[b]+=nx;n[b+1]+=ny;n[b+2]+=nz;n[c]+=nx;n[c+1]+=ny;n[c+2]+=nz;
    }
    for(let i=0;i<n.length;i+=3) {
      const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;
    }
    if(this.count===0){this.bounds.center=[0,0,0];this.bounds.radius=0;return;}
    this.bounds.center=[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2];
    this.bounds.radius=Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)/2;
  }
  /** Barycentric hit on the visible surface mapped back to the physical degrees of freedom. */
  hitWeights(ids:number[],bary:number[]):[number,number][] {
    const weights=new Map<number,number>();
    ids.forEach((id,i)=>{
      for(let k=this.offsets[id];k<this.offsets[id+1];k++) {
        const node=this.nodes[k];weights.set(node,(weights.get(node)??0)+this.weights[k]*bary[i]);
      }
    });
    return [...weights];
  }
}
