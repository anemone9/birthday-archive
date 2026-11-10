'use client';

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, LockKeyhole, Trash2, X } from "lucide-react";
import { validateArchive, type Archive } from "@/lib/archive";
import { loadManagedShares, removeManagedShare, saveManagedShare, type ManagedShare } from "@/lib/storage";

type Props = { archive: Archive; onClose: () => void };
type AssetJob = { giftId: string; kind: "image" | "model"; blob: Blob; byteLength: number };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "暂时无法完成，请稍后重试。";
    throw new Error(message);
  }
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

async function buildJobs(archive: Archive): Promise<AssetJob[]> {
  const jobs: AssetJob[] = [];
  if (archive.envelopeBackground) {
    const blob = await (await fetch(archive.envelopeBackground)).blob();
    jobs.push({ giftId: "__envelope__", kind: "image", blob, byteLength: blob.size });
  }
  for (const gift of archive.gifts) {
    if (gift.image) {
      const blob = await (await fetch(gift.image)).blob();
      jobs.push({ giftId: gift.id, kind: "image", blob, byteLength: blob.size });
    }
    if (gift.model) {
      const blob = await (await fetch(gift.model)).blob();
      jobs.push({ giftId: gift.id, kind: "model", blob, byteLength: blob.size });
    }
  }
  return jobs;
}

function shareUrl(id: string) {
  return new URL(`/p/${id}`, window.location.origin).toString();
}

export default function ShareGeneratorDialog({ archive, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"confirm" | "uploading" | "done">("confirm");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [shareUrlValue, setShareUrlValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [managedShares, setManagedShares] = useState<ManagedShare[]>([]);
  const [managedLoadError, setManagedLoadError] = useState("");
  const [managedWarning, setManagedWarning] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [copiedShareId, setCopiedShareId] = useState("");

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
    loadManagedShares().then(setManagedShares).catch(cause => {
      setManagedLoadError(cause instanceof Error ? cause.message : "无法读取本地管理清单。");
    });
    return () => { if (node.open) node.close(); };
  }, []);

  const close = () => {
    if (stage !== "uploading" && !deletingId) dialog.current?.close();
  };

  async function generate() {
    if (stage === "uploading" || deletingId) return;
    setError("");
    setManagedWarning("");
    setAnnouncement("");
    setStage("uploading");
    let shareId = "";
    let token = "";
    let published = false;
    try {
      const cleanArchive = validateArchive(archive);
      const jobs = await buildJobs(cleanArchive);
      setTotal(jobs.length);
      setProgress(0);
      const { envelopeBackground: _envelopeBackground, ...archiveMetadata } = cleanArchive;
      const metadata = {
        ...archiveMetadata,
        hasEnvelopeBackground: Boolean(cleanArchive.envelopeBackground),
        gifts: archiveMetadata.gifts.map(({ image: _image, model: _model, ...gift }) => gift),
      };
      const created = await readJson(await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: metadata, assets: jobs.map(({ giftId, kind, byteLength }) => ({ giftId, kind, byteLength })) }),
        cache: "no-store",
      }));
      if (typeof created.id !== "string" || typeof created.token !== "string") throw new Error("分享页初始化失败，请重试。");
      shareId = created.id;
      token = created.token;

      let cursor = 0;
      const uploadOne = async () => {
        while (true) {
          const index = cursor++;
          if (index >= jobs.length) return;
          const job = jobs[index];
          const response = await fetch(`/api/share/${shareId}/media/${job.giftId}/${job.kind}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": job.blob.type || (job.kind === "model" ? "model/gltf-binary" : "application/octet-stream") },
            body: job.blob,
            cache: "no-store",
          });
          await readJson(response);
          setProgress(value => value + 1);
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, uploadOne));

      let path = "";
      try {
        const response = await fetch(`/api/share/${shareId}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await readJson(response);
        path = typeof result.path === "string" ? result.path : "";
        published = Boolean(path);
      } catch {
        const status = await readJson(await fetch(`/api/share/${shareId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }));
        if (status.ready && typeof status.path === "string") {
          path = status.path;
          published = true;
        } else {
          throw new Error("分享页还没有完成保存，请重试。");
        }
      }
      if (!path) throw new Error("分享页没有返回可用链接，请重试。");

      const managedShare: ManagedShare = {
        id: shareId,
        token,
        title: cleanArchive.title || cleanArchive.brand || "生日档案",
        createdAt: new Date().toISOString(),
      };
      setManagedShares(current => [managedShare, ...current.filter(item => item.id !== shareId)]);
      try {
        await saveManagedShare(managedShare);
      } catch (cause) {
        setManagedWarning(cause instanceof Error ? cause.message : "管理凭证未能保存在此浏览器，请先不要关闭窗口。");
      }
      setShareUrlValue(new URL(path, window.location.origin).toString());
      setStage("done");
      setAnnouncement("只读生日页已生成，可以复制链接分享。管理凭证已保存在当前浏览器。");
    } catch (cause) {
      if (shareId && token && !published) {
        try {
          await fetch(`/api/share/${shareId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
        } catch { /* keep the local archive; the next attempt uses a new share record */ }
      }
      setError(cause instanceof Error ? cause.message : "暂时无法生成分享页，请重试。");
      setStage("confirm");
      setAnnouncement("分享页生成失败，原来的编辑内容仍然保留。");
    }
  }

  async function copyCurrentLink() {
    try {
      await navigator.clipboard.writeText(shareUrlValue);
      setCopied(true);
      setAnnouncement("链接已复制。");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("自动复制没有成功，请选中链接后手动复制。");
    }
  }

  async function copyManagedLink(share: ManagedShare) {
    try {
      await navigator.clipboard.writeText(shareUrl(share.id));
      setCopiedShareId(share.id);
      setAnnouncement("分享链接已复制。");
      window.setTimeout(() => setCopiedShareId(current => current === share.id ? "" : current), 1800);
    } catch {
      setDeleteErrors(current => ({ ...current, [share.id]: "复制失败，请打开页面后从地址栏复制。" }));
    }
  }

  async function deleteManagedShare(share: ManagedShare) {
    if (confirmDeleteId !== share.id) {
      setConfirmDeleteId(share.id);
      setDeleteErrors(current => ({ ...current, [share.id]: "" }));
      return;
    }
    setDeletingId(share.id);
    setDeleteErrors(current => ({ ...current, [share.id]: "" }));
    try {
      const response = await fetch(`/api/share/${share.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${share.token}` },
        cache: "no-store",
      });
      if (response.status !== 204) await readJson(response);
      setManagedShares(current => current.filter(item => item.id !== share.id));
      setConfirmDeleteId("");
      if (shareUrlValue === shareUrl(share.id)) {
        setShareUrlValue("");
        setStage("confirm");
      }
      setAnnouncement("分享页面已删除，原链接已失效。");
      try {
        await removeManagedShare(share.id);
      } catch (cause) {
        setManagedWarning(cause instanceof Error ? cause.message : "服务器已删除页面，但本地管理记录没有清除。");
      }
    } catch (cause) {
      setDeleteErrors(current => ({ ...current, [share.id]: cause instanceof Error ? cause.message : "删除失败，请稍后重试。" }));
    } finally {
      setDeletingId("");
    }
  }

  return <dialog ref={dialog} className="share-dialog" aria-labelledby="share-dialog-title"
    onCancel={event => { if (stage === "uploading" || deletingId) event.preventDefault(); }} onClose={onClose}>
    <div className="share-dialog-inner">
      <button type="button" className="share-dialog-close icon-button" onClick={close} disabled={stage === "uploading" || Boolean(deletingId)} aria-label="关闭"><X size={18}/></button>
      <div className="share-dialog-icon"><LockKeyhole size={21}/></div>
      <p className="eyebrow">A little page of your own</p>
      <h2 id="share-dialog-title">{stage === "done" ? "这份心意，已经准备好了" : "生成一份只读生日页"}</h2>
      {stage === "done" ? <>
        <p className="share-dialog-copy">把链接发给收件人，打开后可以浏览信件、礼物和最后的烟花庆祝。</p>
        <label className="share-link-label" htmlFor="share-link">专属分享链接</label>
        <div className="share-link-row"><input id="share-link" readOnly value={shareUrlValue} onFocus={event => event.currentTarget.select()}/><button type="button" className="primary-button compact" onClick={copyCurrentLink}><Copy size={15}/>{copied ? "已复制" : "复制"}</button></div>
        {error&&<p className="share-dialog-error" role="alert">{error}</p>}
        <button type="button" className="secondary-button share-done-button" onClick={close}><Check size={16}/>完成</button>
      </> : stage === "uploading" ? <>
        <p className="share-dialog-copy">正在保存信件、礼物和背景图片。保存完成后，这个页面只能查看，不能编辑。</p>
        {total > 0 ? <div className="share-progress"><div className="share-progress-label"><span>正在上传照片、模型和背景</span><span>{progress} / {total}</span></div><progress max={total} value={progress}/></div> : <p className="share-progress-note"><LoaderCircle className="share-spinner" size={16}/>正在保存文字内容…</p>}
        <p className="share-dialog-privacy">请保持此页面打开，完成后即可复制专属链接。</p>
      </> : <>
        <p className="share-dialog-copy">生成后会得到一条独立链接。收到链接的人可以查看这封信和全部礼物，但不能修改内容。</p>
        <div className="share-dialog-notice"><strong>生成前请确认</strong><span>信件、礼物描述、照片、信封背景和 3D 模型会保存到网站。任何拿到分享链接的人都能查看。管理凭证会保存在当前浏览器，你之后可以在这里删除页面并撤销链接。</span></div>
        {error&&<p className="share-dialog-error" role="alert">{error}</p>}
        <div className="share-dialog-actions"><button type="button" className="secondary-button" onClick={close}>再检查一下</button><button type="button" className="primary-button" onClick={generate}>确认并生成<Copy size={15}/></button></div>
      </>}

      {stage !== "uploading" && <section className="share-managed" aria-labelledby="share-managed-title">
        <div className="share-managed-heading"><h3 id="share-managed-title">已生成的分享页</h3><span>{managedShares.length}</span></div>
        <p className="share-managed-note">管理凭证只保存在此浏览器。清除浏览器数据或更换设备后，无法从这里撤销链接。</p>
        {managedLoadError&&<p className="share-dialog-error" role="alert">{managedLoadError}</p>}
        {managedWarning&&<p className="share-dialog-error" role="alert">{managedWarning}</p>}
        {managedShares.length ? <div className="share-managed-list">
          {managedShares.map(share=><article className="share-managed-card" key={share.id}>
            <div className="share-managed-card-heading"><div><strong>{share.title||"生日档案"}</strong><span>生成于 {new Date(share.createdAt).toLocaleString("zh-CN")}</span></div><a className="text-button small" href={`/p/${share.id}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/>打开</a></div>
            <div className="share-managed-card-actions"><button type="button" className="text-button small" onClick={()=>copyManagedLink(share)} disabled={Boolean(deletingId)}><Copy size={14}/>{copiedShareId===share.id?"已复制":"复制链接"}</button>{confirmDeleteId===share.id ? <><span className="share-delete-confirm-copy">删除后链接和已上传内容都会失效。</span><button type="button" className="text-button small" onClick={()=>setConfirmDeleteId("")} disabled={Boolean(deletingId)}>取消</button><button type="button" className="text-button small share-delete-confirm" onClick={()=>deleteManagedShare(share)} disabled={Boolean(deletingId)}>{deletingId===share.id?<LoaderCircle className="share-spinner" size={14}/>:<Trash2 size={14}/>}确认删除</button></> : <button type="button" className="text-button small share-delete-trigger" onClick={()=>deleteManagedShare(share)} disabled={Boolean(deletingId)}><Trash2 size={14}/>删除</button>}</div>
            {deleteErrors[share.id]&&<p className="share-dialog-error" role="alert">{deleteErrors[share.id]}</p>}
          </article>)}
        </div> : !managedLoadError ? <p className="share-managed-empty">这里还没有可管理的页面。功能更新前生成的页面未保存删除凭证，因此不会显示在清单中。</p> : null}
      </section>}
      <p className="share-dialog-live sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  </dialog>;
}
