import { describe, it, expect } from "vitest";
import path from "path";

// Use CJS require to import the module since the project is CJS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require("../lib/manifest");

describe("manifest.parseManifest", () => {
  it("parses JSON by extension", () => {
    const raw = JSON.stringify({ type: "deployment", image: { name: "app" } });
    const out = manifest.parseManifest(raw, "deploy.json");
    expect(out).toEqual({ type: "deployment", image: { name: "app" } });
  });

  it("parses YAML by extension", () => {
    const raw = "type: job\nimage:\n  name: app\n";
    const out = manifest.parseManifest(raw, "deploy.yaml");
    expect(out).toEqual({ type: "job", image: { name: "app" } });
  });

  it("falls back when no extension provided", () => {
    const raw = "type: deployment\nimage:\n  name: app\n";
    const out = manifest.parseManifest(raw, "");
    expect(out.type).toBe("deployment");
    expect(out.image.name).toBe("app");
  });

  it("throws on invalid content", () => {
    const raw = "{ not: valid";
    expect(() => manifest.parseManifest(raw, ".json")).toThrow(
      /Failed to parse manifest/
    );
  });
});

describe("manifest.applyTag", () => {
  it("sets image tag", () => {
    const obj = { type: "job", image: { name: "app" } };
    const tagged = manifest.applyTag(obj, "v1");
    expect(tagged.image.tag).toBe("v1");
  });

  it("throws if image missing", () => {
    expect(() => manifest.applyTag({}, "v1")).toThrow(/'image' object/);
  });
});

describe("manifest.computeWorkflowId", () => {
  it("returns deployment.yaml for deployment type", () => {
    expect(manifest.computeWorkflowId({ type: "deployment", image: {} })).toBe(
      "deployment.yaml"
    );
  });
  it("returns job.yaml for job type", () => {
    expect(manifest.computeWorkflowId({ type: "job", image: {} })).toBe(
      "job.yaml"
    );
  });
  it("throws on invalid type", () => {
    expect(() =>
      manifest.computeWorkflowId({ type: "other", image: {} })
    ).toThrow(/Invalid manifest type/);
  });
});

describe("manifest.toDispatchInput", () => {
  it("stringifies to JSON", () => {
    const s = manifest.toDispatchInput({ a: 1 });
    expect(typeof s).toBe("string");
    expect(() => JSON.parse(s)).not.toThrow();
  });
});
