import{validBusDocument}from'./bus-core.js?v=f3b9966f76c4666e';
import{safeBusBase}from'./bus-delivery.js?v=f3b9966f76c4666e';

const limits=Object.freeze({wireBytes:512*1024,decodedBytes:4*1024*1024,rows:2048,vertices:12000});
const hash=/^[a-f0-9]{64}$/,classes=new Set(['publisher_stop_chain','source_sampled_path','provider_nonliteral_unverified','schematic_missing','schematic_rejected','inferred_road']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function descriptor(value){if(!value||!hash.test(value.sha256||'')||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>limits.wireBytes||!Number.isSafeInteger(value.uncompressedBytes)||value.uncompressedBytes<1||value.uncompressedBytes>limits.decodedBytes||value.encoding!=='gzip')throw new Error('Unbounded bus geometry descriptor');return value;}
function binding(value,kind,manifest,sha,source){validBusDocument(value,kind);if(value.nativeManifestSha256!==sha||value.dates&&!same(value.dates,manifest.dates)||source&&(value.sourceId!==source.id||value.archiveSha256!==source.archiveSha256))throw new Error('Bus geometry native identity mismatch');return value;}
function sources(rows,manifest){if(!Array.isArray(rows)||rows.length!==manifest.sources.length)throw new Error('Bus geometry source set mismatch');const expected=new Map(manifest.sources.map(row=>[row.id,row.archiveSha256]));for(const row of rows){if(!expected.has(row.sourceId)||expected.get(row.sourceId)!==row.archiveSha256)throw new Error('Bus geometry source/archive mismatch');expected.delete(row.sourceId);}if(expected.size)throw new Error('Bus geometry source set mismatch');}

// This derivative changes a selected route's display only. Its native calls,
// journey identities, permissions and clocks remain the immutable detail record.
export class BusGeometryReference{
  constructor(requests,configuration){this.requests=requests;this.configuration=configuration;}
  async lookup(manifest,manifestSha,detail,reader,check,includeFine=false){
    const cfg=this.configuration;if(!cfg||cfg.busManifestSha256!==manifestSha||!hash.test(manifestSha))throw new Error('Bus geometry configuration/cohort mismatch');safeBusBase(cfg.assetBaseUrl);
    const source=manifest.sources.find(row=>row.id===detail.sourceId),prefix=source&&detail.id?.slice(source.id.length+1);
    if(!source||detail.provenance?.archiveSha256!==source.archiveSha256||!detail.id.startsWith(source.id+':')||!/^[a-f0-9]{24}$/.test(prefix||''))throw new Error('Bus geometry selected native identity mismatch');
    const read=async(asset,kind,scope)=>{const value=await this.requests.load(descriptor(asset),{reader,limit:limits.wireBytes});check();return binding(value,kind,manifest,manifestSha,scope);};
    const root=await read(cfg.manifest,'bus_atlas_geometry_manifest');if(!same(root.dates,manifest.dates))throw new Error('Bus geometry date mismatch');sources(root.sources,manifest);
    if(root.limits?.lookupMaxRows!==limits.rows||root.limits.wireBytes!==limits.wireBytes||root.limits.decodedBytes!==limits.decodedBytes||root.limits.fineMaxVertices!==limits.vertices)throw new Error('Bus geometry budget mismatch');
    const catalogue=await read(root.catalogue,'bus_atlas_geometry_catalogue');if(!same(catalogue.dates,manifest.dates))throw new Error('Bus geometry catalogue dates mismatch');sources(catalogue.sources,manifest);
    const sourceEntry=catalogue.sources.find(row=>row.sourceId===source.id),index=await read(sourceEntry.index,'bus_atlas_geometry_source',source);
    if(index.prefixLength!==2||!Array.isArray(index.partitions)||index.partitions.length>256||new Set(index.partitions.map(row=>row.prefix)).size!==index.partitions.length||index.partitions.some(row=>!/^[a-f0-9]{2}$/.test(row.prefix)))throw new Error('Invalid bus geometry source index');
    const partition=index.partitions.find(row=>row.prefix===prefix.slice(0,2));if(!partition)return null;
    const packet=await read(partition.lookup,'bus_atlas_geometry_lookup',source);
    if(packet.prefix!==partition.prefix||!Array.isArray(packet.routes)||packet.routes.length>limits.rows||new Set(packet.routes.map(row=>row.id)).size!==packet.routes.length||packet.routes.some(row=>typeof row.id!=='string'||!row.id.startsWith(source.id+':'+partition.prefix)||!/^[a-f0-9]{24}$/.test(row.id.slice(source.id.length+1))))throw new Error('Bus geometry lookup identity mismatch');
    const row=packet.routes.find(row=>row.id===detail.id);if(!row)return null;
    const expectedGeometry={publisher_stop_chain:'schematic',schematic_missing:'schematic',schematic_rejected:'schematic',source_sampled_path:'provider_shape',provider_nonliteral_unverified:'provider_shape',inferred_road:'inferred_road'};
    if(!classes.has(row.classification)||row.geometry!==expectedGeometry[row.classification]||typeof row.geometryWarning!=='string'||row.geometryWarning.length>4096)throw new Error('Unsupported bus geometry classification');
    const result={classification:row.classification,geometry:row.classification==='inferred_road'?'schematic':row.geometry,geometryWarning:row.geometryWarning,geometryAvailable:!!row.geometryDetail};
    if(row.geometryDetail&&includeFine){
      const fine=await read(row.geometryDetail,'bus_atlas_geometry',source),coordinates=fine.coordinates;
      if(!/^[a-f0-9]{24}$/.test(row.geometryDetail.geometryId||'')||fine.id!==row.geometryDetail.geometryId||fine.sourceShapeId!==detail.trips?.[0]?.sourceShapeId||!fine.sourceProvenance||['archiveSha256','sourceUrl','sourcePage','retrievedAt','licence','licenceUrl','attribution'].some(key=>fine.sourceProvenance[key]!==source[key])||fine.geometry!==row.geometry||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>limits.vertices||coordinates.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>85.051129)||!hash.test(fine.nativePathSha256||''))throw new Error('Invalid bus geometry fine path');
      if(row.classification==='inferred_road'&&(!fine.provenance||typeof fine.provenance.attribution!=='string'))throw new Error('Road estimate lacks its attribution');
      Object.assign(result,{geometry:fine.geometry,coordinates,geometryKey:row.geometryDetail.sha256,geometryProvenance:fine.provenance||null,fine:true});
    }
    check();return result;
  }
}
