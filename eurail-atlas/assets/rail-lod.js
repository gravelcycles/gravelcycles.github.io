import{segmentDistanceSquared}from'./atlas-core.js?v=83cd3d7da92ba977';

const worlds=new WeakMap();

// Display-only Douglas–Peucker in projected world coordinates. At every zoom
// the retained line stays within half a CSS pixel of the original vertices.
// The original transferred Float64Array remains untouched for exact picking.
export function renderWorld(world,zoom){
  if(world.length<=4)return world;
  const bucket=Math.ceil(zoom),tolerance=.5/2**bucket;let cached=worlds.get(world);
  if(!cached){cached=new Map();worlds.set(world,cached);}if(cached.has(bucket))return cached.get(bucket);
  const last=world.length-2,keep=new Uint8Array(world.length/2),stack=[];keep[0]=keep[last/2]=1;
  if(world[0]===world[last]&&world[1]===world[last+1]){
    let far=-1,distance=0;
    for(let i=2;i<last;i+=2){const d=(world[i]-world[0])**2+(world[i+1]-world[1])**2;if(d>distance){distance=d;far=i;}}
    if(far>0){keep[far/2]=1;stack.push(0,far,far,last);}
  }else stack.push(0,last);
  while(stack.length){
    const end=stack.pop(),start=stack.pop();let far=-1,best=tolerance*tolerance;
    for(let i=start+2;i<end;i+=2){const d=segmentDistanceSquared(world[i],world[i+1],world[start],world[start+1],world[end],world[end+1]);if(d>best){best=d;far=i;}}
    if(far>=0){keep[far/2]=1;stack.push(start,far,far,end);}
  }
  let count=0;for(const selected of keep)count+=selected;
  let result=world;
  if(count*2<world.length){result=new Float64Array(count*2);let offset=0;for(let i=0;i<world.length;i+=2)if(keep[i/2]){result[offset++]=world[i];result[offset++]=world[i+1];}}
  cached.set(bucket,result);if(cached.size>3)cached.delete(cached.keys().next().value);return result;
}
