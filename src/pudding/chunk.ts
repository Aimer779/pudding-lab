import { makeVolumeMesh } from '../physics/mesh.ts';
import type { VolumeMesh } from '../physics/mesh.ts';
import type { Bite } from '../physics/soft-body.ts';
import { PuddingSurface } from './surface.ts';

export interface Chunk { mesh:VolumeMesh; skin:PuddingSurface; positions:Float32Array }

/**
 * Builds the visible surface of a bite, frozen at the deformed positions it had when it was cut.
 * Returns null when the bite itself is not a closed manifold piece; the pudding is still eaten in that case.
 */
export function buildChunk(bite:Bite):Chunk|null {
  const {mesh,position}=bite.source,keep=new Set(bite.cells),removed:number[]=[];
  for(let c=0;c<mesh.n*mesh.n*mesh.layers;c++)if(!keep.has(c))removed.push(c);
  try {
    const chunk=makeVolumeMesh(mesh.n,mesh.layers,removed),skin=new PuddingSurface(chunk);
    const p=new Float64Array(chunk.rest.length);
    for(let i=0;i<chunk.nodeIds.length;i++) {
      const j=mesh.lookup[chunk.nodeIds[i]];
      for(let k=0;k<3;k++)p[i*3+k]=j>=0?position[j*3+k]:chunk.rest[i*3+k];
    }
    skin.update(p,p,1);
    return {mesh:chunk,skin,positions:skin.positions.slice()};
  } catch {
    return null;
  }
}
