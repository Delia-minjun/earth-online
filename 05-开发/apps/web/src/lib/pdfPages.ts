/**
 * 在浏览器里把 PDF 逐页渲染成图片。
 * 用途：PDF 没有文字层（扫描件）或文字层是乱码时，交给视觉模型「看图」，
 * 这样能像 agent 一样直接读页面内容，而不受 PDF 字体编码的限制。
 */

type Pdfjs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(p: { scale: number }): { width: number; height: number };
        render(p: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
      }>;
      destroy(): Promise<void>;
    }>;
  };
};

let cached: Promise<Pdfjs> | null = null;

async function loadPdfjs(): Promise<Pdfjs> {
  if (!cached) {
    cached = (async () => {
      // 用变量传入，避免 Vite/TS 尝试打包或解析这个运行时路径
      const url = "/pdfjs/pdf.mjs";
      const mod = (await import(/* @vite-ignore */ url)) as Pdfjs;
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
      return mod;
    })();
  }
  return cached;
}

export interface RenderOptions {
  /** 最多渲染多少页，避免一个 200 页的 PDF 把额度和时间烧光 */
  maxPages?: number;
  /** 输出宽度上限（像素），太大浪费带宽 */
  maxWidth?: number;
  quality?: number;
}

/** 返回每页的 JPEG base64（不含 data: 前缀） */
export async function renderPdfPages(file: File, opts: RenderOptions = {}): Promise<string[]> {
  const maxPages = opts.maxPages ?? 10;
  const maxWidth = opts.maxWidth ?? 1400;
  const quality = opts.quality ?? 0.82;

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const out: string[] = [];
  try {
    const count = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= count; i += 1) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxWidth / base.width);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      // 白底，避免透明区域变黑
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const url = canvas.toDataURL("image/jpeg", quality);
      out.push(url.slice(url.indexOf(",") + 1));
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }
  return out;
}

/** PDF 总页数（只读元信息，不渲染） */
export async function pdfPageCount(file: File): Promise<number> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const n = doc.numPages;
  await doc.destroy().catch(() => undefined);
  return n;
}
