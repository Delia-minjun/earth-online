import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type AiConfigInfo } from "../api";
import { Card } from "../components/Card";
import { BudgetCard, CategoriesCard } from "../components/Dictionary";

export function SettingsView() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AiConfigInfo | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState("kimi-latest");
  const [base, setBase] = useState("https://api.moonshot.cn/v1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [models, setModels] = useState<{ all: string[]; vision: string[] } | null>(null);

  /** 常用服务商预设：点一下把 base + 模型填好，Key 仍要自己填 */
  const PRESETS: { key: string; base: string; model: string; vision: boolean }[] = [
    { key: "openai", base: "https://api.openai.com/v1", model: "gpt-4o", vision: true },
    { key: "kimi", base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k-vision-preview", vision: true },
    { key: "deepseek", base: "https://api.deepseek.com", model: "deepseek-flash", vision: true },
    { key: "ollama", base: "http://127.0.0.1:11434/v1", model: "llama3.2-vision", vision: true },
  ];

  const activePreset = PRESETS.find((p) => p.base === base)?.key ?? "custom";

  const load = async () => {
    const next = await api.aiSettings();
    setInfo(next);
    setModel(next.model);
    setBase(next.base);
  };

  useEffect(() => {
    void load().catch((e: Error) => setMessage({ kind: "err", text: e.message }));
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.saveAi({
        ...(keyInput.trim() ? { apiKey: keyInput.trim() } : {}),
        model: model.trim(),
        base: base.trim(),
      });
      setKeyInput("");
      await load();
      setMessage({ kind: "ok", text: t("settings.saved") });
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.saveAi({ apiKey: "" });
      setKeyInput("");
      await load();
      setMessage({ kind: "ok", text: t("settings.cleared") });
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.testAi();
      setMessage(
        res.ok
          ? { kind: "ok", text: t("settings.testOk") }
          : { kind: "err", text: `${t("settings.testFail")}：${res.detail}` },
      );
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const fetchModels = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.listAiModels();
      if (res.ok) {
        setModels({ all: res.models, vision: res.vision });
        // 有名字带 vision 的就自动切过去；没有就保持当前选择
        if (res.vision.length > 0 && !res.vision.includes(model)) {
          setModel(res.vision[0] ?? model);
        }
        setMessage({ kind: "ok", text: t("settings.modelsFound", { n: res.models.length }) });
      } else {
        setMessage({ kind: "err", text: `${t("settings.testFail")}：${res.detail}` });
      }
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <Card title={t("settings.ai")} action={info?.configured ? t("settings.configured") : t("settings.notConfigured")}>
        <p className="text-[10.5px] leading-relaxed text-ink-3">{t("settings.aiHint")}</p>

        {/* 服务商预设 */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-ink-3">{t("settings.preset")}</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setBase(p.base);
                setModel(p.model);
                setMessage(null);
              }}
              title={p.vision ? t("settings.presetVision") : t("settings.presetText")}
              className={`rounded-full px-2 py-[2px] text-[10px] transition-colors ${
                activePreset === p.key
                  ? "bg-accent text-white"
                  : "border border-line bg-surface text-ink-3 hover:border-accent hover:text-accent"
              }`}
            >
              {p.key === "openai"
                ? "OpenAI"
                : p.key === "kimi"
                  ? "Kimi"
                  : p.key === "deepseek"
                    ? "DeepSeek"
                    : "Ollama"}
              {p.vision ? "" : " ·文本"}
            </button>
          ))}
          <span
            className={`rounded-full px-2 py-[2px] text-[10px] ${
              activePreset === "custom"
                ? "bg-accent text-white"
                : "border border-line bg-surface text-ink-3"
            }`}
          >
            {t("settings.presetCustom")}
          </span>
        </div>
        <p className="mt-1 text-[9.5px] leading-relaxed text-[#bcb8b0]">{t("settings.presetHint")}</p>

        {info?.configured ? (
          <p className="mt-2 text-[11px] text-ink-2">
            {t("settings.current")}：<span className="tabular-nums">{info.masked}</span>
            <span className="ml-1.5 text-[10px] text-ink-3">
              （{t(`settings.source.${info.source}`)}）
            </span>
          </p>
        ) : null}

        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="text-[10.5px] text-ink-3">{t("settings.apiKey")}</span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={info?.configured ? info.masked : "sk-..."}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none placeholder:text-[#c8c4bc]"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10.5px] text-ink-3">{t("settings.model")}</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10.5px] text-ink-3">{t("settings.base")}</span>
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink outline-none"
              />
            </label>
          </div>

          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="shrink-0 whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-[10.5px] font-semibold text-white disabled:opacity-60"
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={() => void test()}
              disabled={busy || !info?.configured}
              className="shrink-0 whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-2 disabled:opacity-50"
            >
              {t("settings.test")}
            </button>
            <button
              type="button"
              onClick={() => void fetchModels()}
              disabled={busy || !info?.configured}
              className="shrink-0 whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-2 disabled:opacity-50"
            >
              {t("settings.fetchModels")}
            </button>
            {info?.configured ? (
              <button
                type="button"
                onClick={() => void clearKey()}
                disabled={busy}
                className="shrink-0 whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-[10.5px] text-ink-3 disabled:opacity-60"
              >
                {t("settings.clear")}
              </button>
            ) : null}
            {message ? (
              <span
                className={`ml-auto shrink-0 whitespace-nowrap text-[10.5px] ${
                  message.kind === "ok" ? "text-accent" : "text-warn"
                }`}
              >
                {message.text}
              </span>
            ) : null}
          </div>

          {models ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {models.all.map((m) => {
                const canSee = models.vision.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                      model === m
                        ? "border-accent bg-accent text-white"
                        : canSee
                          ? "border-accent/50 bg-surface text-ink-2 hover:border-accent"
                          : "border-line bg-surface text-ink-3 hover:border-accent"
                    }`}
                  >
                    {canSee ? "◉ " : ""}
                    {m}
                  </button>
                );
              })}
            </div>
          ) : null}
          {models && models.vision.length === 0 ? (
            <p className="text-[10px] leading-relaxed text-[#c8c4bc]">{t("settings.noVisionHint")}</p>
          ) : null}        </div>
      </Card>

      <BudgetCard />

      <CategoriesCard />

      <Card title={t("settings.guide")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10.5px] leading-relaxed text-ink-3">{t("settings.guideHint")}</p>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event("life:tour"));
            }}
            className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink"
          >
            {t("settings.guideStart")}
          </button>
        </div>
      </Card>

      <Card title={t("settings.about")}>
        <dl className="space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <dt className="text-ink-3">{t("settings.version")}</dt>
            <dd className="text-ink-2">0.1.0 · P3</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">{t("settings.storage")}</dt>
            <dd className="text-ink-2">data/life.db</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-[10px] leading-relaxed text-[#c8c4bc]">{t("settings.localOnly")}</p>
      </Card>
    </div>
  );
}
