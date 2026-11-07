import { describe, expect, it } from "vite-plus/test";
import { getToolDockLayout } from "./toolbar-layout";

const dock = { dockWidth: 510, left: 232, gap: 12 };

describe("bottom drawing tools", () => {
  it("moves to the right edge when centering would overlap the left actions", () => {
    expect(getToolDockLayout({ ...dock, width: 925, right: 909 })).toEqual({
      shift: 179.5,
      stacked: false,
    });
  });

  it("keeps the toolbar centered when the left actions leave enough room", () => {
    expect(getToolDockLayout({ ...dock, width: 1184, right: 1168 })).toEqual({
      shift: 0,
      stacked: false,
    });
  });

  it("retains the 12px gaps when one row fits exactly", () => {
    expect(getToolDockLayout({ ...dock, width: 782, right: 766 })).toEqual({
      shift: 108,
      stacked: false,
    });
  });

  it("stacks the action row when one pixel short of fitting", () => {
    expect(getToolDockLayout({ ...dock, width: 781, right: 765 })).toEqual({
      shift: 0,
      stacked: true,
    });
  });

  it("includes mobile lock and hand controls in the space needed by left actions", () => {
    expect(
      getToolDockLayout({
        width: 728,
        dockWidth: 409,
        left: 164,
        right: 716,
        gap: 12,
      }),
    ).toEqual({ shift: 135.5, stacked: false });
  });

  it.each([
    { width: 609, shift: 76, stacked: false },
    { width: 608, shift: 0, stacked: true },
  ])(
    "switches mobile action rows at $width px",
    ({ width, shift, stacked }) => {
      expect(
        getToolDockLayout({
          width,
          dockWidth: 409,
          left: 164,
          right: width - 12,
          gap: 12,
        }),
      ).toEqual({ shift, stacked });
    },
  );
});
