const DNS_LABEL_MAX_LENGTH = 63;
const HASH_LENGTH = 16;
const DEFAULT_NAMESPACE = "pathwayos";

function normalizeDnsName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/gu, "");
}

export function providerNamespace(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_NAMESPACE)
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-")
    .replaceAll(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (normalized.length === 0) return DEFAULT_NAMESPACE;
  return normalized;
}

function dnsLabel(prefix: string, suffix: string): string {
  const safePrefix = prefix.slice(0, DNS_LABEL_MAX_LENGTH - suffix.length - 1).replace(/-+$/gu, "");
  return `${safePrefix}-${suffix}`;
}

export async function cloudflareAllocationNames(input: {
  readonly namespace?: string;
  readonly baseDomain: string;
  readonly ownerUserId: string;
  readonly environmentId: string;
}): Promise<{ readonly hostname: string; readonly tunnelName: string }> {
  const namespace = providerNamespace(input.namespace);
  const digestInput = `${namespace}:${input.ownerUserId}:${input.environmentId}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(digestInput));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_LENGTH);
  const label = dnsLabel(namespace, hash);
  return {
    hostname: `${label}.${normalizeDnsName(input.baseDomain)}`,
    tunnelName: `pathwayos-${label}`,
  };
}

export function cloudflareOriginService(origin: {
  readonly localHttpHost: string;
  readonly localHttpPort: number;
}): string {
  const normalizedHost = origin.localHttpHost
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, "$1");
  if (
    !["127.0.0.1", "::1", "localhost"].includes(normalizedHost) ||
    !Number.isInteger(origin.localHttpPort) ||
    origin.localHttpPort < 1 ||
    origin.localHttpPort > 65_535
  ) {
    throw new Error("CLOUDFLARE_ORIGIN_NOT_ALLOWED");
  }
  const host = normalizedHost.includes(":") ? `[${normalizedHost}]` : normalizedHost;
  return `http://${host}:${origin.localHttpPort}`;
}

export function cloudflareEndpoint(hostname: string): {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly providerKind: "cloudflare_tunnel";
} {
  const normalized = normalizeDnsName(hostname);
  return {
    httpBaseUrl: `https://${normalized}/`,
    wsBaseUrl: `wss://${normalized}/ws`,
    providerKind: "cloudflare_tunnel",
  };
}

export function redactCloudflareError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/(?:Bearer\s+)?[A-Za-z0-9._~-]{24,}/gu, "<redacted>");
  }
  return "Cloudflare provider request failed.";
}

export interface CloudflareProviderConfig {
  readonly accountId: string;
  readonly zoneId: string;
  readonly apiToken: string;
  readonly baseDomain: string;
  readonly namespace?: string;
}

export function cloudflareProviderConfig(
  environment: Readonly<Record<string, string | undefined>>,
): CloudflareProviderConfig {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID?.trim();
  const zoneId = environment.CLOUDFLARE_ZONE_ID?.trim();
  const apiToken = environment.CLOUDFLARE_API_TOKEN?.trim();
  const baseDomain = environment.PATHWAYOS_REMOTE_BASE_DOMAIN?.trim();
  if (!accountId || !zoneId || !apiToken || !baseDomain) {
    throw new Error("CLOUDFLARE_PROVIDER_NOT_CONFIGURED");
  }
  return {
    accountId,
    zoneId,
    apiToken,
    baseDomain,
    ...(environment.PATHWAYOS_REMOTE_NAMESPACE
      ? { namespace: environment.PATHWAYOS_REMOTE_NAMESPACE }
      : {}),
  };
}

interface CloudflareEnvelope<A> {
  readonly success: boolean;
  readonly result: A;
}

async function request<A>(
  config: CloudflareProviderConfig,
  operation: string,
  path: string,
  init: RequestInit,
  fetchImplementation: typeof fetch,
  allowNotFound = false,
): Promise<A | null> {
  const response = await fetchImplementation(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.apiToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`CLOUDFLARE_${operation.toUpperCase()}_FAILED_${response.status}`);
  const payload = (await response.json()) as CloudflareEnvelope<A>;
  if (!payload.success) throw new Error(`CLOUDFLARE_${operation.toUpperCase()}_FAILED`);
  return payload.result;
}

export async function provisionCloudflareTunnel(
  input: {
    readonly config: CloudflareProviderConfig;
    readonly origin: { readonly localHttpHost: string; readonly localHttpPort: number };
    readonly hostname: string;
    readonly tunnelName: string;
    readonly preferredTunnelId: string | null;
    readonly preferredDnsRecordId: string | null;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ tunnelId: string; dnsRecordId: string; connectorToken: string }> {
  type Tunnel = { readonly id: string; readonly name: string };
  const listed = await request<ReadonlyArray<Tunnel>>(
    input.config,
    "list_tunnels",
    `/accounts/${input.config.accountId}/cfd_tunnel?name=${encodeURIComponent(input.tunnelName)}&is_deleted=false`,
    {},
    fetchImplementation,
  );
  let tunnel = listed?.find((candidate) => candidate.id === input.preferredTunnelId) ?? listed?.[0];
  tunnel ??= (await request<Tunnel>(
    input.config,
    "create_tunnel",
    `/accounts/${input.config.accountId}/cfd_tunnel`,
    { method: "POST", body: JSON.stringify({ name: input.tunnelName, config_src: "cloudflare" }) },
    fetchImplementation,
  ))!;
  await request(
    input.config,
    "configure_tunnel",
    `/accounts/${input.config.accountId}/cfd_tunnel/${tunnel.id}/configurations`,
    {
      method: "PUT",
      body: JSON.stringify({
        config: {
          ingress: [
            { hostname: input.hostname, service: cloudflareOriginService(input.origin) },
            { service: "http_status:404" },
          ],
        },
      }),
    },
    fetchImplementation,
  );
  type DnsRecord = { readonly id: string };
  const records = await request<ReadonlyArray<DnsRecord>>(
    input.config,
    "list_dns",
    `/zones/${input.config.zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(input.hostname)}`,
    {},
    fetchImplementation,
  );
  const preferred =
    records?.find((record) => record.id === input.preferredDnsRecordId) ?? records?.[0];
  const recordBody = JSON.stringify({
    type: "CNAME",
    name: input.hostname,
    content: `${tunnel.id}.cfargotunnel.com`,
    ttl: 1,
    proxied: true,
  });
  const dnsRecord = preferred
    ? ((await request<DnsRecord>(
        input.config,
        "update_dns",
        `/zones/${input.config.zoneId}/dns_records/${preferred.id}`,
        { method: "PUT", body: recordBody },
        fetchImplementation,
      )) ?? preferred)
    : (await request<DnsRecord>(
        input.config,
        "create_dns",
        `/zones/${input.config.zoneId}/dns_records`,
        { method: "POST", body: recordBody },
        fetchImplementation,
      ))!;
  const connectorToken = await request<string>(
    input.config,
    "get_tunnel_token",
    `/accounts/${input.config.accountId}/cfd_tunnel/${tunnel.id}/token`,
    {},
    fetchImplementation,
  );
  if (!connectorToken) throw new Error("CLOUDFLARE_TUNNEL_TOKEN_MISSING");
  return { tunnelId: tunnel.id, dnsRecordId: dnsRecord.id, connectorToken };
}

export async function deprovisionCloudflareTunnel(
  input: {
    readonly config: CloudflareProviderConfig;
    readonly tunnelId: string | null;
    readonly dnsRecordId: string | null;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  if (input.dnsRecordId) {
    await request(
      input.config,
      "delete_dns",
      `/zones/${input.config.zoneId}/dns_records/${input.dnsRecordId}`,
      { method: "DELETE" },
      fetchImplementation,
      true,
    );
  }
  if (input.tunnelId) {
    await request(
      input.config,
      "delete_tunnel",
      `/accounts/${input.config.accountId}/cfd_tunnel/${input.tunnelId}`,
      { method: "DELETE" },
      fetchImplementation,
      true,
    );
  }
}
