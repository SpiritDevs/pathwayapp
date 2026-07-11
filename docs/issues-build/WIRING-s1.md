# S1 wiring note

S1 wires `IssueDelegationServiceUnavailableLive` because this worktree contains only the frozen
delegation service tag. The stub reports an empty queue, reads `maxConcurrent` from server settings,
marks headroom unavailable, and performs no startup work.

When the S3 implementation lands, replace the stub layer in `apps/server/src/server.ts` with the
real `IssueDelegationService` Live layer at the adjacent `// WIRING:` comment.
