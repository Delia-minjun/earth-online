// pdf.js 的最小类型声明（只用文字抽取相关 API）
export const GlobalWorkerOptions: { workerSrc: string };
export interface PdfTextItem {
  str: string;
}
export interface PdfTextContent {
  items: (PdfTextItem | { str?: undefined })[];
}
export interface PdfPage {
  getTextContent(): Promise<PdfTextContent>;
  cleanup(): void;
}
export interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
export function getDocument(src: {
  data: Uint8Array;
  useSystemFonts?: boolean;
  isEvalSupported?: boolean;
}): { promise: Promise<PdfDocument> };