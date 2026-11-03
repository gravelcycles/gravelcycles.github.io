const sameMembers=(a,b)=>a===b||a.length===b.length&&a.every((id,index)=>id===b[index]);

export function thresholdRasterPixels(base,frequencies,minimum){
  const pixels=base.slice();
  if(minimum>0)for(let i=0;i<frequencies.length;i++)if(frequencies[i]<minimum)pixels.fill(0,i*8,i*8+8);
  return pixels;
}

// A camera/filter-local cache. Baseline groups survive threshold sweeps; each
// visual style retains at most one additional exact-membership boundary image.
export class RasterBitmapCache{
  constructor(maxBytes=128*1024*1024){this.maxBytes=maxBytes;this.bytes=0;this.entries=new Map();this.key=null;}
  reset(key){if(this.key===key)return;this.clear();this.key=key;}
  clear(){for(const entry of this.entries.values())entry.image.bitmap.close?.();this.entries.clear();this.bytes=0;this.key=null;}
  get(style,indices){for(const baseline of[true,false]){const key=style+'|'+baseline,entry=this.entries.get(key);if(entry&&sameMembers(entry.indices,indices)){this.entries.delete(key);this.entries.set(key,entry);return entry.image;}}return null;}
  put(style,indices,image,bytes,{baseline=false}={}){
    if(!Number.isSafeInteger(bytes)||bytes<0||bytes>this.maxBytes)return false;
    const key=style+'|'+baseline;this.remove(key);
    while(this.bytes+bytes>this.maxBytes&&this.entries.size){const victim=[...this.entries].find(([,entry])=>!entry.baseline)?.[0]??this.entries.keys().next().value;this.remove(victim);}
    this.entries.set(key,{indices,image,bytes,baseline});this.bytes+=bytes;return true;
  }
  remove(key){const entry=this.entries.get(key);if(!entry)return;entry.image.bitmap.close?.();this.bytes-=entry.bytes;this.entries.delete(key);}
}
