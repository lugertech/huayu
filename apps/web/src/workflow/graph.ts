import { t } from "@/i18n";
export interface GraphEdge {
  from: string;
  to: string;
}

/** Plans reachable nodes in dependency order; fan-in runs once after all reachable parents finish. */
export function planWorkflow(
  root: string | readonly string[],
  edges: readonly GraphEdge[],
): string[][] {
  const outgoing = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, new Set());
    outgoing.get(edge.from)!.add(edge.to);
  }
  const reachable = new Set<string>();
  const pending = typeof root === "string" ? [root] : [...root];
  while (pending.length) {
    const current = pending.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(outgoing.get(current) || []));
  }
  const indegrees = new Map([...reachable].map((id) => [id, 0]));
  for (const [from, targets] of outgoing) {
    if (!reachable.has(from)) continue;
    for (const to of targets)
      if (reachable.has(to)) indegrees.set(to, indegrees.get(to)! + 1);
  }
  const levels: string[][] = [];
  let level = [...indegrees]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  let processed = 0;
  while (level.length) {
    levels.push(level);
    processed += level.length;
    const next: string[] = [];
    for (const id of level)
      for (const target of outgoing.get(id) || []) {
        const count = indegrees.get(target)! - 1;
        indegrees.set(target, count);
        if (count === 0) next.push(target);
      }
    level = next;
  }
  if (processed !== reachable.size)
    throw new Error(t("workflow.theWorkflowContainsACycle"));
  return levels;
}
