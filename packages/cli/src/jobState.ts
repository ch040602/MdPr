import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type MdprJobTaskStatus = "pending" | "dispatched" | "recorded" | "blocked" | "accepted";

export type MdprJobState = {
  schemaVersion: "mdpr-job-state-v1";
  completionEvidencePolicy: "artifact-path-or-report-id-required";
  tasks: Array<{
    slideNumber: number;
    slideId: string;
    status: MdprJobTaskStatus;
    evidencePath?: string;
    blockerReason?: string;
  }>;
  boundary: {
    noRendererInternals: true;
    noChatMessageCompletion: true;
  };
};

export type MdprJobStateValidation = {
  schemaVersion: "mdpr-job-state-validation-v1";
  valid: boolean;
  findings: string[];
};

export type MdprJobStateSummary = {
  schemaVersion: "mdpr-job-state-summary-v1";
  total: number;
  byStatus: Record<MdprJobTaskStatus, number>;
  complete: boolean;
  blocked: number;
  completionEvidencePolicy: "artifact-path-or-report-id-required";
};

const statuses: MdprJobTaskStatus[] = ["pending", "dispatched", "recorded", "blocked", "accepted"];

export function readMdprJobState(path: string): MdprJobState {
  const statePath = resolveJobStatePath(path);
  return JSON.parse(readFileSync(statePath, "utf-8")) as MdprJobState;
}

export function validateMdprJobState(state: MdprJobState): MdprJobStateValidation {
  const findings: string[] = [];
  if (state.schemaVersion !== "mdpr-job-state-v1") findings.push("schemaVersion must be mdpr-job-state-v1");
  if (state.completionEvidencePolicy !== "artifact-path-or-report-id-required") {
    findings.push("completionEvidencePolicy must require artifact path or report id evidence");
  }
  if (state.boundary?.noRendererInternals !== true) findings.push("boundary.noRendererInternals must be true");
  if (state.boundary?.noChatMessageCompletion !== true) findings.push("boundary.noChatMessageCompletion must be true");
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) findings.push("tasks must contain at least one slide task");
  const seen = new Set<string>();
  for (const task of Array.isArray(state.tasks) ? state.tasks : []) {
    if (!task.slideId) findings.push("task.slideId is required");
    if (seen.has(task.slideId)) findings.push(`duplicate task slideId: ${task.slideId}`);
    seen.add(task.slideId);
    if (!statuses.includes(task.status)) findings.push(`invalid task status for ${task.slideId}: ${task.status}`);
    if ((task.status === "recorded" || task.status === "accepted") && !task.evidencePath) {
      findings.push(`${task.slideId} ${task.status} status requires evidencePath`);
    }
    if (task.status === "blocked" && !task.blockerReason) findings.push(`${task.slideId} blocked status requires blockerReason`);
  }
  return {
    schemaVersion: "mdpr-job-state-validation-v1",
    valid: findings.length === 0,
    findings,
  };
}

export function summarizeMdprJobState(state: MdprJobState): MdprJobStateSummary {
  const byStatus: Record<MdprJobTaskStatus, number> = {
    pending: 0,
    dispatched: 0,
    recorded: 0,
    blocked: 0,
    accepted: 0,
  };
  for (const task of state.tasks) byStatus[task.status] += 1;
  return {
    schemaVersion: "mdpr-job-state-summary-v1",
    total: state.tasks.length,
    byStatus,
    complete: state.tasks.length > 0 && state.tasks.every((task) => task.status === "accepted"),
    blocked: byStatus.blocked,
    completionEvidencePolicy: state.completionEvidencePolicy,
  };
}

function resolveJobStatePath(path: string): string {
  if (!existsSync(path)) throw new Error(`Job state path not found: ${path}`);
  const entries = existsSync(path) && !path.endsWith(".json") ? readdirSync(path) : [];
  if (entries.includes("mdpr-job-state.json")) return join(path, "mdpr-job-state.json");
  return path;
}
