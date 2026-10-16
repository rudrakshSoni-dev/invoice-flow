export type Health = { status: 'ok'; database: 'up' };

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error(`Health check failed with ${response.status}`);
  return (await response.json()) as Health;
}
