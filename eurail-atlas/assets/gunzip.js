// Gzip decoder for browsers without DecompressionStream (Safari before 16.4,
// Firefox before 113 and some in-app browsers). It is imported on demand only;
// browsers with the native stream never load it.
//
// Implements one gzip member (RFC 1952) holding a DEFLATE stream (RFC 1951).
// Huffman codes are decoded through a 15-bit lookup table, so each symbol is a
// single table read. The gzip trailer gives the exact output size, so output
// is allocated once and any size disagreement is reported as corrupt data
// instead of returning truncated JSON. The CRC is not checked; callers parse
// the result as JSON, and the bus reader also checks uncompressed byte counts.

const MAX_BITS=15,TABLE_SIZE=1<<MAX_BITS,TABLE_MASK=TABLE_SIZE-1;
const LENGTH_BASE=new Uint16Array([3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258]);
const LENGTH_EXTRA=new Uint8Array([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]);
const DIST_BASE=new Uint16Array([1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577]);
const DIST_EXTRA=new Uint8Array([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]);
const CODE_LENGTH_ORDER=new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]);

// Table entry: (code length << 9) | symbol. Length 0 marks an unused code.
function buildTable(lengths,count){
  const counts=new Uint16Array(MAX_BITS+1),next=new Uint16Array(MAX_BITS+2);
  for(let i=0;i<count;i++)counts[lengths[i]]++;
  counts[0]=0;let left=1;
  for(let len=1;len<=MAX_BITS;len++){left=(left<<1)-counts[len];if(left<0)throw new Error('Invalid gzip data: over-subscribed Huffman code');}
  for(let len=1,code=0;len<=MAX_BITS;len++){code=(code+counts[len-1])<<1;next[len]=code;}
  const table=new Uint16Array(TABLE_SIZE);
  for(let symbol=0;symbol<count;symbol++){
    const len=lengths[symbol];if(!len)continue;
    let code=next[len]++,reversed=0;
    for(let i=0;i<len;i++){reversed=(reversed<<1)|(code&1);code>>>=1;}
    const entry=(len<<9)|symbol;
    for(let index=reversed;index<TABLE_SIZE;index+=1<<len)table[index]=entry;
  }
  return table;
}

let fixedTables=null;
function fixed(){
  if(fixedTables)return fixedTables;
  const lit=new Uint8Array(288);lit.fill(8,0,144);lit.fill(9,144,256);lit.fill(7,256,280);lit.fill(8,280,288);
  const dist=new Uint8Array(30).fill(5);
  return fixedTables=[buildTable(lit,288),buildTable(dist,30)];
}

function inflate(src,dst){
  let pos=0,bitBuf=0,bitCount=0,out=0;
  const limit=src.length+4;
  const need=n=>{while(bitCount<n){if(pos>=limit)throw new Error('Invalid gzip data: unexpected end');bitBuf|=(pos<src.length?src[pos]:0)<<bitCount;pos++;bitCount+=8;}};
  const bits=n=>{need(n);const v=bitBuf&((1<<n)-1);bitBuf>>>=n;bitCount-=n;return v;};
  const decode=table=>{need(MAX_BITS);const entry=table[bitBuf&TABLE_MASK],len=entry>>9;if(!len)throw new Error('Invalid gzip data: unknown Huffman code');bitBuf>>>=len;bitCount-=len;return entry&511;};
  let final=0;
  do{
    final=bits(1);const type=bits(2);
    if(type===0){
      // Stored block: return whole buffered bytes to the input, then copy.
      const drop=bitCount&7;bitBuf>>>=drop;bitCount-=drop;pos-=bitCount>>3;bitBuf=0;bitCount=0;
      if(pos+4>src.length)throw new Error('Invalid gzip data: unexpected end');
      const len=src[pos]|src[pos+1]<<8,nlen=src[pos+2]|src[pos+3]<<8;pos+=4;
      if((len^0xffff)!==nlen)throw new Error('Invalid gzip data: stored block length');
      if(pos+len>src.length||out+len>dst.length)throw new Error('Invalid gzip data: stored block overflow');
      dst.set(src.subarray(pos,pos+len),out);pos+=len;out+=len;continue;
    }
    let lit,dist;
    if(type===1)[lit,dist]=fixed();
    else if(type===2){
      const nlit=bits(5)+257,ndist=bits(5)+1,nclen=bits(4)+4;
      if(nlit>286||ndist>30)throw new Error('Invalid gzip data: code counts');
      const clen=new Uint8Array(19);for(let i=0;i<nclen;i++)clen[CODE_LENGTH_ORDER[i]]=bits(3);
      const clTable=buildTable(clen,19),lengths=new Uint8Array(nlit+ndist);
      for(let i=0;i<nlit+ndist;){
        const sym=decode(clTable);
        if(sym<16){lengths[i++]=sym;continue;}
        let value=0,repeat;
        if(sym===16){if(!i)throw new Error('Invalid gzip data: repeat with no length');value=lengths[i-1];repeat=3+bits(2);}
        else if(sym===17)repeat=3+bits(3);
        else repeat=11+bits(7);
        if(i+repeat>nlit+ndist)throw new Error('Invalid gzip data: too many code lengths');
        lengths.fill(value,i,i+repeat);i+=repeat;
      }
      if(!lengths[256])throw new Error('Invalid gzip data: missing end-of-block code');
      lit=buildTable(lengths.subarray(0,nlit),nlit);dist=buildTable(lengths.subarray(nlit),ndist);
    }else throw new Error('Invalid gzip data: block type');
    for(;;){
      const sym=decode(lit);
      if(sym<256){if(out>=dst.length)throw new Error('Invalid gzip data: output overflow');dst[out++]=sym;continue;}
      if(sym===256)break;
      const li=sym-257;if(li>=29)throw new Error('Invalid gzip data: length code');
      const len=LENGTH_BASE[li]+(LENGTH_EXTRA[li]?bits(LENGTH_EXTRA[li]):0);
      const di=decode(dist);if(di>=30)throw new Error('Invalid gzip data: distance code');
      const distance=DIST_BASE[di]+(DIST_EXTRA[di]?bits(DIST_EXTRA[di]):0);
      if(distance>out)throw new Error('Invalid gzip data: distance too far back');
      if(out+len>dst.length)throw new Error('Invalid gzip data: output overflow');
      if(distance>=len){dst.copyWithin(out,out-distance,out-distance+len);out+=len;}
      else for(let k=0;k<len;k++,out++)dst[out]=dst[out-distance];
    }
  }while(!final);
  return out;
}

// Decode one gzip member to bytes. maxBytes rejects oversized output before
// allocating it.
export function gunzip(input,{maxBytes=Infinity}={}){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<18||bytes[0]!==0x1f||bytes[1]!==0x8b||bytes[2]!==8)throw new Error('Not a gzip deflate stream');
  const flags=bytes[3];let index=10;
  if(flags&0xe0)throw new Error('Unsupported gzip header flags');
  if(flags&4)index+=2+(bytes[index]|bytes[index+1]<<8);
  if(flags&8){while(index<bytes.length&&bytes[index]!==0)index++;index++;}
  if(flags&16){while(index<bytes.length&&bytes[index]!==0)index++;index++;}
  if(flags&2)index+=2;
  const end=bytes.length;
  if(index>end-8)throw new Error('Truncated gzip header');
  const size=(bytes[end-4]|bytes[end-3]<<8|bytes[end-2]<<16|bytes[end-1]<<24)>>>0;
  if(size>maxBytes)throw new Error('Decoded data exceeds memory budget');
  const out=new Uint8Array(size);
  if(inflate(bytes.subarray(index,end-8),out)!==size)throw new Error('Invalid gzip data: size mismatch');
  return out;
}
