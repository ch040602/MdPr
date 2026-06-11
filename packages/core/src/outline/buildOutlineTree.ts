import type { BlockIR, HeadingLevel, MarkdownDocument, OutlineNode } from "../ir/types.js";
import { createStableId } from "../utils/stableId.js";

export function buildOutlineTree(doc: MarkdownDocument): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  const pathCounts = new Map<string, number>();

  for (const block of doc.blocks) {
    if (block.type !== "heading") {
      const current = stack[stack.length - 1];
      current?.blocks.push(block);
      continue;
    }

    const level = block.level as HeadingLevel;
    const title = block.text ?? "Untitled";

    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();

    const headingPath = [...stack.map((n) => n.title), title];
    const pathKey = headingPath.join("/");
    const pathCount = (pathCounts.get(pathKey) ?? 0) + 1;
    pathCounts.set(pathKey, pathCount);
    const node: OutlineNode = {
      id: createStableId(headingPath, pathCount > 1 ? `duplicate-${pathCount}` : ""),
      level,
      title,
      source: block.source,
      blocks: [],
      children: [],
      headingPath,
    };

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root.push(node);

    stack.push(node);
  }

  return root;
}
