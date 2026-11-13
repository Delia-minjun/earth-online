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
 * .pdf：只做「能拿到文字」的尽力提取——解压 FlateDecode 流后抓 Tj/TJ 里的字符串。
 * 扫描版 PDF（整页是图片）拿不到文字，会返回空串，由调用方提示改用截图 OCR。
 */
export function pdfText(buf: Buffer): string {
  const chunks: string[] = [];
  const raw = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const slice = buf.subarray(start, end);
    let data: Buffer | null = null;
    try {
      data = inflateRawSync(slice);
    } catch {
      try {
        // 有些流带 zlib 头（78 9c），inflateRaw 会失败
        data = inflateSync(slice);
      } catch {
        // 没压缩的流（无 /Filter）直接用原文
        data = slice;
      }
    }
    if (!data) continue;
    const text = data.toString("latin1");
    // 抓 (...) Tj 与 [...] TJ
    for (const hit of text.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
      const s = hit[0]
        .slice(1, -1)
        .replace(/\\([nrtbf()\\])/g, (_x, c: string) =>
          c === "n" ? "\n" : c === "r" ? "\n" : c === "t" ? "\t" : c,
        )
        .replace(/\\([0-7]{1,3})/g, (_x, o: string) => String.fromCharCode(parseInt(o, 8)));
      if (s.trim()) chunks.push(s);
    }
  }
  const text = chunks.join("").replace(/[ \t]{2,}/g, " ").trim();
  // PDF 里中文常被拆成乱码，这里只保留有意义的可打印结果
  return text.length > 40 ? text : "";
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

export function extractDocument(
  filename: string,
  buf: Buffer,
): { kind: ExtractedKind; text: string } {
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
      return { kind: "pdf", text: pdfText(buf) };
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
