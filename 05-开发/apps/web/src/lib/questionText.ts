/**
 * 把「题干 + A) … B) …」揉成一行的题目拆开。
 * 只在选项字母按 A、B、C 递增出现时才算，避免把 C4H10 这类化学式误判。
 */
export function splitQuestion(text: string): { stem: string; options: string[] } {
  const letters = "ABCDEFGH".split("");
  const marks: { letter: string; start: number; end: number }[] = [];
  let cursor = 0;

  for (const letter of letters) {
    const re = new RegExp(`(?:^|[\\s（(])${letter}\\s*[)）.、．:：]\\s*`);
    const slice = text.slice(cursor);
    const m = re.exec(slice);
    if (!m) break;
    const start = cursor + m.index;
    const end = start + m[0].length;
    marks.push({ letter, start, end });
    cursor = end;
  }

  if (marks.length < 2) return { stem: text.trim(), options: [] };

  const stem = text.slice(0, marks[0]!.start).trim();
  const options = marks.map((m, i) => {
    const nextStart = i + 1 < marks.length ? marks[i + 1]!.start : text.length;
    return text.slice(m.end, nextStart).trim().replace(/[；;]\s*$/, "");
  });

  return { stem, options };
}


/** 从"答案与解析"里取出正确选项字母：B) / B. / B、/ 答案：B / （B） */
export function correctOptionLetter(answer: string): string | null {
  const m = answer
    .replace(/^\s*(答案|正确答案|Answer|Correct answer)\s*[:：]?\s*/i, "")
    .trim()
    .match(/^[（(]?([A-H])(?:[)）.、．:：\s,，]|$)/i);
  return m?.[1]?.toUpperCase() ?? null;
}
