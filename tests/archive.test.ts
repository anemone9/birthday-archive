import test from 'node:test';
import assert from 'node:assert/strict';
import { createArchive, validateArchive, assertEmbeddedGLB, validateUploadMeta } from '../lib/archive.ts';

function glb(json: unknown) {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const size = Math.ceil(raw.length / 4) * 4;
  const buffer = new ArrayBuffer(20 + size);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer,20).fill(32); new Uint8Array(buffer,20,raw.length).set(raw);
  return buffer;
}

test('backup round trip preserves Chinese paragraphs, gift ordering and signature', () => {
  const archive = createArchive();
  archive.letter = '收件人：\n第一段。\n\n第二段。';
  archive.gifts.reverse();
  const result = validateArchive(JSON.parse(JSON.stringify(archive)));
  assert.equal(result.letter, '收件人：\n第一段。\n\n第二段。');
  assert.equal(result.signature, '爱你的人');
  assert.equal(result.gifts[0].name, '第四份礼物');
  assert.equal(result.gifts.length, 4);
});
test('backups reject duplicate identities that would reveal or edit the wrong gift', () => {
  const archive = createArchive(); archive.gifts[1].id = archive.gifts[0].id;
  assert.throws(() => validateArchive(archive), /重复/);
});
test('backups reject remote media and unknown versions without mutating the input', () => {
  const archive = createArchive(); archive.gifts[0].image = 'https://example.org/tracking.jpg';
  assert.throws(() => validateArchive(archive), /图片/);
  assert.equal(archive.gifts[0].image,'https://example.org/tracking.jpg');
  assert.throws(() => validateArchive({...createArchive(),version:2}), /版本/);
});
test('backup bounds reject empty gifts, overlong letters and more than twelve gifts', () => {
  const archive = createArchive();
  assert.throws(() => validateArchive({...archive,gifts:[]}), /礼物/);
  assert.throws(() => validateArchive({...archive,letter:'字'.repeat(20001)}), /信件/);
  assert.throws(() => validateArchive({...archive,gifts:Array.from({length:13},(_,i)=>({...archive.gifts[0],id:'g'+i}))}), /礼物/);
});
test('file metadata rejects disguised executable uploads and oversize images', () => {
  assert.throws(() => validateUploadMeta({name:'photo.svg',size:20,type:'image/svg+xml'},'image'), /PNG/);
  assert.throws(() => validateUploadMeta({name:'photo.png',size:9*1024*1024,type:'image/png'},'image'), /8/);
  assert.doesNotThrow(() => validateUploadMeta({name:'camera.glb',size:2048,type:''},'model'));
});
test('GLB accepts embedded geometry and rejects external texture or buffer requests', () => {
  assert.doesNotThrow(()=>assertEmbeddedGLB(glb({asset:{version:'2.0'},buffers:[{byteLength:0}]})));
  assert.throws(()=>assertEmbeddedGLB(glb({asset:{version:'2.0'},images:[{uri:'https://example.org/a.png'}]})), /外部/);
  assert.throws(()=>assertEmbeddedGLB(glb({asset:{version:'2.0'},buffers:[{uri:'file.bin'}]})), /外部/);
});
test('invalid and decoder-dependent GLBs fail with an actionable error', () => {
  assert.throws(()=>assertEmbeddedGLB(new ArrayBuffer(4)), /GLB/);
  assert.throws(()=>assertEmbeddedGLB(glb({asset:{version:'2.0'},extensionsRequired:['KHR_draco_mesh_compression']})), /压缩/);
});
