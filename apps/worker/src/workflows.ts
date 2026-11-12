/**
 * GitHub Actions health for the owner report: which workflows failed in the last 24 h and whether a later run of the
 * same workflow succeeded (12 Nov: the collector and the nightly backup failed and the report did not say so).
 * Read-only: one GET of the repository's runs, with the job's token on GitHub (actions: read) or none locally.
 */
export interface Run { name: string; conclusion: string | null; status: string; createdAt: string }
export interface WorkflowFailure { name: string; failed: number; recovered: boolean }

export async function recentRuns(repo: string | undefined, token: string | undefined, now = new Date()): Promise<Run[] | null> {
  if (!repo) return null;
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 19);
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&created=>=${since}Z`, {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { workflow_runs: { name: string; conclusion: string | null; status: string; created_at: string }[] };
    return j.workflow_runs.map((w) => ({ name: w.name, conclusion: w.conclusion, status: w.status, createdAt: w.created_at }));
  } catch {
    return null;
  }
}

/** Failed runs per workflow (cancelled runs are not failures); `recovered` when a later run of it succeeded. */
export function workflowFailures(runs: Run[]): WorkflowFailure[] {
  const out = new Map<string, WorkflowFailure>();
  const sorted = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of sorted) {
    const f = out.get(r.name);
    if (r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "startup_failure") {
      out.set(r.name, { name: r.name, failed: (f?.failed ?? 0) + 1, recovered: false });
    } else if (r.conclusion === "success" && f) {
      f.recovered = true;
    }
  }
  return [...out.values()];
}
