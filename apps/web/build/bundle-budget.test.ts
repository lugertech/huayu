import { build } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";
import { bundleBudget } from "../../../scripts/build/bundle-budget";

const home = "\0budget:home";
const worker = "\0budget:worker";
const sources: Record<string, string> = {
  [home]: 'console.log("home");',
  [worker]: "self.onmessage = () => {};",
};

function buildFixture(mergeEntries: boolean) {
  return build({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "budget-fixture",
        resolveId: (id) => (id in sources ? id : undefined),
        load: (id) => sources[id],
      },
      bundleBudget({
        initialGzipLimit: 10_000,
        deferredEntries: [/^\0budget:worker$/],
      }),
    ],
    build: {
      write: false,
      minify: false,
      rolldownOptions: {
        input: { home, worker },
        output: {
          strictExecutionOrder: true,
          codeSplitting: mergeEntries
            ? {
                groups: [
                  {
                    name: "shared",
                    tags: ["$initial"],
                    includeDependenciesRecursively: false,
                  },
                ],
              }
            : undefined,
        },
      },
    },
  });
}

describe("deferred Worker build budget", () => {
  it("excludes a standalone Worker from the homepage static graph", async () => {
    const result = await buildFixture(false);
    if (Array.isArray(result) || !("output" in result))
      throw new Error("Expected one bundle.");
    const asset = result.output.find(
      (entry) => entry.fileName === "bundle-budget.json",
    );
    if (asset?.type !== "asset") throw new Error("Expected a budget report.");
    const report = JSON.parse(String(asset.source)) as {
      chunks: { file: string; initial: boolean }[];
    };
    expect(
      report.chunks.find((chunk) => chunk.file.includes("worker")),
    ).toMatchObject({ initial: false });
    expect(
      report.chunks.find((chunk) => chunk.file.includes("home")),
    ).toMatchObject({ initial: true });
  });

  it("rejects manual groups that merge a Worker into homepage code", async () => {
    await expect(buildFixture(true)).rejects.toThrow(
      "an on-demand dependency entered the initial bundle",
    );
  });
});
