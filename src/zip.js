/* Minimal ZIP STORE writer. No compression, network, workers or dependencies. */
(function (root) {
  "use strict";
  const encoder = new TextEncoder();
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }
  function createZip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    let count = 0;
    for (const [path, contents] of Object.entries(files)) {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(path) || path.includes("..") || path.startsWith("/")) throw new Error("Unsafe ZIP path.");
      const name = encoder.encode(path);
      const bytes = contents instanceof Uint8Array ? contents : encoder.encode(String(contents));
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x0800, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, bytes.length, true);
      l.setUint32(22, bytes.length, true);
      l.setUint16(26, name.length, true);
      local.set(name, 30);
      chunks.push(local, bytes);
      const dir = new Uint8Array(46 + name.length);
      const d = new DataView(dir.buffer);
      d.setUint32(0, 0x02014b50, true);
      d.setUint16(4, 20, true);
      d.setUint16(6, 20, true);
      d.setUint16(8, 0x0800, true);
      d.setUint32(16, crc, true);
      d.setUint32(20, bytes.length, true);
      d.setUint32(24, bytes.length, true);
      d.setUint16(28, name.length, true);
      d.setUint32(42, offset, true);
      dir.set(name, 46);
      central.push(dir);
      offset += local.length + bytes.length;
      count++;
    }
    const centralLength = central.reduce((n, x) => n + x.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, count, true);
    e.setUint16(10, count, true);
    e.setUint32(12, centralLength, true);
    e.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }
  root.MCPZip = { createZip };
})(globalThis);
