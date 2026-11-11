// Location of the spatial bus network derivative for one exact bus cohort.
// Built by scripts/build_bus_network_tiles.py and published immutably in the
// bus geometry repository; the commit pins every byte and the catalogue hash
// pins the tile hashes. A deployment may override this with a `busNetwork`
// block in its delivery configuration. A cohort mismatch or an unreachable
// host leaves the native packet path in use.
export const BUS_NETWORK={
  busManifestSha256:'b5fd8f46481680ca781defc35f52cf181217ac5caa78677ac5196390f3ebf25b',
  assetBaseUrl:'https://raw.githubusercontent.com/gravelcycles/eurail-bus-geometry/458b2655063494d651690958f8b88277d351abf5/network/b5fd8f46481680ca781defc35f52cf181217ac5caa78677ac5196390f3ebf25b/',
  catalogue:{path:'catalogue.json.gz',sha256:'964f224a5912eedde36e15e33d788d9ca22c7a42f653b074798802a0aaf7d6e9',bytes:10186,uncompressedBytes:32502,encoding:'gzip'},
};
