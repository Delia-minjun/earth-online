/** 从文件名猜章节号：Ch3 / chapter 3 / 第3章 / L5 / Lecture 5 / 3-4 */
export function guessChapter(filename: string): string | null {
  const name = filename.replace(/\.[^.]+$/, "");

  // 第3章 / 第 3 章 / 第3-4章
  const cn = name.match(/第\s*([0-9]+(?:\s*[-–~]\s*[0-9]+)?)\s*[章讲课]/);
  if (cn?.[1]) return cn[1].replace(/\s+/g, "").replace(/[–~]/g, "-");

  // Ch3 / Chapter 3 / chapter3
  const en = name.match(/\b(?:ch|chap|chapter)\s*([0-9]+(?:\s*([-–~])\s*[0-9]+)?)/i);
  if (en?.[1]) return en[1].replace(/\s+/g, "").replace(/[–~]/g, "-");

  // L5 / Lec5 / Lecture 5
  const lec = name.match(/\b(?:l|lec|lecture)\s*([0-9]+)/i);
  if (lec?.[1]) return `L${lec[1]}`;

  return null;
}

/** 章节排序键：先按前导数字，L 开头的排后面 */
export function chapterSortKey(chapter: string | null): number {
  if (!chapter) return Number.MAX_SAFE_INTEGER;
  const m = chapter.match(/\d+/);
  if (m) return Number(m[0]);
  return Number.MAX_SAFE_INTEGER - 1;
}
