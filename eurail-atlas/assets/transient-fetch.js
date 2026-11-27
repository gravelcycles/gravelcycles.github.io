// Bounded retry for static asset fetches: a dropped connection or a 5xx answer
// is retried with a growing delay; 4xx answers and cancellation are final.
import{railFetch}from'./rail-r2.js?v=9950f30ee93e8b21';
// The default fetcher is railFetch: unchanged network fetches on an in-tree
// site; Worker-or-lite, hash-checked answers once a rail pointer is installed.
// The returned body is metered (net-meter.js) for the loading screens.
import{meterResponse}from'./net-meter.js?v=9950f30ee93e8b21';
function abortError(){return new DOMException('Data request cancelled','AbortError');}
export async function fetchWithTransientRetry(url,options={},{attempts=3,delay=400,fetcher=railFetch}={}){
  for(let attempt=1;;attempt++){
    let response;
    try{response=await fetcher(url,options);}
    // DetailUnavailable (rail-r2.js): the Worker is refusing and the object has
    // no lite copy; retrying cannot help until the refusal window ends.
    catch(error){if(error?.name==='AbortError'||error?.name==='DetailUnavailable'||options.signal?.aborted||attempt>=attempts)throw error;}
    if(response&&(response.status<500||attempt>=attempts))return meterResponse(url,options,response);
    await new Promise(resolve=>setTimeout(resolve,delay*attempt));
    if(options.signal?.aborted)throw abortError();
  }
}
