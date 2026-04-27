import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findCandidateRun, pollForRun } = require("../lib/poll");

const DISPATCHED_AT = "2026-04-27T20:00:00.000Z";

function run(overrides) {
  return {
    id: 1,
    name: "Deployment – adema-ai",
    html_url: "https://example.com/run/1",
    created_at: "2026-04-27T20:00:01.000Z",
    status: "in_progress",
    head_branch: "main",
    event: "workflow_dispatch",
    ...overrides,
  };
}

describe("findCandidateRun", () => {
  it("matches by manifest name suffix and ignores other apps' runs", () => {
    const runs = [
      run({ id: 99, name: "Deployment – web", created_at: "2026-04-27T20:00:02.000Z" }),
      run({ id: 7, name: "Deployment – adema-ai", created_at: "2026-04-27T20:00:03.000Z" }),
    ];
    const match = findCandidateRun(runs, { dispatchedAt: DISPATCHED_AT, manifestName: "adema-ai" });
    expect(match.id).toBe(7);
  });

  it("ignores runs created BEFORE dispatch (stale prior runs)", () => {
    const runs = [
      run({ id: 1, name: "Deployment – adema-ai", created_at: "2026-04-27T19:59:50.000Z" }),
      run({ id: 2, name: "Deployment – adema-ai", created_at: "2026-04-27T20:00:05.000Z" }),
    ];
    const match = findCandidateRun(runs, { dispatchedAt: DISPATCHED_AT, manifestName: "adema-ai" });
    expect(match.id).toBe(2);
  });

  it("matches even when the run already completed (fast deploy)", () => {
    const runs = [
      run({
        id: 5,
        name: "Deployment – adema-ai",
        status: "completed",
        conclusion: "success",
        created_at: "2026-04-27T20:00:01.000Z",
      }),
    ];
    const match = findCandidateRun(runs, { dispatchedAt: DISPATCHED_AT, manifestName: "adema-ai" });
    expect(match).not.toBeNull();
    expect(match.id).toBe(5);
  });

  it("picks the OLDEST run when several match (closest to dispatch)", () => {
    const runs = [
      run({ id: 30, created_at: "2026-04-27T20:00:30.000Z" }),
      run({ id: 10, created_at: "2026-04-27T20:00:10.000Z" }),
      run({ id: 20, created_at: "2026-04-27T20:00:20.000Z" }),
    ];
    const match = findCandidateRun(runs, { dispatchedAt: DISPATCHED_AT, manifestName: "adema-ai" });
    expect(match.id).toBe(10);
  });

  it("works for the job workflow run-name format with em-dash", () => {
    // SH-Proptech/deployment/.github/workflows/job.yaml uses
    // run-name: Job — ${{ ...name }} (em-dash, U+2014).
    const runs = [run({ name: "Job — adema-ai-batch-cleanup" })];
    const match = findCandidateRun(runs, {
      dispatchedAt: DISPATCHED_AT,
      manifestName: "adema-ai-batch-cleanup",
    });
    expect(match).not.toBeNull();
  });

  it("returns null when no run matches", () => {
    expect(
      findCandidateRun([], { dispatchedAt: DISPATCHED_AT, manifestName: "adema-ai" })
    ).toBeNull();
    expect(
      findCandidateRun([run({ name: "Deployment – web" })], {
        dispatchedAt: DISPATCHED_AT,
        manifestName: "adema-ai",
      })
    ).toBeNull();
  });

  it("ignores runs whose name field is missing or non-string", () => {
    const runs = [
      run({ name: null }),
      run({ name: undefined }),
      run({ name: "Deployment – adema-ai", id: 42 }),
    ];
    const match = findCandidateRun(runs, { dispatchedAt: DISPATCHED_AT, manifestName: "adema-ai" });
    expect(match.id).toBe(42);
  });
});

describe("pollForRun", () => {
  it("calls listWorkflowRuns with created>=<dispatchedAt> and per_page 100", async () => {
    const calls = [];
    const octokit = {
      rest: {
        actions: {
          listWorkflowRuns: async (args) => {
            calls.push(args);
            return {
              data: {
                workflow_runs: [
                  run({ id: 555, name: "Deployment – adema-ai", created_at: "2026-04-27T20:00:01.000Z" }),
                ],
              },
            };
          },
        },
      },
    };
    const result = await pollForRun({
      octokit,
      owner: "sh-proptech",
      repo: "deployment",
      workflowId: "deployment.yaml",
      dispatchedAt: DISPATCHED_AT,
      manifestName: "adema-ai",
    });
    expect(result.id).toBe(555);
    expect(calls[0]).toMatchObject({
      owner: "sh-proptech",
      repo: "deployment",
      workflow_id: "deployment.yaml",
      event: "workflow_dispatch",
      created: `>=${DISPATCHED_AT}`,
      per_page: 100,
    });
  });
});
