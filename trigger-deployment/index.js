const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
const util = require("util");

const sleep = util.promisify(setTimeout);

(async () => {
  try {
    const filePath = core.getInput("file");
    const token = core.getInput("github_token");
    const tag = core.getInput("tag");

    core.info(`🔍 Reading deployment manifest from ${filePath}`);

    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    data.image.tag = tag;
    const workflow = data.type;

    if (workflow !== "deployment" && workflow !== "job") {
      throw new Error(
        `Invalid manifest type: ${workflow}. Expected 'deployment' or 'job'.`
      );
    }

    const manifest = JSON.stringify(data, null, 2);
    const workflowId = `${workflow}.yaml`;

    const octokit = github.getOctokit(token);

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

    // 🟨 Poll for the workflow run
    const pollForRun = async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const runs = await octokit.rest.actions.listWorkflowRuns({
          owner: "sh-proptech",
          repo: "deployment",
          workflow_id: workflowId,
          event: "workflow_dispatch",
          per_page: 5,
        });

        const match = runs.data.workflow_runs.find(
          (run) => run.head_branch === "main" && run.status !== "completed"
        );

        if (match) {
          core.info(
            `🚀 Found workflow run: ${match.html_url} (id: ${match.id})`
          );
          return match;
        }

        await sleep(5000); // 5s delay
      }

      throw new Error("Workflow run not found or didn't start in time");
    };

    const run = await pollForRun();

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
