import * as THREE from 'three/webgpu';
import { SPOON_RADII, SPOON_RIM } from '../physics/soft-body.ts';

/**
 * Sweeps an elliptical cross-section along a curve. The section stays flat relative to world up, so the
 * handle reads as a pressed sheet of metal rather than a tube; `width`/`thickness` are functions of 0..1.
 */
function sweep(curve:THREE.Curve<THREE.Vector3>,segments:number,sides:number,width:(t:number)=>number,thickness:(t:number)=>number) {
  const positions:number[]=[],indices:number[]=[];
  const up=new THREE.Vector3(0,1,0),across=new THREE.Vector3(),flat=new THREE.Vector3(),point=new THREE.Vector3();
  for(let i=0;i<=segments;i++) {
    const t=i/segments,p=curve.getPointAt(t),tangent=curve.getTangentAt(t);
    across.crossVectors(tangent,up).normalize();flat.crossVectors(across,tangent).normalize();
    for(let j=0;j<sides;j++) {
      const a=j/sides*Math.PI*2;
      point.copy(p).addScaledVector(across,Math.cos(a)*width(t)/2).addScaledVector(flat,Math.sin(a)*thickness(t)/2);
      positions.push(point.x,point.y,point.z);
    }
  }
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++) {
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+j,d=(i+1)*sides+(j+1)%sides;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();return geometry;
}
const smooth=(t:number)=>{const s=Math.min(1,Math.max(0,t));return s*s*(3-2*s);};

/** A dessert spoon in bowl-local space: dish centred at the origin, long axis and handle along +x. */
export function buildSpoon(material:THREE.Material) {
  const [rx,ry,rz]=SPOON_RADII,group=new THREE.Group(),geometries:THREE.BufferGeometry[]=[];
  // Dish: the part of the bowl ellipsoid below the rim plane, matching the physics pusher exactly.
  const theta=Math.acos(SPOON_RIM);
  const dish=new THREE.Mesh(new THREE.SphereGeometry(1,56,24,0,Math.PI*2,theta,Math.PI-theta),material);
  dish.scale.set(rx,ry,rz);dish.castShadow=true;group.add(dish);geometries.push(dish.geometry);
  // Lip: a thin rolled edge on the rim ellipse.
  const rim=Math.sqrt(1-SPOON_RIM*SPOON_RIM);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(1,.011,8,72),material);
  lip.rotation.x=Math.PI/2;lip.scale.set(rx*rim,rz*rim,1);lip.position.y=SPOON_RIM*ry;lip.castShadow=true;group.add(lip);geometries.push(lip.geometry);
  // Handle: rises from the far end of the rim through a round neck into a flat blade that widens and lifts.
  const y0=SPOON_RIM*ry;
  const path=new THREE.CatmullRomCurve3([
    new THREE.Vector3(rx*rim-.08,y0-.02,0),new THREE.Vector3(rx*rim+.06,y0+.01,0),new THREE.Vector3(rx*rim+.24,y0+.11,0),
    new THREE.Vector3(rx*rim+.55,y0+.27,0),new THREE.Vector3(rx*rim+.95,y0+.40,0),new THREE.Vector3(rx*rim+1.18,y0+.43,0),
  ]);
  const tip=(t:number)=>t<.9?1:Math.max(.02,Math.sqrt(Math.max(0,1-((t-.9)/.1)**2)));
  const width=(t:number)=>(t<.2?.07-.02*t/.2:.05+.095*smooth((t-.2)/.62))*tip(t);
  const thickness=(t:number)=>(t<.2?.05-.01*t/.2:.04-.018*smooth((t-.2)/.5))*tip(t);
  const handle=new THREE.Mesh(sweep(path,72,14,width,thickness),material);handle.castShadow=true;group.add(handle);geometries.push(handle.geometry);
  return {group,dispose(){for(const g of geometries)g.dispose();}};
}
