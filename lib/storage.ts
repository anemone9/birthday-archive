import type { Archive } from './archive';
export type StoredDraft={archive:Archive;revision:number};
const DB='birthday-archive-generator-v1';
const DB_VERSION=2;
const SHARE_STORE='managed-shares';
export type ManagedShare={id:string;token:string;title:string;createdAt:string};
const SHARE_ID=/^[A-Za-z0-9_-]{32}$/;
const SHARE_TOKEN=/^[A-Za-z0-9_-]{40,50}$/;
function openDB():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts');
      if(!db.objectStoreNames.contains(SHARE_STORE))db.createObjectStore(SHARE_STORE);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('浏览器暂时无法保存内容，你仍然可以编辑并导出备份。'));
    request.onblocked=()=>reject(new Error('请关闭其他生日档案页面后重试。'));
  });
}
export async function loadDraft():Promise<StoredDraft|undefined> {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts','readonly');const request=tx.objectStore('drafts').get('mine');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法读取保存的内容，可尝试导入备份。'));tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();
  });
}
export async function saveDraft(archive:Archive,expectedRevision:number):Promise<number> {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite');const store=tx.objectStore('drafts');const request=store.get('mine');let revision=expectedRevision;
    request.onsuccess=()=>{
      if((request.result?.revision??0)!==expectedRevision){tx.abort();reject(new Error('另一个页面更新了档案。请先导出这份编辑作为备份，再刷新页面或重新导入。'));return;}
      revision=expectedRevision+1;store.put({archive,revision},'mine');
    };
    tx.oncomplete=()=>{db.close();resolve(revision);};
    tx.onerror=()=>reject(new Error('保存失败，浏览器空间可能不足。编辑仍然保留，请导出备份。'));
    tx.onabort=()=>{db.close();reject(new Error('保存没有完成，请保留编辑并导出备份。'));};
  });
}

function isManagedShare(value:unknown):value is ManagedShare {
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return typeof row.id==='string'&&SHARE_ID.test(row.id)
    &&typeof row.token==='string'&&SHARE_TOKEN.test(row.token)
    &&typeof row.title==='string'&&row.title.length<=100
    &&typeof row.createdAt==='string'&&Number.isFinite(Date.parse(row.createdAt));
}

export async function loadManagedShares():Promise<ManagedShare[]> {
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SHARE_STORE,'readonly');
    const request=tx.objectStore(SHARE_STORE).getAll();
    request.onsuccess=()=>resolve((request.result as unknown[]).filter(isManagedShare).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
    request.onerror=()=>reject(new Error('无法读取分享页管理记录。'));
    tx.oncomplete=()=>db.close();
    tx.onabort=()=>{db.close();reject(new Error('无法读取分享页管理记录。'));};
  });
}

export async function saveManagedShare(share:ManagedShare):Promise<void> {
  if(!isManagedShare(share))throw new Error('分享页管理凭证无效。');
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SHARE_STORE,'readwrite');
    tx.objectStore(SHARE_STORE).put(share,share.id);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(new Error('分享页已生成，但管理凭证未能保存在此浏览器。请先不要关闭窗口。'));};
    tx.onabort=()=>{db.close();reject(new Error('分享页已生成，但管理凭证未能保存在此浏览器。请先不要关闭窗口。'));};
  });
}

export async function removeManagedShare(id:string):Promise<void> {
  if(!SHARE_ID.test(id))throw new Error('分享页编号无效。');
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SHARE_STORE,'readwrite');
    tx.objectStore(SHARE_STORE).delete(id);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(new Error('页面已删除，但本地管理记录未能清除。'));};
    tx.onabort=()=>{db.close();reject(new Error('页面已删除，但本地管理记录未能清除。'));};
  });
}
