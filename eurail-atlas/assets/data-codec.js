// A static host may serve .json.gz as raw bytes or transparently decode it.
// Inspect the delivered body rather than trusting Content-Type/Encoding.
export function resolveAssetPath(path,manifest){return manifest?.assetPaths?.[path]||path;}
export function resolveAssetURL(path,manifest,manifestURL){const physical=resolveAssetPath(path,manifest),url=new URL(physical,manifestURL),sha=manifest?.assets?.[physical]?.sha256;if(typeof sha==='string'&&/^[0-9a-f]{64}$/.test(sha))url.searchParams.set('v',sha);return url.href;}
export async function decodeJSONBytes(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>=2&&bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream!=='function')throw new Error('This browser cannot decompress the atlas data. Use a current browser.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function decodeJSONResponse(response){return decodeJSONBytes(await response.arrayBuffer());}
