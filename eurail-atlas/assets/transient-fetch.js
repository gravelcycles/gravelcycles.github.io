// Bounded retry for static asset fetches: a dropped connection or a 5xx answer
// is retried with a growing delay; 4xx answers and cancellation are final.
function abortError(){return new DOMException('Data request cancelled','AbortError');}
export async function fetchWithTransientRetry(url,options={},{attempts=3,delay=400,fetcher=globalThis.fetch}={}){
  for(let attempt=1;;attempt++){
    let response;
    try{response=await fetcher(url,options);}
    catch(error){if(error?.name==='AbortError'||options.signal?.aborted||attempt>=attempts)throw error;}
    if(response&&(response.status<500||attempt>=attempts))return response;
    await new Promise(resolve=>setTimeout(resolve,delay*attempt));
    if(options.signal?.aborted)throw abortError();
  }
}
