import { projectPinPreferenceKeys, type SidebarProjectSnapshot } from "./sidebarProjectGrouping";
import { resolveProjectFolderId, type SidebarProjectFolder } from "./uiStateStore";

export interface SidebarFolderView {
  folder: SidebarProjectFolder;
  projects: readonly SidebarProjectSnapshot[];
}

export function folderExpansionKey(folderId: string): string {
  return `sidebar-folder:${folderId}`;
}

export function buildSidebarFolderViews(input: {
  folders: readonly SidebarProjectFolder[];
  projects: readonly SidebarProjectSnapshot[];
}): {
  folderViews: SidebarFolderView[];
  folderedProjectKeys: ReadonlySet<string>;
} {
  const projectsByFolderId = new Map<string, SidebarProjectSnapshot[]>();
  const folderedProjectKeys = new Set<string>();
  for (const project of input.projects) {
    const folderId = resolveProjectFolderId(input.folders, projectPinPreferenceKeys(project));
    if (folderId === null) {
      continue;
    }
    folderedProjectKeys.add(project.projectKey);
    const existing = projectsByFolderId.get(folderId);
    if (existing) {
      existing.push(project);
    } else {
      projectsByFolderId.set(folderId, [project]);
    }
  }
  return {
    folderViews: input.folders.map((folder) => ({
      folder,
      projects: projectsByFolderId.get(folder.id) ?? [],
    })),
    folderedProjectKeys,
  };
}
