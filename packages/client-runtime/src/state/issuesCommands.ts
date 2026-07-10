import {
  WS_METHODS,
  type EnvironmentId,
  type IssueCommand,
} from "@pathwayos/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

type IssueCommandType = IssueCommand["type"];
type IssueCommandOfType<T extends IssueCommandType> = Extract<IssueCommand, { readonly type: T }>;
type IssueCommandInput<T extends IssueCommandType> = Omit<IssueCommandOfType<T>, "type">;

export interface IssueCommandTarget<T extends IssueCommandType> {
  readonly environmentId: EnvironmentId;
  readonly input: IssueCommandInput<T>;
}

export function createIssuesEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const execute = createEnvironmentRpcCommand(runtime, {
    label: "environment-data:issues:execute",
    tag: WS_METHODS.issuesExecute,
  });

  const command = <T extends IssueCommandType>(type: T) => ({
    label: `environment-data:issues:${type}`,
    run: (
      registry: Parameters<typeof execute.run>[0],
      target: IssueCommandTarget<T>,
    ) =>
      execute.run(registry, {
        environmentId: target.environmentId,
        input: {
          command: { type, ...target.input } as IssueCommandOfType<T>,
        },
      }),
  });

  return {
    execute,
    createIssue: command("issue.create"),
    updateIssue: command("issue.update"),
    moveTeam: command("issue.moveTeam"),
    deleteIssue: command("issue.delete"),
    restoreIssue: command("issue.restore"),
    purgeIssue: command("issue.purge"),
    startWork: command("issue.startWork"),
    createComment: command("comment.create"),
    updateComment: command("comment.update"),
    deleteComment: command("comment.delete"),
    toggleReaction: command("reaction.toggle"),
    createRelation: command("relation.create"),
    deleteRelation: command("relation.delete"),
    linkThread: command("threadLink.create"),
    unlinkThread: command("threadLink.delete"),
    createTeam: command("team.create"),
    updateTeam: command("team.update"),
    deleteTeam: command("team.delete"),
    addTeamMember: command("team.memberAdd"),
    removeTeamMember: command("team.memberRemove"),
    createState: command("state.create"),
    updateState: command("state.update"),
    deleteState: command("state.delete"),
    createLabel: command("label.create"),
    updateLabel: command("label.update"),
    deleteLabel: command("label.delete"),
    updateCycle: command("cycle.update"),
    createEpic: command("epic.create"),
    updateEpic: command("epic.update"),
    deleteEpic: command("epic.delete"),
    createMilestone: command("milestone.create"),
    updateMilestone: command("milestone.update"),
    deleteMilestone: command("milestone.delete"),
    createView: command("view.create"),
    updateView: command("view.update"),
    deleteView: command("view.delete"),
    createAgent: command("agent.create"),
    updateAgent: command("agent.update"),
    deleteAgent: command("agent.delete"),
    updateWorkspace: command("workspace.update"),
    delegationState: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:delegation-state",
      tag: WS_METHODS.issuesDelegationState,
      staleTimeMs: 2_000,
      refreshIntervalMs: 5_000,
    }),
  };
}
