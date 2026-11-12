import { describe, expect, it } from "vitest";
import { workflowFailures } from "./workflows";

describe("workflowFailures", () => {
  it("counts failures per workflow and notes a later success", () => {
    const runs = [
      { name: "Collect prices", conclusion: "failure", status: "completed", createdAt: "2026-11-12T03:50:00Z" },
      { name: "Collect prices", conclusion: "failure", status: "completed", createdAt: "2026-11-12T04:20:00Z" },
      { name: "Collect prices", conclusion: "cancelled", status: "completed", createdAt: "2026-11-12T05:20:10Z" },
      { name: "Collect prices", conclusion: "success", status: "completed", createdAt: "2026-11-12T05:20:00Z" },
      { name: "Nightly backup", conclusion: "failure", status: "completed", createdAt: "2026-11-12T02:16:00Z" },
      { name: "CI", conclusion: "success", status: "completed", createdAt: "2026-11-12T05:00:00Z" },
    ];
    expect(workflowFailures(runs)).toEqual([
      { name: "Nightly backup", failed: 1, recovered: false },
      { name: "Collect prices", failed: 2, recovered: true },
    ]);
  });
  it("a failure after a success is not recovered", () => {
    expect(workflowFailures([
      { name: "CI", conclusion: "success", status: "completed", createdAt: "2026-11-12T01:00:00Z" },
      { name: "CI", conclusion: "failure", status: "completed", createdAt: "2026-11-12T02:00:00Z" },
    ])).toEqual([{ name: "CI", failed: 1, recovered: false }]);
  });
});
