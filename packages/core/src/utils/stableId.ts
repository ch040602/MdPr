import { createHash } from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "slide";
}

export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 6);
}

export function createStableId(parts: string[], seed = ""): string {
  const base = slugify(parts[parts.length - 1] ?? parts.join(" "));
  const hash = shortHash(`${parts.join("/")}::${seed}`);
  return `${base}-${hash}`;
}
