import type { LayoutIR } from "@mdpresent/layout";
import { renderHtml } from "@mdpresent/render-html";

export type RenderPdfOptions = {
  outPath: string;
};

export async function renderPdf(layout: LayoutIR, options: RenderPdfOptions): Promise<void> {
  // TODO: Playwright page.pdf()로 구현한다.
  // 현재 skeleton은 HTML을 만들고 renderer integration point만 제공한다.
  void renderHtml(layout, { title: "mdpresent PDF" });
  throw new Error(`PDF renderer is not implemented yet. Target: ${options.outPath}`);
}
