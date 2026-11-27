import { describe, expect, it } from "vite-plus/test";
import { folderPath, folderRows, folderTree } from "./folders";
describe("asset folders", () => {
  it("keeps nested folder order and depth for browsing and moving materials", () => {
    expect(
      folderRows(
        folderTree([
          { id: "child", name: "街景", parent_id: "photos" },
          { id: "photos", name: "照片", parent_id: null },
          { id: "icons", name: "图标", parent_id: null },
        ]),
      ).map(({ id, depth }) => [id, depth]),
    ).toEqual([
      ["photos", 0],
      ["child", 1],
      ["icons", 0],
    ]);
  });
  it("builds the folder tree from flat records without losing nested counts", () => {
    const folders = [
      { id: "leaf", name: "海报", parent_id: "child", asset_count: 3 },
      { id: "root", name: "品牌", parent_id: null, asset_count: 1 },
      { id: "child", name: "夏日", parent_id: "root", asset_count: 2 },
    ];
    const tree = folderTree(folders);
    expect(tree).toHaveLength(1);
    expect(folderPath(tree, "leaf").map(({ id }) => id)).toEqual([
      "root",
      "child",
      "leaf",
    ]);
    expect(folderPath(tree, "absent")).toEqual([]);
    expect(folderPath(tree, null)).toEqual([]);
    expect(tree[0].children[0].children[0]).toMatchObject({
      id: "leaf",
      asset_count: 3,
      children: [],
    });
    expect(folders[0]).not.toHaveProperty("children");
  });
});
