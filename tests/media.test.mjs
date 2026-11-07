import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripJpegGps } from '../scripts/lib/exif.mjs';
import { imageSize } from '../scripts/lib/images.mjs';

// GPS（緯度）と向き（6 = 90 度回転）を持つ、最小の JPEG を組み立てる
function jpegWithGps() {
  const tiff = Buffer.alloc(80);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 の位置
  tiff.writeUInt16LE(2, 8); // エントリ数
  // Orientation
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(6, 18);
  // GPSInfo → 38
  tiff.writeUInt16LE(0x8825, 22); tiff.writeUInt16LE(4, 24); tiff.writeUInt32LE(1, 26); tiff.writeUInt32LE(38, 30);
  tiff.writeUInt32LE(0, 34); // 次の IFD なし
  // GPS IFD: GPSLatitude (RATIONAL x3 → 56)
  tiff.writeUInt16LE(1, 38);
  tiff.writeUInt16LE(0x0002, 40); tiff.writeUInt16LE(5, 42); tiff.writeUInt32LE(3, 44); tiff.writeUInt32LE(56, 48);
  for (let i = 0; i < 6; i++) tiff.writeUInt32LE(35 + i, 56 + i * 4);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4); app1[0] = 0xff; app1[1] = 0xe1; app1.writeUInt16BE(exif.length + 2, 2);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]); // 640x480
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, exif, sof, Buffer.from([0xff, 0xd9])]);
}

test('JPEG の GPS 情報を消し、向きは残す（R7.2）', () => {
  const src = jpegWithGps();
  assert.ok(src.includes(Buffer.from([35, 0, 0, 0, 36, 0, 0, 0])));
  const { buffer, stripped } = stripJpegGps(src);
  assert.ok(stripped);
  assert.ok(!buffer.includes(Buffer.from([35, 0, 0, 0, 36, 0, 0, 0])), '緯度の値が残っている');
  assert.equal(buffer.length, src.length);
  // 向き 6 なので幅と高さが入れ替わる
  assert.deepEqual(imageSize(buffer), { width: 480, height: 640 });
});

test('GPS が無い・JPEG でないものはそのまま', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000100000000808060000', 'hex');
  assert.equal(stripJpegGps(png).stripped, false);
  assert.deepEqual(imageSize(png), { width: 16, height: 8 });
});
