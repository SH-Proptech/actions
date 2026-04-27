const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const util = require("util");
const {
  parseManifest,
  applyTag,
  computeWorkflowId,
  toDispatchInput,
} = require("./lib/manifest");
const { pollForRun, DISPATCH_CLOCK_SKEW_MS } = require("./lib/poll");

const sleep = util.promisify(setTimeout);

function loadFile(filePath) {
  core.info(`🔍 Reading deployment manifest from ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const data = parseManifest(raw, filePath);
  return data;
}

(async () => {
  try {
    const filePath = core.getInput("file");
    const token = core.getInput("github_token");
    const tag = core.getInput("tag");
    let data = loadFile(filePath);
    data = applyTag(data, tag);
    const workflowId = computeWorkflowId(data);
    const manifestName = data.name;
    if (!manifestName || typeof manifestName !== "string") {
      throw new Error(
        "Manifest must include a top-level string 'name' field — used to identify the dispatched workflow run."
      );
    }
    // Always dispatch JSON to the remote workflow for consistency
    const manifest = toDispatchInput(data);

    const octokit = github.getOctokit(token);

    // Capture dispatch timestamp BEFORE the API call so the
    // listWorkflowRuns `created>=` filter narrows to runs caused by THIS
    // dispatch. The 5s skew buffer absorbs clock drift between the runner
    // and GitHub's API.
    const dispatchedAt = new Date(Date.now() - DISPATCH_CLOCK_SKEW_MS).toISOString();

    core.info(`📤 Dispatching ${workflowId}...`);
    await octokit.rest.actions.createWorkflowDispatch({
      owner: "sh-proptech",
      repo: "deployment",
      workflow_id: workflowId,
      ref: "main",
      inputs: {
        manifest,
      },
    });

    core.info(`⏳ Waiting for workflow run to start...`);

    const run = await pollForRun({
      octokit,
      owner: "sh-proptech",
      repo: "deployment",
      workflowId,
      dispatchedAt,
      manifestName,
      logger: core,
    });

    // 🟨 Poll for completion
    const waitForCompletion = async (runId) => {
      for (let i = 0; i < 60; i++) {
        const { data: runStatus } = await octokit.rest.actions.getWorkflowRun({
          owner: "sh-proptech",
          repo: "deployment",
          run_id: runId,
        });

        if (runStatus.status === "completed") {
          return runStatus;
        }

        core.info(`🔄 Waiting for completion (attempt ${i + 1})...`);
        await sleep(10000); // 10s delay
      }

      throw new Error("Timed out waiting for workflow to complete");
    };

    const finalRun = await waitForCompletion(run.id);

    if (finalRun.conclusion !== "success") {
      core.setFailed(`❌ Workflow failed: ${finalRun.html_url}`);
    } else {
      core.info(`✅ Workflow succeeded: ${finalRun.html_url}`);
    }
  } catch (err) {
    core.setFailed(err.message);
  }
})();
