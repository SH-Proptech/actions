const util = require("util");
const sleep = util.promisify(setTimeout);

// 5-minute polling budget. listWorkflowRuns has eventual consistency on
// freshly-dispatched runs — the previous 100s budget timed out before the
// new run appeared in list results during quiet periods.
const FIND_RUN_MAX_ATTEMPTS = 60;
const FIND_RUN_INTERVAL_MS = 5000;

// Subtract a few seconds when computing the `created>=` filter to absorb
// clock skew between the runner and GitHub's API.
const DISPATCH_CLOCK_SKEW_MS = 5000;

/**
 * Picks our dispatched workflow run out of the list of recent runs.
 *
 * Robust against three failure modes the previous matcher had:
 *   1. concurrent dispatches from other apps  -> name match scopes to ours
 *   2. fast deploys that complete before the action sees them
 *      -> we no longer require status !== "completed"
 *   3. > N runs ahead of ours pushing it out of per_page=5
 *      -> we use per_page=100 and a `created>=` filter
 *
 * Matching strategy:
 *   - run.event === "workflow_dispatch" (already filtered by the API call)
 *   - run.created_at >= dispatchedAt (with 5s clock-skew buffer)
 *   - run.name ends with manifestName (every deployment workflow's run-name
 *     interpolates manifest.name at the end — see
 *     SH-Proptech/deployment/.github/workflows/{deployment,job}.yaml)
 *   - among matches, pick the OLDEST. If two dispatches for the same app
 *     fire within ~5s of each other this is best-effort, but in practice
 *     the build+push step in front of this action serialises that case.
 */
function findCandidateRun(runs, { dispatchedAt, manifestName }) {
  const dispatchedAtMs = new Date(dispatchedAt).getTime();
  const candidates = runs
    .filter((run) => {
      if (typeof run.name !== "string" || !run.name.endsWith(manifestName)) return false;
      const createdAtMs = new Date(run.created_at).getTime();
      return createdAtMs >= dispatchedAtMs;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return candidates[0] || null;
}

async function pollForRun({ octokit, owner, repo, workflowId, dispatchedAt, manifestName, logger }) {
  for (let attempt = 0; attempt < FIND_RUN_MAX_ATTEMPTS; attempt++) {
    const { data } = await octokit.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
      event: "workflow_dispatch",
      created: `>=${dispatchedAt}`,
      per_page: 100,
    });

    const match = findCandidateRun(data.workflow_runs, { dispatchedAt, manifestName });
    if (match) {
      if (logger && typeof logger.info === "function") {
        logger.info(`🚀 Found workflow run: ${match.html_url} (id: ${match.id})`);
      }
      return match;
    }

    await sleep(FIND_RUN_INTERVAL_MS);
  }
  throw new Error("Workflow run not found or didn't start in time");
}

module.exports = {
  findCandidateRun,
  pollForRun,
  DISPATCH_CLOCK_SKEW_MS,
  FIND_RUN_MAX_ATTEMPTS,
  FIND_RUN_INTERVAL_MS,
};
