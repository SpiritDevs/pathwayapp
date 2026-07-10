# S2 integration wiring

`IssuesToolkitRegistrationLive` deliberately leaves `IssuesGateway` as an ambient layer
requirement, alongside the projection query and server settings services required by
`AgentActorResolver`. The current S2 worktree contains only the `IssuesGateway` service seam;
the integration pass must ensure the S1 live gateway layer is provided to `McpHttpServer.layer`
through the server runtime graph. No `server.ts` change was made because S2 does not own it.
