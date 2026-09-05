export type Vec3 = [number, number, number];
export type Quad = [number, number, number, number];
export interface VolumeMesh {
  rest: Float64Array;
  tets: Uint32Array;
  volumes: Float64Array;
  edges: Uint32Array;
  lengths: Float64Array;
  mass: Float64Array;
  quads: Quad[];
  height: number;
  quality: { minVolume: number; maxEdgeRatio: number; minQuality: number };
}

export function tetVolume(p: ArrayLike<number>, a: number, b: number, c: number, d: number): number {
  const x = p[b*3]-p[a*3], y = p[b*3+1]-p[a*3+1], z = p[b*3+2]-p[a*3+2];
  const u = p[c*3]-p[a*3], v = p[c*3+1]-p[a*3+1], w = p[c*3+2]-p[a*3+2];
  const r = p[d*3]-p[a*3], s = p[d*3+1]-p[a*3+1], t = p[d*3+2]-p[a*3+2];
  return (x*(v*t-w*s) + y*(w*r-u*t) + z*(u*s-v*r))/6;
}

/** Conforming Freudenthal tetrahedra; the square-to-disc map has no collapsed polar axis. */
export function makeVolumeMesh(n = 8, layers = 5): VolumeMesh {
  const height = 1.35;
  const points: number[] = [], cells: number[] = [], quads: Quad[] = [];
  const id = (x: number, y: number, z: number) => (y*(n+1)+z)*(n+1)+x;
  for (let y = 0; y <= layers; y++) for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const u = 2*x/n-1, v = 2*z/n-1, h = y/layers;
    // Keep a nonzero corner Jacobian; subdivision rounds the remaining shallow corners.
    const dx = u*Math.sqrt(1-.8*v*v/2), dz = v*Math.sqrt(1-.8*u*u/2);
    const r = Math.hypot(dx,dz), theta = Math.atan2(dz,dx);
    const radius = (1.03-.21*h)*(1+.075*Math.cos(8*theta)*r*r);
    points.push(dx*radius, h*height, dz*radius);
  }
  const rest = new Float64Array(points);
  const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (let y=0;y<layers;y++) for (let z=0;z<n;z++) for (let x=0;x<n;x++) {
    for (const order of permutations) {
      const xyz=[x,y,z], ids=[id(x,y,z)];
      for (const axis of order) { xyz[axis]++; ids.push(id(xyz[0],xyz[1],xyz[2])); }
      if (tetVolume(rest,ids[0],ids[1],ids[2],ids[3])<0) [ids[1],ids[2]]=[ids[2],ids[1]];
      cells.push(...ids);
    }
  }
  const face = (q: Quad) => {
    const [a,b,c] = q.map(i=>[rest[i*3],rest[i*3+1],rest[i*3+2]]);
    const u=b.map((v,i)=>v-a[i]), v=c.map((v,i)=>v-a[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const center=[a[0]+c[0],a[1]+c[1]-height,a[2]+c[2]];
    quads.push(normal.reduce((s,v,i)=>s+v*center[i],0)>0 ? q : [q[3],q[2],q[1],q[0]]);
  };
  for(let z=0;z<n;z++) for(let x=0;x<n;x++) for(const y of [0,layers])
    face([id(x,y,z),id(x+1,y,z),id(x+1,y,z+1),id(x,y,z+1)]);
  for(let y=0;y<layers;y++) for(let k=0;k<n;k++) {
    for(const x of [0,n]) face([id(x,y,k),id(x,y+1,k),id(x,y+1,k+1),id(x,y,k+1)]);
    for(const z of [0,n]) face([id(k,y,z),id(k+1,y,z),id(k+1,y+1,z),id(k,y+1,z)]);
  }
  const tets=new Uint32Array(cells), volumes=new Float64Array(cells.length/4), mass=new Float64Array(points.length/3);
  const edgeMap=new Map<string,[number,number]>();
  let minVolume=Infinity, maxEdgeRatio=0, minQuality=Infinity;
  for(let i=0;i<volumes.length;i++) {
    const ids=Array.from(tets.subarray(i*4,i*4+4));
    const vol=tetVolume(rest,ids[0],ids[1],ids[2],ids[3]);
    volumes[i]=vol; minVolume=Math.min(minVolume,vol);
    ids.forEach(id=>mass[id]+=vol/4);
    const lens=[];
    for(let a=0;a<4;a++) for(let b=a+1;b<4;b++) {
      const p=Math.min(ids[a],ids[b]),q=Math.max(ids[a],ids[b]);
      edgeMap.set(`${p},${q}`,[p,q]);
      lens.push(Math.hypot(rest[p*3]-rest[q*3],rest[p*3+1]-rest[q*3+1],rest[p*3+2]-rest[q*3+2]));
    }
    maxEdgeRatio=Math.max(maxEdgeRatio,Math.max(...lens)/Math.min(...lens));
    minQuality=Math.min(minQuality,12*Math.pow(3*vol,2/3)/lens.reduce((s,l)=>s+l*l,0));
  }
  if(minVolume<1e-7 || minQuality<.08) throw new Error(`Degenerate pudding cage: volume=${minVolume}, quality=${minQuality}, edgeRatio=${maxEdgeRatio}`);
  const edges=new Uint32Array([...edgeMap.values()].flat());
  const lengths=new Float64Array(edges.length/2);
  for(let e=0;e<lengths.length;e++) {
    const a=edges[e*2]*3,b=edges[e*2+1]*3;
    lengths[e]=Math.hypot(rest[a]-rest[b],rest[a+1]-rest[b+1],rest[a+2]-rest[b+2]);
  }
  return {rest,tets,volumes,edges,lengths,mass,quads,height,quality:{minVolume,maxEdgeRatio,minQuality}};
}
