import type { Platform } from "./legacy";
/** Shared exact footprint predicate; presentation meshes never define walkability. */
export function surfaceContains(p:Platform,x:number,z:number):boolean{
 if(p.radius!==undefined)return Math.hypot(x-p.x,z-p.z)<=p.radius;
 if(p.yaw){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw),s=Math.sin(p.yaw);return Math.abs(dx*c-dz*s)<=p.width/2&&Math.abs(dx*s+dz*c)<=p.depth/2;}
 return Math.abs(x-p.x)<=p.width/2&&Math.abs(z-p.z)<=p.depth/2;
}
