import type { ReactNode } from "react";

/** 极简 Markdown 渲染：标题 / 列表 / 行内代码 / 粗体（够讲义用，不引依赖） */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-[#efece5] px-1 py-[1px] font-mono text-[10.5px] text-ink"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = m.index + token.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function NoteMarkdown({
  content,
  onRewrite,
  pendingHeading,
}: {
  content: string;
  /** 传入后在每个三级标题旁显示「重写」 */
  onRewrite?: (heading: string) => void;
  /** 正在重写的小节标题，显示重写中并禁用按钮 */
  pendingHeading?: string | null;
}) {
  const lines = content.split("\n");
  const out: ReactNode[] = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const raw = lines[idx]!;
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push(<div key={`gap-${idx}`} className="h-2" />);
      continue;
    }

    // 标题：越深越小
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!.replace(/\*\*/g, "");
      const cls =
        level === 1
          ? "mt-3 mb-1 text-[13.5px] font-semibold text-ink first:mt-0"
          : level === 2
            ? "mt-5 mb-2 border-b border-line-2 pb-1.5 text-[13px] font-semibold text-ink"
            : "mt-3.5 mb-1 text-[12px] font-semibold text-ink-2";
      out.push(
        <div key={`h-${idx}`} className="group flex items-center gap-2">
          <p className={`${cls} flex-1`}>{text}</p>
          {level === 3 && onRewrite ? (
            <button
              type="button"
              disabled={pendingHeading === line.trim()}
              onClick={() => onRewrite(line.trim())}
              className={`shrink-0 rounded-full border px-2 py-[1px] text-[9.5px] transition-colors ${
                pendingHeading === line.trim()
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-ink-3 hover:border-accent hover:text-accent"
              } disabled:opacity-100`}
            >
              {pendingHeading === line.trim() ? "重写中…" : "重写"}
            </button>
          ) : null}
        </div>,
      );
      continue;
    }

    // 无序列表
    const bullet = line.match(/^([-*•])\s+(.*)$/);
    if (bullet) {
      let body = bullet[2]!;
      const labeled = body.match(/^([^：:]{1,6})[：:]\s*(.+)$/);

      // 同一标签的连续条目（多个「例子」/「关键点」）合并成一行，避免碎片化换行
      if (labeled) {
        const label = labeled[1]!;
        let merged = labeled[2]!;
        while (idx + 1 < lines.length) {
          const next = lines[idx + 1]!.trim();
          const nb = next.match(/^([-*•])\s+(.*)$/);
          if (!nb) break;
          const nlab = nb[2]!.match(/^([^：:]{1,6})[：:]\s*(.+)$/);
          if (!nlab || nlab[1] !== label) break;
          merged = `${merged.replace(/[。；;]\s*$/, "")}，${nlab[2]!.trim()}`;
          idx += 1;
        }
        body = `${label}：${merged}`;
      }

      const finalLabeled = body.match(/^([^：:]{1,6})[：:]\s*(.+)$/);
      out.push(
        <div key={`ul-${idx}`} className="mt-1.5 flex gap-2.5 pl-0.5">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#c6c0b6]" />
          {finalLabeled ? (
            <p className="flex-1 leading-[1.85]">
              <span className="mr-1.5 text-[10.5px] text-ink-3">{finalLabeled[1]}</span>
              {inline(finalLabeled[2]!, `u${idx}`)}
            </p>
          ) : (
            <p className="flex-1 leading-[1.85]">{inline(body, `u${idx}`)}</p>
          )}
        </div>,
      );
      continue;
    }

    // 有序列表
    const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      out.push(
        <div key={`ol-${idx}`} className="mt-1 flex gap-2 pl-1">
          <span className="w-4 shrink-0 text-right tabular-nums text-ink-3">{ordered[1]}.</span>
          <p className="flex-1 leading-[1.75]">{inline(ordered[2]!, `o${idx}`)}</p>
        </div>,
      );
      continue;
    }

    // 引用
    if (line.startsWith(">")) {
      out.push(
        <p key={`q-${idx}`} className="my-1 border-l-2 border-line pl-2.5 text-ink-3">
          {inline(line.replace(/^>\s?/, ""), `q${idx}`)}
        </p>,
      );
      continue;
    }

    out.push(
      <p key={`p-${idx}`} className="mt-1.5 leading-[1.75]">
        {inline(line, `p${idx}`)}
      </p>,
    );
  }

  return <div className="max-w-[68ch] text-[12.5px] leading-[1.9] text-ink-2">{out}</div>;
}
