import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePerformanceRegression } from "../../../scripts/check-performance-regression.mjs";

test("performance regression gate flags speed and quality regressions against baseline", () => {
  const result = evaluatePerformanceRegression(
    {
      performance: { totalBuildMs: 1000, renderPptxMs: 500, measureMs: 100 },
      overflowCount: 0,
      minFontPt: 14,
      objectCoverage: 0.9,
    },
    {
      performance: { totalBuildMs: 1180, renderPptxMs: 620, measureMs: 110 },
      overflowCount: 1,
      minFontPt: 13,
      objectCoverage: 0.82,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.includes("totalBuildMs")), true);
  assert.equal(result.issues.some((issue) => issue.includes("renderPptxMs")), true);
  assert.equal(result.issues.some((issue) => issue.includes("overflowCount")), true);
  assert.equal(result.issues.some((issue) => issue.includes("minFontPt")), true);
  assert.equal(result.issues.some((issue) => issue.includes("objectCoverage")), true);
});

test("performance regression gate allows small timing variance without quality loss", () => {
  const result = evaluatePerformanceRegression(
    {
      performance: { totalBuildMs: 1000, renderPptxMs: 500, measureMs: 100 },
      overflowCount: 0,
      minFontPt: 14,
      objectCoverage: 0.9,
    },
    {
      performance: { totalBuildMs: 1060, renderPptxMs: 540, measureMs: 108 },
      overflowCount: 0,
      minFontPt: 14,
      objectCoverage: 0.91,
    },
  );

  assert.equal(result.ok, true);
});
