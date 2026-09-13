import type { VolumeMesh } from '../physics/mesh.ts';
import type { PuddingSurface } from './surface.ts';

/**
 * Per-vertex material masks for a bound surface. `glaze` marks the caramel top from the rest height;
 * `cut` is the convex share of interior nodes, so freshly exposed custard reads as cut, not as skin.
 */
export function surfaceAttributes(skin:PuddingSurface,mesh:VolumeMesh):{glaze:Float32Array;cut:Float32Array} {
  const glaze=new Float32Array(skin.count),cut=new Float32Array(skin.count);
  for(let i=0;i<skin.count;i++) {
    const x=skin.rest[i*3],y=skin.rest[i*3+1],z=skin.rest[i*3+2];
    const angle=Math.atan2(z,x),edge=1.235+.014*Math.sin(3*angle)+.012*Math.sin(7*angle);
    const t=Math.min(1,Math.max(0,(y-edge)/.045));
    let interior=0;
    for(let k=skin.offsets[i];k<skin.offsets[i+1];k++)if(!mesh.outer[skin.nodes[k]])interior+=skin.weights[k];
    cut[i]=Math.min(1,Math.max(0,interior));
    glaze[i]=t*t*(3-2*t)*(1-cut[i]);
  }
  return {glaze,cut};
}
