const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");

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
        `Invalid manifest type: ${type}. Expected 'deployment' or 'job'.`
      );
    }

    const manifest = JSON.stringify(data, null, 2);

    const dispatchData = {
      owner: "sh-proptech",
      repo: "deployment",
      workflow_id: workflow,
      ref: "main",
      inputs: {
        manifest,
      },
    };

    core.info(`Dispatch data: ${JSON.stringify(dispatchData, null, 2)}`);

    const octokit = github.getOctokit(token);

    await octokit.rest.actions.createWorkflowDispatch(dispatchData);

    core.info(
      `✅ Triggered ${workflow} in sh-proptech/deployment with tag ${tag}`
    );
  } catch (err) {
    core.setFailed(err.message);
  }
})();
