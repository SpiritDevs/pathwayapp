# pathwayOS Connect Convex

This package is the Convex replacement path for the hosted pathwayOS Connect control plane.

The first implementation keeps Convex account and Connect state separate from remote transport
providers. Clerk plus Convex can support login, account/profile state, and sync features without
Cloudflare. Cloudflare Tunnel/DNS is treated as an optional remote endpoint provider and should only
be invoked when a user explicitly creates or enables a remote connection.

## Local Workflow

```sh
vp install
cd infra/connect-convex
vp run codegen
vp test run
vp run typecheck
```

Use `vp run dev` after the package is connected to a Convex project. Production deploys should use
Convex deploy keys in CI rather than user-local credentials. See
[pathwayOS Connect Convex Deployment](../../docs/cloud/convex-deployment.md) for the full
deployment configuration, one-time setup, and post-deploy smoke test.

Account bootstrap is also the tenancy bootstrap. The first authenticated `account.bootstrap` call
creates the user's personal workspace, its owner membership, and the active-workspace selection.
Team workspaces, membership administration, seven-day invitations, and portable preferences are
available from the `tenants`, `invitations`, and `preferences` Convex modules.

Invitation actions return a copyable `inviteUrl` and keep only a SHA-256 token hash in Convex. Set
`PATHWAYOS_APP_URL` to control the URL origin. Set both `RESEND_API_KEY` and
`PATHWAYOS_INVITE_FROM_EMAIL` to enable delivery; without both, delivery reports
`not_configured`. Raw invitation tokens are passed to that delivery boundary and never persisted.

Private email and chat blobs use UploadThing. Set `UPLOADTHING_TOKEN` in the Convex deployment and
allow the `private` ACL override in the UploadThing app. The authenticated prepare endpoint returns
a short-lived HMAC-signed private ingest URL and the pre-registered file key. The source uploads
directly to that URL and commits the key with the same environment credential. This HTTP boundary
intentionally avoids loading UploadThing's Effect 3 SDK into pathwayOS's Effect 4 runtime.

Set `PATHWAYOS_CONNECT_URL` to the Convex site URL for new deployments. Existing
`PATHWAYOS_RELAY_URL` and `VITE_PATHWAYOS_RELAY_URL` settings remain supported as compatibility
aliases while the current client runtime is migrated.

## Boundary Rule

Remote provider calls are out of scope for login, profile, account sync, local pairing, and ordinary
environment listing. Provider readiness belongs in Connections/Remote Access UI states.

All tenant resources should carry both `tenantId` and `ownerUserId`. Use the guards in
`convex/authorization.ts`: membership controls tenant visibility, while creator-owned resources
(including email sandboxes and environments) additionally require an exact `ownerUserId` match.

## Environment control plane

New web clients link environments through the `environmentLinks` Convex domain. Linking installs a
one-time, hash-at-rest environment credential into the local PathwayOS server for sync; it does not
provision or start a tunnel. The Connections page exposes a separate, explicit per-environment
**Remote access via Cloudflare** switch. Only that action calls the provider boundary.

Environment control records carry `tenantId` plus `ownerUserId`. Every list, status, provision,
deprovision, and remote-connect path requires the exact creator; team membership never grants remote
control over another member's environment. Cloudflare connector tokens are returned once to the
owning browser so it can configure the local managed runtime and are never written to Convex.

Configure these variables in the Convex deployment:

```text
PATHWAYOS_CONNECT_URL=https://<deployment>.convex.site
PATHWAYOS_CLOUD_MINT_PRIVATE_KEY=<Ed25519 PKCS8 PEM>
PATHWAYOS_CLOUD_MINT_PUBLIC_KEY=<Ed25519 SPKI PEM>
CLERK_JWT_ISSUER_DOMAIN=https://<clerk-instance>
CLERK_JWT_AUDIENCE=<optional configured audience>
CLOUDFLARE_ACCOUNT_ID=<account id>
CLOUDFLARE_ZONE_ID=<zone id>
CLOUDFLARE_API_TOKEN=<least-privilege tunnel and DNS token>
PATHWAYOS_REMOTE_BASE_DOMAIN=remote.example.com
PATHWAYOS_REMOTE_NAMESPACE=pathwayos
```

Provisioning is idempotent: tunnel and DNS names derive from the namespace, owner ID, and
environment ID. Provider state moves through provisioning/ready/failed and
deprovisioning/disabled. Errors are redacted before persistence, and deprovisioning treats already
removed Cloudflare resources as success.

The Convex HTTP Action origin implements environment listing and DPoP-bound status/connect flows
for the existing remote connection client. The legacy relay URL remains a compatibility alias for
older releases and the headless CLI path, but new browser linking, listing, provider allocation, and
runtime configuration no longer write to the relay database.
