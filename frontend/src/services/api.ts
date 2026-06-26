export async function getHealthStatus() {
  const response = await fetch("/health");

  if (!response.ok) {
    throw new Error("Health check failed");
  }

  return response.json() as Promise<{ status: "ok" }>;
}
