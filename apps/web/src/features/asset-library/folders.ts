export interface AssetFolder {
  id: string;
  name: string;
  parent_id: string | null;
  asset_count?: number;
}
export interface AssetFolderBranch extends AssetFolder {
  children: AssetFolderBranch[];
}
export function folderTree(folders: AssetFolder[]): AssetFolderBranch[] {
  const branches = new Map<string, AssetFolderBranch>(
    folders.map((folder) => [folder.id, { ...folder, children: [] }]),
  );
  const roots: AssetFolderBranch[] = [];
  for (const folder of branches.values()) {
    if (folder.parent_id) branches.get(folder.parent_id)!.children.push(folder);
    else roots.push(folder);
  }
  return roots;
}

/** Look up a folder together with its ancestors in root-to-leaf order. */
export function folderPath(
  folders: AssetFolderBranch[],
  id: string | null,
): AssetFolderBranch[] {
  const path: AssetFolderBranch[] = [];
  function visit(branches: AssetFolderBranch[]): boolean {
    for (const folder of branches) {
      path.push(folder);
      if (folder.id === id || visit(folder.children)) return true;
      path.pop();
    }
    return false;
  }
  if (id !== null) visit(folders);
  return path;
}

export function folderRows(
  folders: AssetFolderBranch[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  return folders.flatMap((folder) => [
    { id: folder.id, name: folder.name, depth },
    ...folderRows(folder.children, depth + 1),
  ]);
}
