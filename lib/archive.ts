export type GiftKind = 'camera' | 'cup' | 'cap' | 'care' | 'custom';
export type GiftColor = 'lavender' | 'rose' | 'sage' | 'pink' | 'sky' | 'silver';
export type Gift = { id: string; name: string; unopenedText: string; reason: string; kind: GiftKind; color: GiftColor; image?: string; model?: string; modelName?: string };
export type Archive = { version: 1; brand: string; recipient: string; title: string; subtitle: string; letter: string; signature: string; gifts: Gift[] };
export const MAX_GIFTS = 12;
export const MAX_BACKUP_BYTES = 120 * 1024 * 1024;
export const MAX_MEDIA_TOTAL_BYTES = 80 * 1024 * 1024;
export const DEFAULT_UNOPENED_GIFT_TEXT = '一份，想送给你的心意';
const MB = 1024 * 1024;
const kinds: GiftKind[] = ['camera', 'cup', 'cap', 'care', 'custom'];
const colors: GiftColor[] = ['lavender', 'rose', 'sage', 'pink', 'sky', 'silver'];

export function createArchive(): Archive {
  return {version:1,brand:'生日快乐！',recipient:'亲爱的你',title:'把心意，一件件送给你。',subtitle:'一封写给你的信，和几份想亲手交给你的礼物。',letter:'',signature:'爱你的人',gifts:[
    {id:'gift-1',name:'第一份礼物',unopenedText:DEFAULT_UNOPENED_GIFT_TEXT,reason:'',kind:'custom',color:'lavender'},
    {id:'gift-2',name:'第二份礼物',unopenedText:DEFAULT_UNOPENED_GIFT_TEXT,reason:'',kind:'custom',color:'sky'},
    {id:'gift-3',name:'第三份礼物',unopenedText:DEFAULT_UNOPENED_GIFT_TEXT,reason:'',kind:'custom',color:'pink'},
    {id:'gift-4',name:'第四份礼物',unopenedText:DEFAULT_UNOPENED_GIFT_TEXT,reason:'',kind:'custom',color:'silver'},
  ]};
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份内容格式不正确。');
  return value as Record<string,unknown>;
}
function field(value: unknown,label:string,max:number,required=false): string {
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())) throw new Error(`${label}需要填写，且不能超过 ${max} 个字。`);
  return value;
}
function decodeBase64(value:string):ArrayBuffer {
  const raw = atob(value); const bytes = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  return bytes.buffer;
}
let mediaTotalBytes=0;
function media(value:unknown,type:'image'|'model'):string|undefined {
  if(value===undefined||value==='') return undefined;
  const label=type==='image'?'图片':'模型';
  const max=type==='image'?8*MB:20*MB;
  if(typeof value!=='string'||value.length>Math.ceil(max*4/3)+100) throw new Error(`${label}文件过大。`);
  const match=value.match(type==='image'?/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/:/^data:(model\/gltf-binary|application\/octet-stream);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match) throw new Error(`${label}必须是备份中包含的有效本地文件。`);
  const bytes=decodeBase64(match[2]);
  if(bytes.byteLength>max) throw new Error(`${label}文件过大。`);
  mediaTotalBytes+=bytes.byteLength;
  if(mediaTotalBytes>MAX_MEDIA_TOTAL_BYTES) throw new Error('照片和模型合计请控制在 80MB 以内，备份才可以正常导出和导入。');
  if(type==='model') assertEmbeddedGLB(bytes);
  else if(!imageMime(bytes)) throw new Error('图片内容不是有效的 PNG、JPEG 或 WebP。');
  return value;
}
export function validateArchive(input:unknown):Archive {
  const row=record(input);
  if(row.version!==1) throw new Error('不支持这份备份的版本。');
  if(!Array.isArray(row.gifts)||row.gifts.length<1||row.gifts.length>MAX_GIFTS) throw new Error(`请保留 1 至 ${MAX_GIFTS} 份礼物。`);
  const ids=new Set<string>();
  mediaTotalBytes=0;
  const gifts=row.gifts.map((input):Gift=>{
    const g=record(input);
    const id=field(g.id,'礼物编号',80,true);
    if(!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('礼物编号不正确。');
    if(ids.has(id)) throw new Error('礼物编号重复，请检查备份。'); ids.add(id);
    const color:GiftColor=g.color==='butter'?'pink':g.color as GiftColor;
    if(!kinds.includes(g.kind as GiftKind)||!colors.includes(color)) throw new Error('礼物样式不正确。');
    return {id,name:field(g.name,'礼物名称',80,true),unopenedText:field(g.unopenedText??DEFAULT_UNOPENED_GIFT_TEXT,'礼盒未打开时显示的文字',40,true),reason:field(g.reason,'挑选理由',4000),kind:g.kind as GiftKind,color,image:media(g.image,'image'),model:media(g.model,'model'),modelName:g.modelName?field(g.modelName,'模型文件名',240):undefined};
  });
  return {version:1,brand:field(row.brand??'生日快乐！','页眉标题',60,true),recipient:field(row.recipient,'称呼',50,true),title:field(row.title,'封面标题',100,true),subtitle:field(row.subtitle,'封面小字',240),letter:field(row.letter,'信件',20000),signature:field(row.signature,'署名',80,true),gifts};
}
export function validateUploadMeta(file:{name:string;size:number;type:string},kind:'image'|'model') {
  if(file.size<=0) throw new Error('这个文件是空的，请重新选择。');
  if(kind==='image') {
    if(!/\.(png|jpe?g|webp)$/i.test(file.name)|| (file.type&&!['image/png','image/jpeg','image/webp'].includes(file.type))) throw new Error('照片请选择 PNG、JPEG 或 WebP 文件。');
    if(file.size>8*MB) throw new Error('照片请控制在 8MB 以内。');
  } else {
    if(!/\.glb$/i.test(file.name)) throw new Error('模型请选择内嵌贴图的 .glb 文件。');
    if(file.size>20*MB) throw new Error('模型请控制在 20MB 以内。');
  }
}
function imageMime(buffer:ArrayBuffer) {
  const b=new Uint8Array(buffer);
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
  if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)return 'image/png';
  if(b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return 'image/webp';
  return null;
}
async function assertImageDecodes(source:string|Blob) {
  const url=typeof source==='string'?source:URL.createObjectURL(source);
  const image=new Image();
  try {
    image.src=url;
    await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('empty image');
  } catch {
    throw new Error('照片已损坏或无法解码，请重新选择有效的 PNG、JPEG 或 WebP 图片。');
  } finally {
    if(typeof source!=='string')URL.revokeObjectURL(url);
  }
}
export async function validateArchiveMedia(input:unknown):Promise<Archive> {
  const archive=validateArchive(input);
  for(const gift of archive.gifts)if(gift.image)await assertImageDecodes(gift.image);
  return archive;
}
export function assertEmbeddedGLB(buffer:ArrayBuffer) {
  if(buffer.byteLength<20) throw new Error('这不是有效的 GLB 模型。');
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw new Error('请使用有效的 GLB 2.0 模型。');
  let offset=12;let jsonText:string|undefined;let chunkIndex=0;
  while(offset<buffer.byteLength){
    if(offset+8>buffer.byteLength)throw new Error('GLB 文件不完整。');
    const length=view.getUint32(offset,true);const type=view.getUint32(offset+4,true);offset+=8;
    if(length%4!==0||offset+length>buffer.byteLength)throw new Error('GLB 文件不完整。');
    if(chunkIndex===0&&type!==0x4e4f534a)throw new Error('GLB 文件需要以 JSON 模型信息开头。');
    if(type===0x4e4f534a){
      if(chunkIndex!==0||jsonText!==undefined)throw new Error('GLB 包含重复的模型信息区块，无法安全导入。');
      jsonText=new TextDecoder().decode(new Uint8Array(buffer,offset,length)).replace(/[\0\s]+$/,'');
    }
    offset+=length;chunkIndex++;
  }
  if(!jsonText)throw new Error('GLB 模型缺少模型信息。');
  let data:Record<string,unknown>;
  try {data=record(JSON.parse(jsonText));}catch{throw new Error('GLB 模型内容无法读取。');}
  const asset=record(data.asset);
  if(asset.version!=='2.0')throw new Error('请使用 GLB 2.0 模型。');
  const extensions=Array.isArray(data.extensionsRequired)?data.extensionsRequired:[];
  if(extensions.some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(String(x))))throw new Error('请导出不带 Draco、Meshopt 或 KTX2 压缩的 GLB 模型。');
  const inspect=(node:unknown,depth=0)=>{
    if(depth>80)throw new Error('GLB 模型结构过于复杂。');
    if(!node||typeof node!=='object')return;
    for(const [key,value]of Object.entries(node)) {
      if(key==='uri'&&typeof value==='string'&&!value.startsWith('data:'))throw new Error('模型包含外部资源，请将贴图嵌入 GLB 后再导入。');
      inspect(value,depth+1);
    }
  }; inspect(data);
}
export async function readUpload(file:File,kind:'image'|'model'):Promise<string> {
  validateUploadMeta(file,kind);
  const buffer=await file.arrayBuffer();
  if(kind==='model') assertEmbeddedGLB(buffer);
  const mime=kind==='model'?'model/gltf-binary':imageMime(buffer);
  if(!mime)throw new Error('照片内容无法识别，请转换为 PNG、JPEG 或 WebP。');
  const blob=new Blob([buffer],{type:mime});
  if(kind==='image')await assertImageDecodes(blob);
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onerror=()=>reject(new Error('文件读取失败，请重新选择。'));
    reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob);
  });
}
export function downloadBackup(archive:Archive) {
  const blob=new Blob([JSON.stringify(validateArchive(archive),null,2)],{type:'application/json'});
  if(blob.size>MAX_BACKUP_BYTES)throw new Error('备份文件超过 120MB，请移除一些照片或模型后重试。');
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='生日档案.birthday.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
