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

test("pdfText 能从无压缩的内容流里抓到文字", () => {
  const content = "BT /F1 12 Tf 20 100 Td (Sample PDF text content for extraction test.) Tj ET";
  const pdf = Buffer.from(
    `%PDF-1.4\n4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj\ntrailer<</Root 1 0 R>>\n`,
    "latin1",
  );
  const text = pdfText(pdf);
  assert.match(text, /Sample PDF text content/);
});

test("extractDocument 按扩展名分派，未知类型返回 unknown", () => {
  assert.equal(extractDocument("a.md", Buffer.from("# hi")).kind, "text");
  assert.equal(extractDocument("a.png", Buffer.from("x")).kind, "image");
  assert.equal(extractDocument("a.zip", Buffer.from("x")).kind, "unknown");
  assert.equal(extractDocument("a.xlsx", Buffer.from("x")).kind, "unknown");
});
