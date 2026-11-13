import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { extractDocument, pdfText, plainText, readZip } from "../src/lib/office.ts";

/** 拼一个只有单个条目的最小 zip，用来验证 readZip */
function miniZip(name: string, content: string): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const data = deflateRawSync(Buffer.from(content, "utf8"));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(Buffer.byteLength(content), 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(Buffer.byteLength(content), 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // local header offset

  const body = Buffer.concat([local, nameBuf, data]);
  const cdOffset = body.length;
  const cd = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([body, cd, eocd]);
}


/** 拼一个结构合法（带 xref）的最小 PDF，pdf.js 只认这种 */
function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 20 700 Td (${text}) Tj ET`;
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(out.length);
    out += o;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

test("readZip 能解出 deflate 压缩的条目", () => {
  const zip = miniZip("word/document.xml", "<w:p><w:r><w:t>你好</w:t></w:r></w:p>");
  const files = readZip(zip);
  assert.ok(files.has("word/document.xml"));
  assert.match(files.get("word/document.xml")!.toString("utf8"), /你好/);
});

test("plainText 优先 UTF-8，坏字节回退不抛错", () => {
  assert.equal(plainText(Buffer.from("中文 ok", "utf8")), "中文 ok");
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); // “中文”的 GBK 编码
  assert.ok(plainText(gbk).length > 0);
});

test("pdfText 能从 PDF 里抽出文字（pdf.js）", async () => {
  const text = await pdfText(minimalPdf("Sample PDF text content for extraction test."));
  assert.match(text, /Sample PDF text content/);
});

test("extractDocument 按扩展名分派，未知类型返回 unknown", async () => {
  assert.equal((await extractDocument("a.md", Buffer.from("# hi"))).kind, "text");
  assert.equal((await extractDocument("a.png", Buffer.from("x"))).kind, "image");
  assert.equal((await extractDocument("a.zip", Buffer.from("x"))).kind, "unknown");
  assert.equal((await extractDocument("a.xlsx", Buffer.from("x"))).kind, "unknown");
});
