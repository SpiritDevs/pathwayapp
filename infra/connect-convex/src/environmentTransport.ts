async function postJson(
  url: string,
  body: unknown,
  fetchImplementation: typeof fetch,
): Promise<unknown> {
  const response = await fetchImplementation(url, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`ENVIRONMENT_REQUEST_FAILED_${response.status}`);
  return await response.json();
}

export function requestEnvironmentCredential(
  httpBaseUrl: string,
  proof: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<unknown> {
  return postJson(
    new URL("/api/pathwayos-connect/mint-credential", httpBaseUrl).toString(),
    { proof },
    fetchImplementation,
  );
}

export function requestEnvironmentHealth(
  httpBaseUrl: string,
  proof: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<unknown> {
  return postJson(
    new URL("/api/pathwayos-connect/health", httpBaseUrl).toString(),
    { proof },
    fetchImplementation,
  );
}
