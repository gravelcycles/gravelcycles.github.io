// Instanced screen-width line segments. Geographic coordinates remain in
// projected world space; moving the map changes only three small uniforms.
const VERTEX = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec4 a_segment;
in float a_start;
in float a_index;
uniform vec2 u_center;
uniform vec2 u_size;
uniform float u_scale;
uniform sampler2D u_styles;
uniform int u_textureWidth;
uniform int u_styleStride;
uniform int u_pass;
uniform int u_layer;
out vec2 v_local;
out float v_length;
out float v_radius;
out float v_start;
out float v_dash;
out vec4 v_color;
void main(){
  int index=int(a_index)*u_styleStride+u_pass*2;
  vec4 color=texelFetch(u_styles,ivec2(index%u_textureWidth,index/u_textureWidth),0);
  index+=1;
  vec4 flags=texelFetch(u_styles,ivec2(index%u_textureWidth,index/u_textureWidth),0);
  if(flags.r<0.5){gl_Position=vec4(2.0,2.0,0.0,1.0);v_color=vec4(0.0);v_dash=0.0;v_start=0.0;v_length=0.0;v_radius=0.0;v_local=vec2(0.0);return;}
  vec2 delta=(a_segment.zw-a_segment.xy)*u_scale;
  float len=length(delta);
  // A zero-length instance is a dot (the Traffic overview's static layer): a round cap all round.
  vec2 direction=len>0.00001?delta/len:vec2(1.0,0.0);
  float radius=color.a*8.0;
  float outer=radius+1.0;
  vec2 endpoint=mix(a_segment.xy,a_segment.zw,a_corner.x);
  vec2 offset=direction*((a_corner.x*2.0-1.0)*outer)
    +vec2(-direction.y,direction.x)*(a_corner.y*outer);
  vec2 pixel=(endpoint-u_center)*u_scale+offset;
  // Layer 3, the static overview layer, lies beneath every edge (main edges reach at most 0.9).
  float depth=u_layer==3?0.95:u_layer==0?0.9-flags.a*1.2:u_layer==1?-0.4-flags.a*0.1:-0.8;
  gl_Position=vec4(pixel/(u_size*0.5)*vec2(1.0,-1.0),depth,1.0);
  v_local=vec2(a_corner.x*len+(a_corner.x*2.0-1.0)*outer,a_corner.y*outer);
  v_length=len;v_radius=radius;v_start=a_start*u_scale;
  v_dash=flags.g;v_color=vec4(color.rgb,flags.b);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_length;
in float v_radius;
in float v_start;
in float v_dash;
in vec4 v_color;
out vec4 outColor;
void main(){
  float cap=max(max(-v_local.x,v_local.x-v_length),0.0);
  float distance=length(vec2(cap,v_local.y));
  float alpha=1.0-smoothstep(v_radius-0.65,v_radius+0.65,distance);
  // Short station-to-station links must not all start with a four-pixel solid
  // dash; round caps also filled the gaps on busy approximate corridors.
  if(v_dash>0.5&&(v_local.x<0.0||v_local.x>v_length||mod(v_start+v_local.x,6.0)>1.0))discard;
  if(alpha<=0.0)discard;
  outColor=vec4(v_color.rgb,v_color.a*alpha);
}`;

export function rgb(color){
  const value=Number.parseInt(color.replace('#',''),16);
  return[(value>>16&255)/255,(value>>8&255)/255,(value&255)/255,1];
}

// Busy station-call corridors exceed 1,000/day. Keep their draw order graded
// instead of assigning the same top priority to everything above 180/day.
export function frequencyPriority(value){return Math.round(Math.max(0,Math.min(1,Math.log1p(value)/Math.log(2049)))*255);}

// A segment is [x0,y0,x1,y1,cumulative_world_length,edge_style_index].
// Zero-length source vertices are deliberately omitted before shader normalize.
export function lineInstances(edges,origin=[0,0]){
  let count=0;
  for(const edge of edges){const p=edge._world;for(let i=2;i<p.length;i+=2)if(p[i]!==p[i-2]||p[i+1]!==p[i-1])count++;}
  const data=new Float32Array(count*6);let offset=0;
  for(let index=0;index<edges.length;index++){
    const p=edges[index]._world;let distance=0;
    for(let i=2;i<p.length;i+=2){
      const length=Math.hypot(p[i]-p[i-2],p[i+1]-p[i-1]);if(!length)continue;
      // Subtract in JavaScript's double precision before the Float32 upload.
      // Absolute world positions otherwise lose metres of detail at street zoom.
      data[offset++]=p[i-2]-origin[0];data[offset++]=p[i-1]-origin[1];data[offset++]=p[i]-origin[0];data[offset++]=p[i+1]-origin[1];
      data[offset++]=distance;data[offset++]=index;distance+=length;
    }
  }
  return data;
}

// The static layer (map-renderer.js setStaticLayer): pre-styled groups of
// lines (x1,y1,x2,y2) and dots (x,y) in world units. One instance per line or
// dot, its style index the group's, so a group keeps its own colour and width.
export function staticInstances(groups,origin=[0,0]){
  let count=0;for(const group of groups)count+=group.lines.length/4+group.dots.length/2;
  const data=new Float32Array(count*6);let offset=0;
  for(let index=0;index<groups.length;index++){
    const{lines,dots}=groups[index];
    for(let i=0;i<lines.length;i+=4){data[offset++]=lines[i]-origin[0];data[offset++]=lines[i+1]-origin[1];data[offset++]=lines[i+2]-origin[0];data[offset++]=lines[i+3]-origin[1];data[offset++]=0;data[offset++]=index;}
    for(let i=0;i<dots.length;i+=2){const x=dots[i]-origin[0],y=dots[i+1]-origin[1];data[offset++]=x;data[offset++]=y;data[offset++]=x;data[offset++]=y;data[offset++]=0;data[offset++]=index;}
  }
  return data;
}
export function staticStylePixels(groups){
  const data=new Uint8Array(groups.length*2*4);
  for(let i=0;i<groups.length;i++){
    const match=/rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(groups[i].color),color=match?[+match[1],+match[2],+match[3]]:rgb(groups[i].color).slice(0,3).map(v=>Math.round(v*255)),offset=i*8;
    data[offset]=color[0];data[offset+1]=color[1];data[offset+2]=color[2];data[offset+3]=Math.round(Math.min(16,groups[i].width)/16*255);
    data[offset+4]=255;data[offset+5]=0;data[offset+6]=255;data[offset+7]=0;
  }
  return data;
}

export function stylePixels(styles,stride=4){
  const data=new Uint8Array(styles.length*stride*4);
  for(let i=0;i<styles.length;i++)for(let pass=0;pass<stride/2;pass++){
    const style=pass?styles[i].review:styles[i].normal;if(!style)continue;
    const offset=(i*stride+pass*2)*4,color=rgb(style.color);
    data[offset]=Math.round(color[0]*255);data[offset+1]=Math.round(color[1]*255);data[offset+2]=Math.round(color[2]*255);data[offset+3]=Math.round(style.width/16*255);
    data[offset+4]=255;data[offset+5]=style.dash?255:0;data[offset+6]=255;data[offset+7]=frequencyPriority(style.value||1);
  }
  return data;
}

export class RailGPU{
  constructor(canvas,{allowSoftware=true}={}){
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'high-performance'});
    if(!this.gl)throw new Error('WebGL2 unavailable');
    const debug=this.gl.getExtension('WEBGL_debug_renderer_info'),renderer=this.gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:this.gl.RENDERER);
    if(!allowSoftware&&/swiftshader|llvmpipe|softpipe|lavapipe|software/i.test(renderer)){this.gl.getExtension('WEBGL_lose_context')?.loseContext();throw new Error('Software rasterizer uses Canvas');}
    this.restore();
  }
  restore(){
    const gl=this.gl;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw new Error('Rail shader compilation failed');}return s;};
    const vertex=shader(gl.VERTEX_SHADER,VERTEX),fragment=shader(gl.FRAGMENT_SHADER,FRAGMENT);
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Rail shader linking failed');
    gl.useProgram(this.program);
    this.center=gl.getUniformLocation(this.program,'u_center');this.size=gl.getUniformLocation(this.program,'u_size');this.scale=gl.getUniformLocation(this.program,'u_scale');
    this.textureWidth=gl.getUniformLocation(this.program,'u_textureWidth');this.styleStride=gl.getUniformLocation(this.program,'u_styleStride');this.pass=gl.getUniformLocation(this.program,'u_pass');this.layer=gl.getUniformLocation(this.program,'u_layer');gl.uniform1i(gl.getUniformLocation(this.program,'u_styles'),0);
    this.corner=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.corner);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,-1,1,-1,1,1,0,-1,1,1,0,1]),gl.STATIC_DRAW);
    this.main=this.batch(4);this.highlight=this.batch(2);this.staticBatch=this.batch(2);this.staticKey=null;
    gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  }
  batch(stride){
    const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);
    const corner=gl.getAttribLocation(this.program,'a_corner');gl.bindBuffer(gl.ARRAY_BUFFER,this.corner);gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(const[name,size,offset]of[['a_segment',4,0],['a_start',1,4],['a_index',1,5]]){const location=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,24,offset*4);gl.vertexAttribDivisor(location,1);}
    gl.bindVertexArray(null);return{vao,buffer,texture:gl.createTexture(),stride,count:0,origin:[0,0]};
  }
  upload(edges,highlight=false,origin=null){
    const gl=this.gl,batch=highlight?this.highlight:this.main;
    batch.origin=origin||[edges[0]?._world[0]||0,edges[0]?._world[1]||0];
    const data=lineInstances(edges,batch.origin);
    gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);batch.count=data.length/6;
    return batch.count;
  }
  // The static layer's instances and per-group styles; null empties it.
  uploadStatic(layer){
    const gl=this.gl,batch=this.staticBatch,groups=layer?.groups||[];
    batch.origin=[0,0];for(const group of groups){const p=group.lines.length?group.lines:group.dots;if(p.length){batch.origin=[p[0],p[1]];break;}}
    const data=staticInstances(groups,batch.origin);gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);batch.count=data.length/6;
    this.styles(groups.length?staticStylePixels(groups):new Uint8Array(8),batch);this.staticKey=layer?.key??null;
    return batch.count;
  }
  styles(styles,highlight=false){
    const gl=this.gl,batch=highlight&&typeof highlight==='object'?highlight:highlight?this.highlight:this.main,width=Math.min(1024,gl.getParameter(gl.MAX_TEXTURE_SIZE)),pixels=styles instanceof Uint8Array?styles:stylePixels(styles,batch.stride),height=Math.max(1,Math.ceil(pixels.length/(width*4)));
    const padded=new Uint8Array(width*height*4);padded.set(pixels);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,batch.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(batch.width===width&&batch.height===height)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,padded);
    else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,padded);batch.width=width;batch.height=height;}
  }
  draw(view,review=false,{staticLayer=false,edges=true}={}){
    const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    gl.uniform2f(this.size,view.width,view.height);gl.uniform1f(this.scale,view.scale);
    // The static layer first, with the same view uniforms, beneath the edges.
    const staticBatch=this.staticBatch;
    if(staticLayer&&staticBatch.count){
      gl.uniform2f(this.center,view.centerX-staticBatch.origin[0],view.centerY-staticBatch.origin[1]);
      gl.bindVertexArray(staticBatch.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,staticBatch.texture);gl.uniform1i(this.textureWidth,staticBatch.width);gl.uniform1i(this.styleStride,staticBatch.stride);gl.uniform1i(this.layer,3);gl.uniform1i(this.pass,0);gl.drawArraysInstanced(gl.TRIANGLES,0,6,staticBatch.count);
    }
    for(const batch of edges?[this.main,this.highlight]:[this.highlight])if(batch.count){
      gl.uniform2f(this.center,view.centerX-batch.origin[0],view.centerY-batch.origin[1]);
      gl.bindVertexArray(batch.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,batch.texture);gl.uniform1i(this.textureWidth,batch.width);gl.uniform1i(this.styleStride,batch.stride);gl.uniform1i(this.layer,batch===this.main?0:2);gl.uniform1i(this.pass,0);gl.drawArraysInstanced(gl.TRIANGLES,0,6,batch.count);
      if(batch===this.main&&review){gl.uniform1i(this.pass,1);gl.uniform1i(this.layer,1);gl.drawArraysInstanced(gl.TRIANGLES,0,6,batch.count);}
    }
    gl.bindVertexArray(null);
  }
}
