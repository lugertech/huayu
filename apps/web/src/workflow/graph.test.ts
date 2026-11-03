import { describe, expect, it } from "vite-plus/test";
import { planWorkflow } from "./graph";

describe("workflow dependency planning", () => {
  it("waits for both branches before running a shared downstream node once", () => {
    expect(
      planWorkflow("start", [
        { from: "start", to: "left" },
        { from: "start", to: "right" },
        { from: "left", to: "merge" },
        { from: "right", to: "merge" },
        { from: "right", to: "merge" },
        { from: "unrelated", to: "other" },
      ]),
    ).toEqual([["start"], ["left", "right"], ["merge"]]);
  });
  it("rejects reachable cycles before invoking any model", () => {
    expect(() =>
      planWorkflow("a", [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ]),
    ).toThrow("循环");
    expect(planWorkflow("a", [{ from: "unrelated", to: "unrelated" }])).toEqual(
      [["a"]],
    );
  });
});
