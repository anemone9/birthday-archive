import type { Archive } from './archive';
export type StoredDraft={archive:Archive;revision:number};
const DB='birthday-archive-generator-v1';
function openDB():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
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
