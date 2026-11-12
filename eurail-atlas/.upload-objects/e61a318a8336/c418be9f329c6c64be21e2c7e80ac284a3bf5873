// A static host may serve .json.gz as raw bytes or transparently decode it.
// Inspect the delivered body rather than trusting Content-Type/Encoding.
export function resolveAssetPath(path,manifest){return manifest?.assetPaths?.[path]||path;}
export function resolveAssetURL(path,manifest,manifestURL){const physical=resolveAssetPath(path,manifest),url=new URL(physical,manifestURL),sha=manifest?.assets?.[physical]?.sha256;if(typeof sha==='string'&&/^[0-9a-f]{64}$/.test(sha))url.searchParams.set('v',sha);return url.href;}
export async function decodeJSONBytes(input,reportTextBytes){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>=2&&bytes[0]===0x1f&&bytes[1]===0x8b){
    let text;
    if(typeof DecompressionStream==='function'){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));text=await new Response(stream).text();}
    else{const{gunzip}=await import('./gunzip.js?v=2c9bcc6123743fe4');text=new TextDecoder().decode(gunzip(bytes));}
    reportTextBytes?.(text.length*2);return JSON.parse(text);
  }
  const text=new TextDecoder().decode(bytes);reportTextBytes?.(text.length*2);return JSON.parse(text);
}
export async function decodeJSONResponse(response,reportTextBytes){return decodeJSONBytes(await response.arrayBuffer(),reportTextBytes);}
