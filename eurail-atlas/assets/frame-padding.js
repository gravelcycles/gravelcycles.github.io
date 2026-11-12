// Leaflet's fitBounds returns the maximum zoom when the padding on an axis is at
// least the map's size on that axis. A phone in landscape has a map only about
// 250 px tall, less than the chrome-avoiding padding asked for in portrait, and
// opened at zoom 19. Scale each axis' padding down so together it never takes
// more than `share` of the map's width or height; padding that already fits is
// kept. A missing size leaves the padding as it is. The default 60% leaves the
// portrait phone frame (353 of 664 px, 53%) and desktop frames as they were
// while always keeping at least 40% of the map for the bounds.
//
// The padding may be given the way Leaflet accepts it: paddingTopLeft and
// paddingBottomRight, or a single `padding` used for both corners, each as an
// [x, y] array or an L.Point-like {x, y}. Leaflet reads
// `paddingTopLeft || padding`, so the result always carries the two explicit
// corners and no `padding` key. Other options (maxZoom, animate, …) survive.
export const MAX_FRAME_PADDING_SHARE=.6;

function pair(value){
  if(value==null)return null;
  if(typeof value==='number')return[Number(value)||0,Number(value)||0];
  if(Array.isArray(value))return[Number(value[0])||0,Number(value[1])||0];
  if(typeof value==='object'&&('x'in value||'y'in value))return[Number(value.x)||0,Number(value.y)||0];
  return null;
}

export function capFramePadding(padding,size,share=MAX_FRAME_PADDING_SHARE){
  const options=padding||{},shared=pair(options.padding),
    topLeft=pair(options.paddingTopLeft)||(shared?[...shared]:[0,0]),
    bottomRight=pair(options.paddingBottomRight)||(shared?[...shared]:[0,0]);
  for(const axis of[0,1]){
    const extent=Number(axis?size?.y:size?.x);
    if(!(extent>0))continue;
    const total=topLeft[axis]+bottomRight[axis],limit=extent*share;
    if(total<=limit||!(total>0))continue;
    const scale=limit/total;
    topLeft[axis]=Math.floor(topLeft[axis]*scale);bottomRight[axis]=Math.floor(bottomRight[axis]*scale);
  }
  const{padding:_unused,...rest}=options;
  return{...rest,paddingTopLeft:topLeft,paddingBottomRight:bottomRight};
}
