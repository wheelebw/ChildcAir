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
  alertsSummary: AlertsSummary;
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
  relatedEntity?: { type: string; id: string } | null;
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

export type CustomListItem = {
  id: string;
  siteId: string;
  listKey: string;
  value: string;
  label: string;
  active: boolean;
  sortOrder: number;
  systemDefault: boolean;
};

export type AlertSeverity = "critical" | "important" | "warning" | "reminder" | "info";

export type AlertsSummary = {
  count: number;
  bySeverity: Partial<Record<AlertSeverity, number>>;
};

export type AttendanceStatus = "checked_in" | "checked_out" | "not_checked_in";

export type ClassroomAttendanceCounts = {
  checked_in: number;
  checked_out: number;
  not_checked_in: number;
};

export type Classroom = {
  id: string;
  siteId: string;
  name: string;
  status: string;
  sortOrder: number;
  attendance: ClassroomAttendanceCounts;
};

export type ClassroomAttendanceStudent = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  defaultClassroomId: string;
  status: string;
  attendance: {
    status: AttendanceStatus;
    timestamp: string;
    eventId: string;
  };
  alertsSummary: AlertsSummary;
};

export type ClassroomAttendance = {
  classroom: Classroom;
  students: ClassroomAttendanceStudent[];
};

export type AttendancePayload = {
  studentIds: string[];
  classroomId: string;
  timestamp?: string;
  notes?: string;
};

export type ActivityPayload = AttendancePayload & {
  activityType: string;
};

export type MealPayload = AttendancePayload & {
  mealType: string;
};

export type CarePayload = AttendancePayload & {
  careType: string;
};

export type IncidentSeverity = "minor" | "moderate" | "major";
export type IncidentStatus = "open" | "resolved" | "closed";
export type ParentNotificationMethod = "none" | "email" | "sms" | "phone" | "in_person" | "app" | "other";

export type Incident = {
  id: string;
  siteId: string;
  studentId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
  incidentType: string;
  incidentTypeLabel: string;
  severity: IncidentSeverity;
  location: string;
  locationLabel: string;
  otherLocation: string;
  occurredAt: string;
  description: string;
  actionTaken: string;
  staffWitnesses: string[];
  parentNotified: boolean;
  parentNotificationMethod: ParentNotificationMethod;
  status: IncidentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type IncidentPayload = {
  studentId: string;
  classroomId: string;
  incidentType: string;
  severity: IncidentSeverity;
  location: string;
  otherLocation: string;
  occurredAt: string;
  description: string;
  actionTaken: string;
  staffWitnesses: string[];
  parentNotified: boolean;
  parentNotificationMethod: ParentNotificationMethod;
  status: IncidentStatus;
};

export type StudentDocumentStatus = "missing" | "received" | "expired" | "not_required";

export type StudentDocument = {
  id: string;
  siteId: string;
  studentId: string;
  documentType: string;
  documentTypeLabel: string;
  status: StudentDocumentStatus;
  title: string;
  receivedAt: string;
  expiresAt: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type StudentDocumentPayload = {
  documentType: string;
  status: StudentDocumentStatus;
  title: string;
  receivedAt: string | null;
  expiresAt: string | null;
  notes: string;
};

export type StudentAlert = {
  id?: string;
  source: "profile" | "document" | "manual";
  type: string;
  severity: AlertSeverity;
  label: string;
  message: string;
  relatedEntity?: { type: string; id: string };
};

export type ManualStudentAlert = {
  id: string;
  siteId: string;
  studentId: string;
  severity: AlertSeverity;
  label: string;
  message: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ManualStudentAlertPayload = {
  severity: AlertSeverity;
  label: string;
  message: string;
  active?: boolean;
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

async function apiRequestNoContent(path: string, idToken: string, init: RequestInit = {}) {
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

export function listCustomListItems(idToken: string, listKey: string) {
  return apiRequest<CustomListItem[]>(`/custom-lists/${encodeURIComponent(listKey)}`, idToken);
}

export function listClassrooms(idToken: string) {
  return apiRequest<Classroom[]>("/classrooms", idToken);
}

export function getClassroomAttendance(idToken: string, classroomId: string) {
  return apiRequest<ClassroomAttendance>(`/classrooms/${classroomId}/attendance`, idToken);
}

export function checkInStudents(idToken: string, payload: AttendancePayload) {
  return apiRequest<ChildcAirEvent>("/attendance/check-in", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function checkOutStudents(idToken: string, payload: AttendancePayload) {
  return apiRequest<ChildcAirEvent>("/attendance/check-out", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function logActivity(idToken: string, payload: ActivityPayload) {
  return apiRequest<ChildcAirEvent>("/activities", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function logMeal(idToken: string, payload: MealPayload) {
  return apiRequest<ChildcAirEvent>("/meals", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function startNap(idToken: string, payload: AttendancePayload) {
  return apiRequest<ChildcAirEvent>("/naps/start", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function endNap(idToken: string, payload: AttendancePayload) {
  return apiRequest<ChildcAirEvent>("/naps/end", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function logCare(idToken: string, payload: CarePayload) {
  return apiRequest<ChildcAirEvent>("/care", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listIncidents(idToken: string) {
  return apiRequest<Incident[]>("/incidents", idToken);
}

export function createIncident(idToken: string, payload: IncidentPayload) {
  return apiRequest<Incident>("/incidents", idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getIncident(idToken: string, incidentId: string) {
  return apiRequest<Incident>(`/incidents/${incidentId}`, idToken);
}

export function updateIncident(idToken: string, incidentId: string, payload: IncidentPayload) {
  return apiRequest<Incident>(`/incidents/${incidentId}`, idToken, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function listStudentIncidents(idToken: string, studentId: string) {
  return apiRequest<Incident[]>(`/students/${studentId}/incidents`, idToken);
}

export function listStudentDocuments(idToken: string, studentId: string) {
  return apiRequest<StudentDocument[]>(`/students/${studentId}/documents`, idToken);
}

export function createStudentDocument(idToken: string, studentId: string, payload: StudentDocumentPayload) {
  return apiRequest<StudentDocument>(`/students/${studentId}/documents`, idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateStudentDocument(idToken: string, documentId: string, payload: StudentDocumentPayload) {
  return apiRequest<StudentDocument>(`/documents/${documentId}`, idToken, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteStudentDocument(idToken: string, documentId: string) {
  return apiRequestNoContent(`/documents/${documentId}`, idToken, {
    method: "DELETE"
  });
}

export function listStudentAlerts(idToken: string, studentId: string) {
  return apiRequest<StudentAlert[]>(`/students/${studentId}/alerts`, idToken);
}

export function listManualStudentAlerts(idToken: string, studentId: string) {
  return apiRequest<ManualStudentAlert[]>(`/students/${studentId}/manual-alerts`, idToken);
}

export function createManualStudentAlert(idToken: string, studentId: string, payload: ManualStudentAlertPayload) {
  return apiRequest<ManualStudentAlert>(`/students/${studentId}/manual-alerts`, idToken, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateManualStudentAlert(idToken: string, alertId: string, payload: Partial<ManualStudentAlertPayload>) {
  return apiRequest<ManualStudentAlert>(`/student-alerts/${alertId}`, idToken, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
