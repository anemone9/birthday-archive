'use client';

import { useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { validateArchive, type Archive } from "@/lib/archive";

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

export default function ShareGeneratorDialog({ archive, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"confirm" | "uploading" | "done">("confirm");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
    return () => { if (node.open) node.close(); };
  }, []);

  const close = () => { if (stage !== "uploading") dialog.current?.close(); };

  async function generate() {
    if (stage === "uploading") return;
    setError("");
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
      const metadata = {
        ...cleanArchive,
        gifts: cleanArchive.gifts.map(({ image: _image, model: _model, ...gift }) => gift),
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
      setShareUrl(new URL(path, window.location.origin).toString());
      setStage("done");
      setAnnouncement("只读生日页已生成，可以复制链接分享。");
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setAnnouncement("链接已复制。");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("自动复制没有成功，请选中链接后手动复制。");
    }
  }

  return <dialog ref={dialog} className="share-dialog" aria-labelledby="share-dialog-title"
    onCancel={event => { if (stage === "uploading") event.preventDefault(); }} onClose={onClose}>
    <div className="share-dialog-inner">
      <button type="button" className="share-dialog-close icon-button" onClick={close} disabled={stage === "uploading"} aria-label="关闭"><X size={18}/></button>
      <div className="share-dialog-icon"><LockKeyhole size={21}/></div>
      <p className="eyebrow">A little page of your own</p>
      <h2 id="share-dialog-title">{stage === "done" ? "这份心意，已经准备好了" : "生成一份只读生日页"}</h2>
      {stage === "done" ? <>
        <p className="share-dialog-copy">把链接发给收件人，打开后可以浏览信件、礼物和最后的烟花庆祝。</p>
        <label className="share-link-label" htmlFor="share-link">专属分享链接</label>
        <div className="share-link-row"><input id="share-link" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()}/><button type="button" className="primary-button compact" onClick={copyLink}><Copy size={15}/>{copied ? "已复制" : "复制"}</button></div>
        {error&&<p className="share-dialog-error" role="alert">{error}</p>}
        <button type="button" className="secondary-button share-done-button" onClick={close}><Check size={16}/>完成</button>
      </> : stage === "uploading" ? <>
        <p className="share-dialog-copy">正在保存信件与礼物。保存完成后，这个页面只能查看，不能编辑。</p>
        {total > 0 ? <div className="share-progress"><div className="share-progress-label"><span>正在上传照片与模型</span><span>{progress} / {total}</span></div><progress max={total} value={progress}/></div> : <p className="share-progress-note"><LoaderCircle className="share-spinner" size={16}/>正在保存文字内容…</p>}
        <p className="share-dialog-privacy">请保持此页面打开，完成后即可复制专属链接。</p>
      </> : <>
        <p className="share-dialog-copy">生成后会得到一条独立链接。收到链接的人可以查看这封信和全部礼物，但不能修改内容。</p>
        <div className="share-dialog-notice"><strong>生成前请确认</strong><span>信件、礼物描述、照片和 3D 模型会保存到本网站，分享链接会持续有效。任何拿到链接的人都能查看，请不要放入不想公开的内容。</span></div>
        {error&&<p className="share-dialog-error" role="alert">{error}</p>}
        <div className="share-dialog-actions"><button type="button" className="secondary-button" onClick={close}>再检查一下</button><button type="button" className="primary-button" onClick={generate}>确认并生成<Copy size={15}/></button></div>
      </>}
      <p className="share-dialog-live sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  </dialog>;
}
