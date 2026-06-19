import type { BlockIR } from "../ir/types.js";

export type DensityScore = {
  total: number;
  textScore: number;
  listScore: number;
  tableScore: number;
  imageScore: number;
  codeScore: number;
  headingScore: number;
};

export function calculateDensity(blocks: BlockIR[]): DensityScore {
  const score: DensityScore = {
    total: 0,
    textScore: 0,
    listScore: 0,
    tableScore: 0,
    imageScore: 0,
    codeScore: 0,
    headingScore: 0,
  };

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph": {
        const length = block.text?.length ?? 0;
        const sentenceCount = block.sentences?.length ?? 1;
        const value = Math.max(length > 120 ? 2 : 1, Math.ceil(sentenceCount / 2));
        score.textScore += value;
        break;
      }
      case "bulletList": {
        score.listScore += block.items?.length ?? block.listItems?.length ?? 0;
        break;
      }
      case "table": {
        const rows = block.rows?.length ?? 0;
        score.tableScore += rows > 6 ? 8 : 4;
        break;
      }
      case "image": {
        score.imageScore += 5;
        break;
      }
      case "code": {
        const lines = block.text?.split(/\r?\n/).length ?? 0;
        score.codeScore += lines > 12 ? 9 : 5;
        break;
      }
      case "quote": {
        score.textScore += 3;
        break;
      }
      case "diagram": {
        score.textScore += Math.max(2, block.diagram?.nodes.length ?? 2);
        break;
      }
      case "chart": {
        score.textScore += Math.max(4, block.chart?.labels.length ?? 4);
        break;
      }
      case "heading": {
        score.headingScore += 1;
        break;
      }
    }
  }

  score.total = score.textScore + score.listScore + score.tableScore + score.imageScore + score.codeScore + score.headingScore;
  return score;
}
