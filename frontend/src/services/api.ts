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
    items: ClassroomSummary[];
  };
};

export type ClassroomSummary = {
  id: string;
  name: string;
};

export type Guardian = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  preferredMethod: "email" | "sms" | "phone";
  emailOptIn: boolean;
  smsOptIn: boolean;
  primary: boolean;
};

export type Student = {
  id: string;
  siteId: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  birthdate: string;
  status: "active" | "inactive" | "future_enrollment" | "withdrawn" | "graduated";
  defaultClassroomId: string;
  allergies: string[];
  medicalNotes: string;
  guardians: Guardian[];
  authorizedPickup: Record<string, unknown>[];
  custom: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StudentPayload = {
  firstName: string;
  lastName: string;
  preferredName: string;
  birthdate: string | null;
  status: Student["status"];
  defaultClassroomId: string;
  allergies: string[];
  medicalNotes: string;
  guardians: Guardian[];
};

export type ChildcAirEvent = {
  id: string;
  siteId: string;
  eventType: string;
  studentIds: string[];
  classroomId: string;
  timestamp: string;
  createdBy: string;
  notes: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EventPayload = {
  eventType: string;
  studentIds: string[];
  classroomId?: string;
  timestamp?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
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

async function apiRequest<T>(path: string, idToken: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const body = (await response.json()) as { detail?: string };
      message = body.detail || message;
    } catch {
      // Keep the generic message when the backend does not return JSON.
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function listStudents(idToken: string) {
  return apiRequest<Student[]>("/students", idToken);
}

export function getStudent(idToken: string, studentId: string) {
  return apiRequest<Student>(`/students/${studentId}`, idToken);
}

export function createStudent(idToken: string, payload: StudentPayload) {
  return apiRequest<Student>("/students", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateStudent(idToken: string, studentId: string, payload: StudentPayload) {
  return apiRequest<Student>(`/students/${studentId}`, idToken, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function listStudentEvents(idToken: string, studentId: string) {
  return apiRequest<ChildcAirEvent[]>(`/students/${studentId}/events`, idToken);
}

export function createEvent(idToken: string, payload: EventPayload) {
  return apiRequest<ChildcAirEvent>("/events", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
