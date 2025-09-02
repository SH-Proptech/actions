const path = require("path");
const yaml = require("js-yaml");

function parseManifest(raw, filePathOrExt = "") {
  const ext = (
    filePathOrExt.startsWith(".") ? filePathOrExt : path.extname(filePathOrExt)
  ).toLowerCase();

  try {
    if (ext === ".yaml" || ext === ".yml") {
      return yaml.load(raw);
    }
    if (ext === ".json") {
      return JSON.parse(raw);
    }
    // Unknown or missing extension: attempt JSON then YAML
    try {
      return JSON.parse(raw);
    } catch (_) {
      return yaml.load(raw);
    }
  } catch (e) {
    throw new Error(
      `Failed to parse manifest. Ensure it's valid JSON or YAML. Details: ${e.message}`
    );
  }
}

function ensureObject(obj, message) {
  if (!obj || typeof obj !== "object") {
    throw new Error(message);
  }
}

function applyTag(manifest, tag) {
  ensureObject(manifest, "Parsed manifest is empty or not an object");
  ensureObject(manifest.image, "Manifest must include an 'image' object");
  manifest.image.tag = tag;
  return manifest;
}

function computeWorkflowId(manifest) {
  const workflow = manifest.type;
  if (workflow !== "deployment" && workflow !== "job") {
    throw new Error(
      `Invalid manifest type: ${workflow}. Expected 'deployment' or 'job'.`
    );
  }
  return `${workflow}.yaml`;
}

function toDispatchInput(manifest) {
  return JSON.stringify(manifest, null, 2);
}

module.exports = {
  parseManifest,
  applyTag,
  computeWorkflowId,
  toDispatchInput,
};
