import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function evaluatePerformanceRegression(baseline, current, options = {}) {
  const thresholds = {
    totalBuildRatio: options.totalBuildRatio ?? 1.15,
    renderPptxRatio: options.renderPptxRatio ?? 1.2,
    measureRatio: options.measureRatio ?? 1.25,
  };
  const issues = [];
  const basePerf = baseline.performance ?? {};
  const currentPerf = current.performance ?? {};

  compareRatio(issues, "totalBuildMs", basePerf.totalBuildMs, currentPerf.totalBuildMs, thresholds.totalBuildRatio);
  compareRatio(issues, "renderPptxMs", basePerf.renderPptxMs, currentPerf.renderPptxMs, thresholds.renderPptxRatio);
  compareRatio(issues, "measureMs", basePerf.measureMs, currentPerf.measureMs, thresholds.measureRatio);

  if (number(current.overflowCount) > number(baseline.overflowCount)) {
    issues.push(`overflowCount increased from ${baseline.overflowCount} to ${current.overflowCount}`);
  }
  if (number(current.minFontPt) < number(baseline.minFontPt)) {
    issues.push(`minFontPt decreased from ${baseline.minFontPt} to ${current.minFontPt}`);
  }
  if (number(current.objectCoverage) < number(baseline.objectCoverage)) {
    issues.push(`objectCoverage decreased from ${baseline.objectCoverage} to ${current.objectCoverage}`);
  }

  return { ok: issues.length === 0, issues, thresholds };
}

function compareRatio(issues, label, baselineValue, currentValue, maxRatio) {
  if (!Number.isFinite(number(baselineValue)) || !Number.isFinite(number(currentValue)) || number(baselineValue) <= 0) return;
  const ratio = number(currentValue) / number(baselineValue);
  if (ratio > maxRatio) issues.push(`${label} regression ratio ${ratio.toFixed(3)} exceeds ${maxRatio}`);
}

function number(value) {
  return typeof value === "number" ? value : Number.NaN;
}

function main() {
  const [baselinePath, currentPath] = process.argv.slice(2);
  if (!baselinePath || !currentPath) {
    console.error("Usage: node scripts/check-performance-regression.mjs <baseline.json> <current.json>");
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
  const current = JSON.parse(readFileSync(currentPath, "utf-8"));
  const result = evaluatePerformanceRegression(baseline, current);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
