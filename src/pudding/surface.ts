import type { Quad, VolumeMesh } from '../physics/mesh.ts';
type Weight = Map<number,number>;
const combine = (items: [Weight,number][]): Weight => {
  const out: Weight=new Map();
  for(const [weights,factor] of items) for(const [id,w] of weights) out.set(id,(out.get(id)??0)+w*factor);
  return out;
};

/** Catmull–Clark stencils are precomputed once. All weights are convex: no outside-tet extrapolation. */
export class PuddingSurface {
  readonly indices: Uint32Array;
  readonly offsets: Uint32Array;
  readonly nodes: Uint32Array;
  readonly weights: Float64Array;
  readonly rest: Float32Array;
  readonly positions: Float32Array;
  readonly count: number;
  constructor(mesh: VolumeMesh, levels=2) {
    const used=[...new Set(mesh.quads.flat())];
    const remap=new Map(used.map((v,i)=>[v,i]));
    let stencil: Weight[]=used.map(id=>new Map([[id,1]]));
    let faces: Quad[]=mesh.quads.map(q=>q.map(v=>remap.get(v)!) as Quad);
    for(let level=0;level<levels;level++) {
      const fpoints=faces.map(q=>combine(q.map(id=>[stencil[id],.25])));
      const edgeMap=new Map<string,{a:number;b:number;faces:number[];id:number}>();
      const vertexFaces=stencil.map(()=>[] as number[]), vertexEdges=stencil.map(()=>[] as string[]);
      const key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
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
      for(const [id,w] of s) {if(w<-1e-10) throw new Error('Negative skin weight'); nodes.push(id);weights.push(w);sum+=w;}
      if(Math.abs(sum-1)>1e-8) throw new Error('Unnormalized skin');
      offsets.push(nodes.length);
    }
    this.indices=new Uint32Array(faces.flatMap(([a,b,c,d])=>[a,b,c,a,c,d]));
    this.offsets=new Uint32Array(offsets);this.nodes=new Uint32Array(nodes);this.weights=new Float64Array(weights);
    this.positions=new Float32Array(this.count*3);
    this.update(mesh.rest,mesh.rest,1);
    this.rest=this.positions.slice();
  }
  update(previous:Float64Array,current:Float64Array,alpha:number) {
    for(let i=0;i<this.count;i++) {
      let x=0,y=0,z=0;
      for(let k=this.offsets[i];k<this.offsets[i+1];k++) {
        const j=this.nodes[k]*3,w=this.weights[k];
        x+=(previous[j]+(current[j]-previous[j])*alpha)*w;
        y+=(previous[j+1]+(current[j+1]-previous[j+1])*alpha)*w;
        z+=(previous[j+2]+(current[j+2]-previous[j+2])*alpha)*w;
      }
      this.positions[i*3]=x;this.positions[i*3+1]=y;this.positions[i*3+2]=z;
    }
  }
  /** Barycentric hit on the visible surface mapped back to the physical degrees of freedom. */
  hitWeights(ids:number[],bary:number[]):[number,number][] {
    const weights:Weight=new Map();
    ids.forEach((id,i)=>{
      for(let k=this.offsets[id];k<this.offsets[id+1];k++) {
        const node=this.nodes[k];weights.set(node,(weights.get(node)??0)+this.weights[k]*bary[i]);
      }
    });
    return [...weights];
  }
}
