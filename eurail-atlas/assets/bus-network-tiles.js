// Location of the spatial bus network derivative for one exact bus cohort.
// Built by scripts/build_bus_network_tiles.py and published immutably in the
// bus geometry repository; the commit pins every byte and the catalogue hash
// pins the tile hashes. A deployment may override this with a `busNetwork`
// block in its delivery configuration. A cohort mismatch or an unreachable
// host leaves the native packet path in use.
export const BUS_NETWORK={
  busManifestSha256:'b5fd8f46481680ca781defc35f52cf181217ac5caa78677ac5196390f3ebf25b',
  assetBaseUrl:'https://raw.githubusercontent.com/gravelcycles/eurail-bus-geometry/50d60f0bd17e3ceed5a3c9b297ac34506f4ae09d/network/b5fd8f46481680ca781defc35f52cf181217ac5caa78677ac5196390f3ebf25b/',
  catalogue:{path:'catalogue.json.gz',sha256:'e489ac8707bd2597151206ea32fc6cbd37b0c66a0b3f15bbd6be41fced816800',bytes:10703,uncompressedBytes:33442,encoding:'gzip'},
};
// Trips that two sources of the cohort both publish are shown once. The list is
// built by scripts/build_bus_duplicates.py and published beside the catalogue
// of tiles built with `--duplicates` from the same file. Fill the descriptor
// from the `duplicates` block of that build's report when the directory is
// published; while it is null every record is shown as published. A
// `busDuplicates` block in the delivery configuration overrides it.
const DUPLICATES={path:'duplicates.json.gz',sha256:'3aa3445e81245531dfc5eab04fdba6b05375a54e708d981f9188b24e15bf42ca',bytes:176955,uncompressedBytes:561530,encoding:'gzip'};
export const BUS_DUPLICATES=DUPLICATES&&{busManifestSha256:BUS_NETWORK.busManifestSha256,assetBaseUrl:BUS_NETWORK.assetBaseUrl,duplicates:DUPLICATES};
