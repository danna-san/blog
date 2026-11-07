// JPEG の Exif から GPS 情報だけを消す（ImageMagick が無い環境向けの保険）。
// 向き(Orientation)などは残すので、写真が横倒しになることはない。

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

export function stripJpegGps(input) {
  const buf = Buffer.from(input);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return { buffer: buf, stripped: false };
  let off = 2;
  let stripped = false;
  while (off + 4 <= buf.length && buf[off] === 0xff) {
    const marker = buf[off + 1];
    if (marker === 0xda || marker === 0xd9) break; // 画像データ開始
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString('latin1', off + 4, off + 10) === 'Exif\0\0') {
      stripped = clearGpsInTiff(buf, off + 10, off + 2 + len) || stripped;
    }
    off += 2 + len;
  }
  return { buffer: buf, stripped };
}

function clearGpsInTiff(buf, tiff, end) {
  const le = buf.toString('latin1', tiff, tiff + 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > end) return false;
  const n = u16(ifd0);
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > end) return false;
    if (u16(e) !== 0x8825) continue; // GPSInfo
    const gps = tiff + u32(e + 8);
    if (gps + 2 > end) return false;
    const gn = u16(gps);
    for (let j = 0; j < gn; j++) {
      const ge = gps + 2 + j * 12;
      if (ge + 12 > end) break;
      const size = (TYPE_SIZE[u16(ge + 2)] || 1) * u32(ge + 4);
      if (size > 4) {
        const vo = tiff + u32(ge + 8);
        if (vo + size <= end) buf.fill(0, vo, vo + size);
      }
      buf.fill(0, ge, ge + 12);
    }
    buf.fill(0, gps, gps + 2); // エントリ数 = 0
    return true;
  }
  return false;
}
