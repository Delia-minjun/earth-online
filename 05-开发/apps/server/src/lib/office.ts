import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * 极简 ZIP 读取：docx / pptx 都是 zip 包，只需要「解出条目」这一件事，
 * 不值得为此引入第三方依赖。支持 stored(0) 与 deflate(8) 两种压缩方式。
 */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // 找 EOCD（从尾部往前扫）
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 66_000; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 zip 文件");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // 中央目录起始偏移

  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // 读本地头拿真实数据起点
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    try {
      if (method === 0) out.set(name, Buffer.from(raw));
      else if (method === 8) out.set(name, inflateRawSync(raw));
    } catch {
      /* 单个条目坏了就跳过，不影响其它 */
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** XML → 纯文本：段落/换行转 \n，其余标签去掉，解码常见实体 */
function xmlToText(xml: string): string {
  return xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<a:p>/g, "\n<a:p>")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<a:br\s*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** .docx：正文在 word/document.xml */
export function docxText(buf: Buffer): string {
  const files = readZip(buf);
  const doc = files.get("word/document.xml");
  if (!doc) throw new Error("docx 里找不到正文");
  return xmlToText(doc.toString("utf8"));
}

/** .pptx：每页在 ppt/slides/slideN.xml，按页码排序拼接 */
export function pptxText(buf: Buffer): string {
  const files = readZip(buf);
  const slides = [...files.entries()]
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a[0].match(/(\d+)/)?.[1] ?? 0);
      const nb = Number(b[0].match(/(\d+)/)?.[1] ?? 0);
      return na - nb;
    });
  if (slides.length === 0) throw new Error("pptx 里找不到幻灯片");
  return slides
    .map(([name, data], i) => {
      const no = Number(name.match(/(\d+)/)?.[1] ?? i + 1);
      return `【第 ${no} 页】\n${xmlToText(data.toString("utf8"))}`;
    })
    .join("\n\n");
}

/**
 * .pdf：用 pdf.js（legacy build，随仓库自带）抽取文字层。
 * 有 ToUnicode 的 PDF（Word/LaTeX 导出的）能拿到正确文字；
 * 扫描件没有文字层，返回空串，由调用方提示改用截图 OCR。
 */
async function loadPdfjs(): Promise<typeof import("../../vendor/pdfjs/pdf.mjs")> {
  // 依次尝试若干相对位置：源码目录、打包后的 dist 目录
  const candidates = [
    new URL("../../vendor/pdfjs/pdf.mjs", import.meta.url),
    new URL("../vendor/pdfjs/pdf.mjs", import.meta.url),
    new URL("./vendor/pdfjs/pdf.mjs", import.meta.url),
  ];
  let lastErr: unknown = null;
  for (const url of candidates) {
    try {
      const mod = (await import(url.href)) as typeof import("../../vendor/pdfjs/pdf.mjs");
      const worker = new URL("pdf.worker.mjs", url);
      mod.GlobalWorkerOptions.workerSrc = worker.href;
      return mod;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("pdf.js 加载失败");
}

const PDF_MAX_PAGES = 60;
const PDF_MAX_CHARS = 200_000;

export async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    isEvalSupported: false,
  }).promise;

  try {
    const pages = Math.min(doc.numPages, PDF_MAX_PAGES);
    const parts: string[] = [];
    let total = 0;
    for (let i = 1; i <= pages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      page.cleanup();
      if (line) parts.push(`【第 ${i} 页】\n${line}`);
      total += line.length;
      if (total > PDF_MAX_CHARS) break;
    }
    return parts.join("\n\n").slice(0, PDF_MAX_CHARS).trim();
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

/** 纯文本：优先 UTF-8，失败退回 GBK（Excel/记事本导出的中文常见） */
export function plainText(buf: Buffer): string {
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("gbk").decode(buf);
  } catch {
    return utf8;
  }
}

export type ExtractedKind = "text" | "docx" | "pptx" | "pdf" | "image" | "unknown";

export async function extractDocument(
  filename: string,
  buf: Buffer,
): Promise<{ kind: ExtractedKind; text: string }> {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  switch (ext) {
    case "md":
    case "markdown":
    case "txt":
      return { kind: "text", text: plainText(buf) };
    case "docx":
      return { kind: "docx", text: docxText(buf) };
    case "pptx":
      return { kind: "pptx", text: pptxText(buf) };
    case "pdf":
      return { kind: "pdf", text: await pdfText(buf) };
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
      return { kind: "image", text: "" };
    default:
      return { kind: "unknown", text: "" };
  }
}
