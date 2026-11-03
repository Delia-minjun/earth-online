import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en-US.json";
import zh from "./zh-CN.json";

export const LANGS = ["zh-CN", "en-US"] as const;
export type Lang = (typeof LANGS)[number];

const STORAGE_KEY = "life.lang";

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "en-US" ? "en-US" : "zh-CN";
}

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zh },
    "en-US": { translation: en },
  },
  lng: initialLang(),
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
});

export function setLang(next: Lang): void {
  localStorage.setItem(STORAGE_KEY, next);
  void i18n.changeLanguage(next);
}

export default i18n;
