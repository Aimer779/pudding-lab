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
  n: number;
  layers: number;
  /** Grid cell id of every active hexahedron; tetrahedra are stored six per cell in this order. */
  cells: Uint32Array;
  /** Grid node id of every mesh node, and the inverse lookup (-1 when a grid node is unused). */
  nodeIds: Uint32Array;
  lookup: Int32Array;
  /** 1 when the node lies on the outer surface of the complete pudding, 0 for exposed interior. */
  outer: Uint8Array;
  removed: Set<number>;
  /** Rest volume of every grid cell, eaten or not, and the complete pudding total. */
  cellVolumes: Float64Array;
  fullVolume: number;
}

export const cellIndex = (x: number, y: number, z: number, n: number) => (y*n+z)*n+x;
export const cellCoords = (id: number, n: number): Vec3 => [id%n, Math.floor(id/(n*n)), Math.floor(id/n)%n];
export const nodeIndex = (x: number, y: number, z: number, n: number) => (y*(n+1)+z)*(n+1)+x;
const PUDDING_HEIGHT = 1.35;

export function tetVolume(p: ArrayLike<number>, a: number, b: number, c: number, d: number): number {
  const x = p[b*3]-p[a*3], y = p[b*3+1]-p[a*3+1], z = p[b*3+2]-p[a*3+2];
  const u = p[c*3]-p[a*3], v = p[c*3+1]-p[a*3+1], w = p[c*3+2]-p[a*3+2];
  const r = p[d*3]-p[a*3], s = p[d*3+1]-p[a*3+1], t = p[d*3+2]-p[a*3+2];
  return (x*(v*t-w*s) + y*(w*r-u*t) + z*(u*s-v*r))/6;
}

/** Rest positions of the complete structured grid; the square-to-disc map has no collapsed polar axis. */
function gridRest(n: number, layers: number): Float64Array {
  const points: number[] = [];
  for (let y = 0; y <= layers; y++) for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
    const u = 2*x/n-1, v = 2*z/n-1, h = y/layers;
    // Keep a nonzero corner Jacobian; subdivision rounds the remaining shallow corners.
    const dx = u*Math.sqrt(1-.8*v*v/2), dz = v*Math.sqrt(1-.8*u*u/2);
    const r = Math.hypot(dx,dz), theta = Math.atan2(dz,dx);
    const radius = (1.03-.21*h)*(1+.075*Math.cos(8*theta)*r*r);
    points.push(dx*radius, h*PUDDING_HEIGHT, dz*radius);
  }
  return new Float64Array(points);
}

const PERMUTATIONS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
/** Corner offsets of the six cell faces, listed per axis and side; winding is fixed against the cell centre. */
const FACES: [number, number, Vec3[]][] = [];
for (const axis of [0,1,2]) for (const side of [0,1]) {
  const corners: Vec3[] = [];
  for (const [s,t] of [[0,0],[1,0],[1,1],[0,1]]) { const c: Vec3=[0,0,0]; c[axis]=side; c[(axis+1)%3]=s; c[(axis+2)%3]=t; corners.push(c); }
  FACES.push([axis, side, corners]);
}

/** Conforming Freudenthal tetrahedra over the active cells of an n×layers×n grid. */
export function makeVolumeMesh(n = 8, layers = 5, removed: Iterable<number> = []): VolumeMesh {
  const removedSet = new Set(removed), grid = gridRest(n, layers), height = PUDDING_HEIGHT;
  const gridNodes = (n+1)*(n+1)*(layers+1), lookup = new Int32Array(gridNodes).fill(-1);
  const isActive = (x: number, y: number, z: number) => x>=0&&x<n&&y>=0&&y<layers&&z>=0&&z<n&&!removedSet.has(cellIndex(x,y,z,n));
  const gridTets: number[] = [], gridQuads: Quad[] = [], cells: number[] = [];
  const cellVolumes = new Float64Array(n*n*layers); let fullVolume = 0;
  for (let y=0;y<layers;y++) for (let z=0;z<n;z++) for (let x=0;x<n;x++) {
    const active = isActive(x,y,z), cell = cellIndex(x,y,z,n);
    for (const order of PERMUTATIONS) {
      const xyz=[x,y,z], ids=[nodeIndex(x,y,z,n)];
      for (const axis of order) { xyz[axis]++; ids.push(nodeIndex(xyz[0],xyz[1],xyz[2],n)); }
      let vol = tetVolume(grid,ids[0],ids[1],ids[2],ids[3]);
      if (vol<0) { [ids[1],ids[2]]=[ids[2],ids[1]]; vol=-vol; }
      cellVolumes[cell]+=vol;
      if (active) gridTets.push(...ids);
    }
    fullVolume+=cellVolumes[cell];
    if (!active) continue;
    cells.push(cell);
    const centre = [0,0,0];
    for (const dx of [0,1]) for (const dy of [0,1]) for (const dz of [0,1]) { const i=nodeIndex(x+dx,y+dy,z+dz,n)*3; for (let k=0;k<3;k++) centre[k]+=grid[i+k]/8; }
    for (const [axis, side, corners] of FACES) {
      const neighbour=[x,y,z]; neighbour[axis]+=side?1:-1;
      if (isActive(neighbour[0],neighbour[1],neighbour[2])) continue;
      const q = corners.map(c=>nodeIndex(x+c[0],y+c[1],z+c[2],n)) as Quad;
      const [a,b,c] = q.map(i=>[grid[i*3],grid[i*3+1],grid[i*3+2]]);
      const u=b.map((v,i)=>v-a[i]), v=c.map((v,i)=>v-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const outward=a.map((v,i)=>v-centre[i]);
      gridQuads.push(normal.reduce((s,v,i)=>s+v*outward[i],0)>0 ? q : [q[3],q[2],q[1],q[0]]);
    }
  }
  const used = [...new Set(gridTets)].sort((a,b)=>a-b);
  used.forEach((id,i)=>{lookup[id]=i;});
  const rest = new Float64Array(used.length*3), nodeIds = new Uint32Array(used), outer = new Uint8Array(used.length);
  used.forEach((id,i)=>{
    for (let k=0;k<3;k++) rest[i*3+k]=grid[id*3+k];
    const x=id%(n+1), y=Math.floor(id/((n+1)*(n+1))), z=Math.floor(id/(n+1))%(n+1);
    outer[i]=(x===0||x===n||z===0||z===n||y===0||y===layers)?1:0;
  });
  const tets=Uint32Array.from(gridTets,id=>lookup[id]), quads=gridQuads.map(q=>q.map(id=>lookup[id]) as Quad);
  const volumes=new Float64Array(tets.length/4), mass=new Float64Array(used.length);
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
  return {rest,tets,volumes,edges,lengths,mass,quads,height,quality:{minVolume,maxEdgeRatio,minQuality},n,layers,cells:new Uint32Array(cells),nodeIds,lookup,outer,removed:removedSet,cellVolumes,fullVolume};
}

/**
 * Grows a removal set until the remaining cells form one face-connected body whose boundary is a closed
 * edge-manifold surface: no two cells may touch only along an edge or only at a vertex. Crumbs that lose
 * face contact with the largest piece are eaten as well. `score` picks which offending cell goes first.
 */
export function repairRemoval(n: number, layers: number, removed: Set<number>, score: (cell: number) => number): void {
  const dims=[n,layers,n];
  const inside=(c:number[])=>c.every((v,i)=>v>=0&&v<dims[i]);
  const id=(c:number[])=>cellIndex(c[0],c[1],c[2],n);
  const active=(c:number[])=>inside(c)&&!removed.has(id(c));
  const drop=(cells:number[])=>{let best=cells[0];for(const c of cells)if(score(c)<score(best))best=c;removed.add(best);};
  const adjacent=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)===1;
  const components=(cells:number[][])=>{
    const seen=new Set<number>(),groups:number[][][]=[];
    for(const start of cells) {
      if(seen.has(id(start)))continue;
      const group=[start],queue=[start];seen.add(id(start));
      while(queue.length){const c=queue.pop()!;for(const o of cells)if(!seen.has(id(o))&&adjacent(c,o)){seen.add(id(o));group.push(o);queue.push(o);}}
      groups.push(group);
    }
    return groups;
  };
  for(let guard=0;guard<10000;guard++) {
    let changed=false;
    for(let axis=0;axis<3;axis++) {
      const p=(axis+1)%3,q=(axis+2)%3;
      for(let i=0;i<dims[axis];i++)for(let j=1;j<dims[p];j++)for(let k=1;k<dims[q];k++) {
        const at=(dj:number,dk:number)=>{const c=[0,0,0];c[axis]=i;c[p]=j-dj;c[q]=k-dk;return c;};
        const block=[at(1,1),at(0,1),at(1,0),at(0,0)],flags=block.map(active);
        if(flags.filter(Boolean).length!==2)continue;
        if((flags[0]&&flags[3])||(flags[1]&&flags[2])){drop(block.filter((_,f)=>flags[f]).map(id));changed=true;}
      }
    }
    for(let x=1;x<n;x++)for(let y=1;y<layers;y++)for(let z=1;z<n;z++) {
      const block:number[][]=[];
      for(const dx of [0,1])for(const dy of [0,1])for(const dz of [0,1]){const c=[x-dx,y-dy,z-dz];if(active(c))block.push(c);}
      if(block.length>=2&&components(block).length>1){drop(block.map(id));changed=true;}
    }
    if(changed)continue;
    const all:number[][]=[];
    for(let y=0;y<layers;y++)for(let z=0;z<n;z++)for(let x=0;x<n;x++)if(active([x,y,z]))all.push([x,y,z]);
    const groups=components(all).sort((a,b)=>b.length-a.length);
    for(const group of groups.slice(1))for(const c of group)removed.add(id(c));
    if(groups.length<=1)return;
  }
  throw new Error('Removal repair did not converge');
}
