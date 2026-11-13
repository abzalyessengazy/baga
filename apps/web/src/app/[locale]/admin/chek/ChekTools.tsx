"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Labels = { download: string; downloadAll: string; saving: string; saveFailed: string; copy: string; copied: string; fullView: string; fullViewAll: string; phoneHint: string };
type Ctx = { labels: Labels; run: (nodes: HTMLElement[]) => Promise<void>; busy: boolean; canCapture: boolean };
const ToolsCtx = createContext<Ctx | null>(null);

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Saves slides as PNGs from what this tab shows. The product photos are on Kaspi's image server, which lets only
 * kaspi.kz read them from a script, so a page cannot draw them into a picture, and our server never downloads them
 * (CLAUDE.md rule 6). Instead the owner shares this tab once (the browser asks), each slide is shown on its own at
 * the largest size that fits, and that frame is cut out and saved at 1080 px wide.
 */
async function captureSlides(nodes: HTMLElement[], prefix: string): Promise<boolean> {
  const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (o: object) => Promise<MediaStream> };
  if (!md?.getDisplayMedia) return false;
  let stream: MediaStream;
  try {
    stream = await md.getDisplayMedia({ video: { displaySurface: "browser", frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" });
  } catch {
    return false;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  const stage = document.createElement("div");
  stage.className = "chek-stage";
  document.body.append(stage);
  try {
    for (const node of nodes) {
      const w = node.offsetWidth, h = node.offsetHeight;
      const { clone, s } = stageSlide(stage, node);
      await Promise.all([...clone.querySelectorAll("img")].map((i) => i.decode().catch(() => undefined)));
      await frame();
      await sleep(600); // let the captured stream catch up with the new picture
      const k = video.videoWidth / innerWidth; // stream pixels per CSS pixel
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(video, 0, 0, w * s * k, h * s * k, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (!blob) return false;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${prefix}-${node.dataset.slide ?? "slide"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    return true;
  } finally {
    stage.remove();
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Places a copy of the slide on a full-screen stage, scaled to fit, top left. */
function stageSlide(stage: HTMLElement, node: HTMLElement) {
  const clone = node.cloneNode(true) as HTMLElement;
  const s = Math.min(innerWidth / node.offsetWidth, innerHeight / node.offsetHeight);
  clone.style.transform = `scale(${s})`;
  clone.style.transformOrigin = "0 0";
  stage.replaceChildren(clone);
  return { clone, s };
}

/**
 * Phones cannot share a tab (iOS has no tab capture), so there the slides open full screen one by one for a
 * screenshot: a tap shows the next slide, a tap on the last one closes the view.
 */
function viewSlides(nodes: HTMLElement[]) {
  const stage = document.createElement("div");
  stage.className = "chek-stage chek-view-only";
  let i = 0;
  const show = () => stageSlide(stage, nodes[i]!);
  stage.addEventListener("click", () => { i += 1; if (i < nodes.length) show(); else stage.remove(); });
  document.body.append(stage);
  show();
}

/** The slide list with a download button per slide and for all, and the caption and links with copy buttons. */
export function ChekTools({ labels, prefix, texts, children }: { labels: Labels; prefix: string; texts: { title: string; text: string }[]; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  // Known only in the browser: decided after the first render so server and client markup match.
  const [canCapture, setCanCapture] = useState(true);
  useEffect(() => setCanCapture(typeof navigator.mediaDevices?.getDisplayMedia === "function"), []);
  const run = async (nodes: HTMLElement[]) => {
    if (busy || !nodes.length) return;
    if (!canCapture) return viewSlides(nodes);
    setBusy(true);
    setFailed(false);
    try {
      if (!(await captureSlides(nodes, prefix))) setFailed(true);
    } catch (e) {
      console.error("[chek] capture", e);
      setFailed(true);
    }
    setBusy(false);
  };
  const all = () => run([...(list.current?.querySelectorAll<HTMLElement>("[data-slide]") ?? [])]);
  return (
    <ToolsCtx.Provider value={{ labels, run, busy, canCapture }}>
      {!canCapture && <p>{labels.phoneHint}</p>}
      <p><button type="button" className="btn" onClick={all} disabled={busy}>{busy ? labels.saving : canCapture ? labels.downloadAll : labels.fullViewAll}</button></p>
      {failed && <p className="paste-error" role="alert">{labels.saveFailed}</p>}
      <div className="chek-list" ref={list}>{children}</div>
      {texts.map((x) => <CopyBlock key={x.title} title={x.title} text={x.text} labels={labels} />)}
    </ToolsCtx.Provider>
  );
}

/** A slide shown at 30% of its size, with its own download button. */
export function SlideFrame({ label, story, children }: { label: string; story?: boolean; children: ReactNode }) {
  const ctx = useContext(ToolsCtx)!;
  const box = useRef<HTMLDivElement>(null);
  const go = () => {
    const node = box.current?.querySelector<HTMLElement>("[data-slide]");
    if (node) void ctx.run([node]);
  };
  return (
    <figure className={story ? "chek-frame chek-frame-story" : "chek-frame"}>
      <div className="chek-view"><div className="chek-scale" ref={box}>{children}</div></div>
      <figcaption><span>{label}</span><button type="button" className="btn btn-ghost" onClick={go} disabled={ctx.busy}>{ctx.busy ? ctx.labels.saving : ctx.canCapture ? ctx.labels.download : ctx.labels.fullView}</button></figcaption>
    </figure>
  );
}

function CopyBlock({ title, text, labels }: { title: string; text: string; labels: Labels }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { /* the text stays selectable */ }
  };
  return (
    <section className="chek-copy">
      <h2>{title}</h2>
      <textarea readOnly value={text} rows={Math.min(24, text.split("\n").length + 1)} />
      <button type="button" className="btn" onClick={copy}>{done ? labels.copied : labels.copy}</button>
    </section>
  );
}
