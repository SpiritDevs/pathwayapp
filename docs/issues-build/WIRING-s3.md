# S3 integration wiring

S3 deliberately does not edit the shared composition files. After the S1 issues mirror/gateway
changes are present, the integration pass must make the following additions.

## `apps/server/src/server.ts`

Add the S3 imports:

```ts
import { IssueDelegationServiceLive } from "./issues/delegation/IssueDelegationServiceLive.ts";
import { SystemHeadroomLive } from "./issues/delegation/SystemHeadroom.ts";
```

Delete the temporary/stub `IssueDelegationService` layer supplied by S1. Compose the live service
against the S1 `IssuesGateway` live layer and the existing runtime core:

```ts
const IssueDelegationLive = IssueDelegationServiceLive.pipe(
  Layer.provide(SystemHeadroomLive),
  Layer.provide(IssuesGatewayLive),
  Layer.provide(RuntimeCoreBaseLive),
);
```

Here `IssuesGatewayLive` means the concrete S1 layer already used to satisfy the issues RPC
handlers and mirror worker; retain its actual local symbol if S1 names it differently. Add the new
service alongside the gateway/mirror layers in `RuntimeCoreDependenciesLive`:

```ts
const RuntimeCoreDependenciesLive = Layer.mergeAll(
  RuntimeCoreBaseLive,
  IssuesGatewayLive,
  IssuesMirrorWorkerLive,
  IssueDelegationLive,
  CloudSyncWorkerLive,
  EmailSandboxLive.pipe(Layer.provide(RuntimeCoreBaseLive)),
  EmailSandboxSyncWorkerLive,
);
```

Do not leave the stub merged as well: the RPC handler and startup service must resolve this live
instance.

## `apps/server/src/serverRuntimeStartup.ts`

Add imports beside the other worker/reactor service imports:

```ts
import * as IssuesMirrorWorker from "./issues/IssuesMirrorWorker.ts";
import * as IssueDelegationService from "./issues/delegation/IssueDelegationService.ts";
```

In `make`, resolve the services beside `cloudSyncWorker` and `emailSandboxSyncWorker`:

```ts
const issuesMirrorWorker = yield* IssuesMirrorWorker.IssuesMirrorWorker;
const issueDelegationService = yield* IssueDelegationService.IssueDelegationService;
```

In the existing `reactors.start` phase, start delegation immediately after the issues mirror worker
so its startup rebuild reads the initialized mirror snapshot:

```ts
yield* orchestrationReactor.start().pipe(Scope.provide(reactorScope));
yield* providerSessionReaper.start().pipe(Scope.provide(reactorScope));
yield* cloudSyncWorker.start().pipe(Scope.provide(reactorScope));
yield* emailSandboxSyncWorker.start().pipe(Scope.provide(reactorScope));
yield* issuesMirrorWorker.start().pipe(Scope.provide(reactorScope));
yield* issueDelegationService.start().pipe(Scope.provide(reactorScope));
```

If S1 already placed `issuesMirrorWorker.start()` earlier in this phase, keep that line in place and
insert only the delegation line directly after it.
