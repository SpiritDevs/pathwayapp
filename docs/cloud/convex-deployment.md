# pathwayOS Connect Convex Deployment

This document covers deploying `infra/connect-convex`, the Convex backend for the email sandbox
cloud sync feature and the Convex-native Connect control plane. For Clerk application setup and
client key distribution, see [pathwayOS Connect Clerk Setup](./pathwayos-connect-clerk.md).

## Convex Deployment Environment Variables

Set these on the Convex deployment with `bunx convex env set <NAME> <value>` from
`infra/connect-convex`, or through the Convex dashboard.

| Variable                                                                                              | Required               | Default                      | Effect when missing                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN`                                                                             | Yes                    | none                         | `convex deploy` fails: `convex/auth.config.ts` throws at deploy time.                                                                                                                                       |
| `PATHWAYOS_CLOUD_MINT_PRIVATE_KEY`                                                                    | Yes                    | none                         | Connect token endpoints return `CONNECT_AUTH_NOT_CONFIGURED`.                                                                                                                                               |
| `PATHWAYOS_CLOUD_MINT_PUBLIC_KEY`                                                                     | Yes                    | none                         | Same as above.                                                                                                                                                                                              |
| `UPLOADTHING_TOKEN`                                                                                   | For attachment sync    | none                         | `/v1/blobs/prepare` returns `503 UPLOADTHING_NOT_CONFIGURED`, attachment downloads return `unavailable` with reason `uploadthing-not-configured`, and the hourly blob cleanup defers all pending deletions. |
| `CLERK_JWT_AUDIENCE`                                                                                  | No                     | unset                        | The Clerk token audience check is skipped.                                                                                                                                                                  |
| `PATHWAYOS_CONNECT_URL`                                                                               | No                     | Convex-provided `CONVEX_URL` | Token issuer falls back to the realtime `.convex.cloud` origin. Set it explicitly to the HTTP Actions origin (`https://<deployment>.convex.site`). Must be `https`.                                         |
| `RESEND_API_KEY` + `PATHWAYOS_INVITE_FROM_EMAIL`                                                      | No                     | unset                        | Invitation email delivery reports `not_configured`. Copyable invite links still work. Both must be set together.                                                                                            |
| `PATHWAYOS_APP_URL`                                                                                   | No                     | `http://localhost:5733`      | Invitation links point at localhost. Set to the hosted web app origin.                                                                                                                                      |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `PATHWAYOS_REMOTE_BASE_DOMAIN` | For remote access only | none                         | Remote-access tunnel provisioning fails with `CLOUDFLARE_PROVIDER_NOT_CONFIGURED`. Login, sync, and email features are unaffected.                                                                          |
| `PATHWAYOS_REMOTE_NAMESPACE`                                                                          | No                     | unset                        | Tunnel and DNS names derive without a namespace prefix.                                                                                                                                                     |

The Clerk JWKS are fetched at runtime from
`${CLERK_JWT_ISSUER_DOMAIN}/.well-known/jwks.json`; there is no separate JWKS variable. The mint
key PEM values accept either real newlines or literal `\n` escapes — escapes are unescaped at
runtime, so a single-line dashboard paste works.

## One-Time Setup

### 1. Clerk JWT template

Follow [pathwayOS Connect Clerk Setup](./pathwayos-connect-clerk.md#jwt-template): create a JWT
template whose name matches `PATHWAYOS_CLERK_JWT_TEMPLATE` (for example `pathwayos-relay`). Set
`CLERK_JWT_ISSUER_DOMAIN` to the Clerk instance's Frontend API origin, and `CLERK_JWT_AUDIENCE` to
the template's `aud` claim if one is configured.

### 2. Ed25519 mint keypair

The Connect control plane signs DPoP-bound access tokens and environment mint/health proofs with
an Ed25519 keypair. Generate PKCS8 private and SPKI public PEMs:

```sh
openssl genpkey -algorithm ed25519 -out pathwayos-mint-private.pem
openssl pkey -in pathwayos-mint-private.pem -pubout -out pathwayos-mint-public.pem
```

Set them on the Convex deployment:

```sh
cd infra/connect-convex
bunx convex env set PATHWAYOS_CLOUD_MINT_PRIVATE_KEY -- "$(cat pathwayos-mint-private.pem)"
bunx convex env set PATHWAYOS_CLOUD_MINT_PUBLIC_KEY -- "$(cat pathwayos-mint-public.pem)"
```

When pasting into the dashboard instead, replace newlines with literal `\n`. The private key is a
secret; do not commit it or place it in any client environment.

### 3. UploadThing

Create an UploadThing app, generate an API token, and set it as `UPLOADTHING_TOKEN`. The token is
base64-encoded JSON containing `apiKey`, `appId`, `regions`, and `ingestHost`. Allow the `private`
ACL override in the UploadThing app settings.

There is no webhook or FileRouter integration. The Convex prepare endpoint pre-computes the file
key with Sqids, signs a short-lived private ingest URL (`x-ut-acl: private`), the source uploads
directly to that URL, and then commits the key via `POST /v1/blobs/commit`. Downloads use signed
`https://<appId>.ufs.sh/f/<key>` URLs with a five-minute expiry.

### 4. Resend (optional)

For invitation email delivery, create a Resend API key and verify a sender address or domain. Set
`RESEND_API_KEY` and `PATHWAYOS_INVITE_FROM_EMAIL`. Without both, invitation creation still
returns a working `inviteUrl` and reports delivery status `not_configured`.

### 5. Cloudflare (optional, remote access only)

Only needed for the explicit per-environment **Remote access via Cloudflare** feature. Set
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `PATHWAYOS_REMOTE_BASE_DOMAIN`, and a
least-privilege `CLOUDFLARE_API_TOKEN` scoped to Cloudflare Tunnel and DNS edit on the target zone.
Signing in or enabling sync never creates a tunnel.

### 6. Deploy

```sh
cd infra/connect-convex
vp run deploy
```

The `deploy` script runs `convex deploy`, which pushes functions, registers the cron jobs below,
and evaluates `convex/auth.config.ts` (failing fast if `CLERK_JWT_ISSUER_DOMAIN` is unset). CI
deploys should authenticate with a Convex deploy key rather than user-local credentials.

Run `vp run codegen` before building consumers: the package exports `convex/_generated/api.js` and
`convex/_generated/dataModel.d.ts`, so `convex/_generated` must exist before dependent packages
typecheck or build.

## Client And Build Configuration

Clients need `PATHWAYOS_CONVEX_URL` (realtime `https://<deployment>.convex.cloud`) and
`PATHWAYOS_CONNECT_URL` (HTTP Actions `https://<deployment>.convex.site`) plus the Clerk
publishable key and JWT template name. Both URLs are optional; client capabilities are gated when
they are absent. The canonical `PATHWAYOS_*` values fan out to `VITE_*` and `EXPO_PUBLIC_*` aliases
through the shared loader — see
[pathwayOS Connect Clerk Setup](./pathwayos-connect-clerk.md#application-keys) for the full
precedence and capability-gating rules, and the repository-root `.env.example` for examples.

Release builds read `PATHWAYOS_CONNECT_URL` and `PATHWAYOS_CONVEX_URL` from GitHub repository
variables in `.github/workflows/release.yml`.

The local email sandbox itself needs no cloud configuration: the bundled server auto-downloads
Mailpit v1.30.4 with pinned per-platform checksums, binds SMTP and the API to loopback
(`127.0.0.1`) only, and stores messages at `<stateDir>/email-sandbox/mailpit.db`. Set
`PATHWAYOS_MAILPIT_PATH` to use a pre-installed Mailpit binary instead of the managed download.

## Scheduled Jobs

`convex deploy` registers these crons automatically (`convex/crons.ts`):

| Schedule        | Name                                    | Function                      |
| --------------- | --------------------------------------- | ----------------------------- |
| Daily 03:20 UTC | enforce email sandbox retention         | `email:cleanupAll`            |
| Hourly at :35   | delete private blobs marked for removal | `blobActions:cleanupDeleting` |

Blob cleanup calls the UploadThing delete API and marks references deleted only on success;
failures and a missing `UPLOADTHING_TOKEN` defer deletion to the next run.

## HTTP Endpoints

The HTTP Actions origin (`https://<deployment>.convex.site`, `convex/http.ts`) serves:

| Method | Path                                                            | Auth                             |
| ------ | --------------------------------------------------------------- | -------------------------------- |
| GET    | `/health`                                                       | none                             |
| GET    | `/v1/environments`                                              | Clerk identity (Convex auth)     |
| POST   | `/v1/client/dpop-token`                                         | Clerk subject token + DPoP proof |
| POST   | `/v1/environments/{id}/connect`, `/v1/environments/{id}/status` | DPoP-bound access token          |
| POST   | `/v1/sync/batches`                                              | environment credential bearer    |
| GET    | `/v1/sync/snapshot`                                             | environment credential bearer    |
| POST   | `/v1/email/captures/batch`                                      | environment credential bearer    |
| POST   | `/v1/email/sources/batch`                                       | environment credential bearer    |
| POST   | `/v1/blobs/prepare`                                             | environment credential bearer    |
| POST   | `/v1/blobs/commit`                                              | environment credential bearer    |

Environment credentials are compared by SHA-256 hash; the raw credential is never stored in
Convex.

## Post-Deploy Smoke Test

Run this cross-device checklist after deploying:

1. `curl https://<deployment>.convex.site/health` returns `{"ok":true,"service":"connect-convex"}`.
2. Sign in with the same Clerk account on two pathwayOS installs pointed at the deployment.
3. On device A, enable the email sandbox in Settings and enable capture for a project. Copy the
   project's SMTP address (`127.0.0.1:<port>`) from **Project SMTP Sources**.
4. Send a test message with an attachment to that port:

   ```sh
   swaks --server 127.0.0.1:<port> --from dev@example.test --to app@project.test \
     --header "Subject: Smoke test" --body "hello" --attach @photo.png
   ```

   Without swaks, curl also speaks SMTP:

   ```sh
   curl smtp://127.0.0.1:<port> --mail-from dev@example.test --mail-rcpt app@project.test \
     -T message.eml
   ```

5. Confirm the message appears in `/email` on device A.
6. Confirm the message syncs and appears in `/email` on device B.
7. Open the attachment on device B; it must download through a signed UploadThing URL.
8. On device A, clear the local cache from Settings; synced messages must remain visible.
9. Clear synced history from `/email`; the messages disappear on both devices and the attachment
   blob is marked for deletion (removed by the hourly cleanup cron).
10. If Resend is configured, invite a test address to a workspace and confirm delivery status
    `sent` and that the emailed invite link resolves against `PATHWAYOS_APP_URL`.
11. If Cloudflare is configured, toggle **Remote access via Cloudflare** for one environment in
    Connections and confirm it reaches the `ready` state, then disable it.
