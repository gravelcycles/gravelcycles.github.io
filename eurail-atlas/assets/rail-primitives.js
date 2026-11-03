// Display-only compaction for dense solid railway sections. Original geometry,
// analytical identities and picking remain untouched. A quarter CSS pixel grid
// displaces an endpoint by at most sqrt(2)/8 px at the bucket's largest scale.
export function quantizedRailPrimitives(coordinates,offsets,indices,zoom){
  if(!Number.isFinite(zoom))throw new Error('Invalid railway display zoom');
  const step=.25/2**Math.ceil(zoom),lines=[],points=[],segments=new Set(),dots=new Set(),endpoints=new Set();let inputSegments=0;
  const key=(x,y)=>x+','+y;
  for(const index of indices){
    const start=offsets[index],end=offsets[index+1];
    for(let point=start+2;point<end;point+=2){
      inputSegments++;
      let ax=Math.round(coordinates[point-2]/step),ay=Math.round(coordinates[point-1]/step),bx=Math.round(coordinates[point]/step),by=Math.round(coordinates[point+1]/step);
      if(ax===bx&&ay===by){dots.add(key(ax,ay));continue;}
      // Round joins/caps make the union of solid segments independent of their
      // direction. Each original segment is represented, including closed loops.
      if(ax>bx||ax===bx&&ay>by){[ax,bx]=[bx,ax];[ay,by]=[by,ay];}
      const a=key(ax,ay),b=key(bx,by),segment=a+':'+b;if(segments.has(segment))continue;
      segments.add(segment);endpoints.add(a);endpoints.add(b);lines.push(ax*step,ay*step,bx*step,by*step);
    }
  }
  // A line's round cap already covers the identical same-style point. Other
  // collapsed sections retain an explicit filled dot, including isolated lines.
  for(const point of dots)if(!endpoints.has(point)){const[x,y]=point.split(',').map(Number);points.push(x*step,y*step);}
  return{lines,points,step,inputSegments,primitiveCount:lines.length/4+points.length/2};
}
