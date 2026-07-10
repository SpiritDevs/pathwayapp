export const CONNECT_HEALTH_ROUTE = "/health";
export const CONNECT_LIST_ENVIRONMENTS_ROUTE = "/v1/environments";
export const CONNECT_LIST_DEVICES_ROUTE = "/v1/client/devices";
export const CONNECT_ENVIRONMENT_LINKS_ROUTE = "/v1/client/environment-links";
export const CONNECT_ENVIRONMENT_LINK_CHALLENGES_ROUTE = "/v1/client/environment-link-challenges";
export const CONNECT_DPOP_TOKEN_ROUTE = "/v1/client/dpop-token";
export const CONNECT_MOBILE_DEVICES_ROUTE = "/v1/mobile/devices";
export const CONNECT_MOBILE_LIVE_ACTIVITIES_ROUTE = "/v1/mobile/live-activities";
export const CONNECT_CLOUD_SYNC_BATCH_ROUTE = "/v1/sync/batches";
export const CONNECT_CLOUD_SYNC_SNAPSHOT_ROUTE = "/v1/sync/snapshot";
export const CONNECT_EMAIL_CAPTURE_BATCH_ROUTE = "/v1/email/captures/batch";
export const CONNECT_EMAIL_SOURCE_BATCH_ROUTE = "/v1/email/sources/batch";
export const CONNECT_BLOB_PREPARE_ROUTE = "/v1/blobs/prepare";
export const CONNECT_BLOB_COMMIT_ROUTE = "/v1/blobs/commit";

export function connectEnvironmentStatusRoute(environmentId: string): string {
  return `/v1/environments/${environmentId}/status`;
}

export function connectEnvironmentRoute(environmentId: string): string {
  return `/v1/environments/${environmentId}/connect`;
}

export function publishAgentActivityRoute(environmentId: string, threadId: string): string {
  return `/v1/environments/${environmentId}/threads/${threadId}/agent-activity`;
}
