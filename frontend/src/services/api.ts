const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export type AppContext = {
  user: {
    email: string;
    firebaseUid: string;
    roles: string[];
  };
  site: {
    siteId: string;
    name: string;
    status: string;
    timezone: string;
  } | null;
  classrooms: {
    count: number;
  };
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function getHealthStatus() {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error("Health check failed");
  }

  return response.json() as Promise<{ status: "ok" | "error"; database: "connected" | "unavailable" }>;
}

export async function bootstrapMe(idToken: string) {
  const response = await fetch(`${API_BASE_URL}/bootstrap/me`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  if (!response.ok) {
    let message = "Unable to load your ChildcAir context.";

    try {
      const body = (await response.json()) as { detail?: string };
      message = body.detail || message;
    } catch {
      // Keep the generic message when the backend does not return JSON.
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<AppContext>;
}
