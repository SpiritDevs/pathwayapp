import {
  createEnvironmentIssueDetailAtoms,
  createEnvironmentIssuesAtoms,
  createEnvironmentIssuesStateAtoms,
  createIssuesEnvironmentAtoms,
} from "@pathwayos/client-runtime/state/issues";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";

const environmentIssuesState = createEnvironmentIssuesStateAtoms(connectionAtomRuntime);

export const environmentIssues = createEnvironmentIssuesAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentIssuesState.snapshotAtom,
});
export const issueDetails = createEnvironmentIssueDetailAtoms(connectionAtomRuntime);
export const issuesEnvironment = createIssuesEnvironmentAtoms(connectionAtomRuntime);
export const environmentIssuesSnapshot = environmentIssuesState;
