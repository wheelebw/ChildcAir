import { FormEvent, useEffect, useMemo, useState } from "react";
import { IncidentLocationField } from "../components/IncidentLocationField";
import { useAuth } from "../context/AuthContext";
import {
  createIncident,
  getIncident,
  listClassrooms,
  listCustomListItems,
  listIncidents,
  listStudents,
  updateIncident,
  type Classroom,
  type CustomListItem,
  type Incident,
  type IncidentPayload,
  type IncidentSeverity,
  type IncidentStatus,
  type ParentNotificationMethod,
  type Student
} from "../services/api";

type ViewMode = "list" | "new" | "detail" | "edit";

type IncidentFormState = {
  studentId: string;
  classroomId: string;
  incidentType: string;
  severity: IncidentSeverity;
  location: string;
  otherLocation: string;
  occurredAt: string;
  description: string;
  actionTaken: string;
  staffWitnesses: string;
  parentNotified: boolean;
  parentNotificationMethod: ParentNotificationMethod;
  status: IncidentStatus;
};

const severityLabels: Record<IncidentSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major"
};

const notificationMethodLabels: Record<ParentNotificationMethod, string> = {
  none: "None",
  email: "Email",
  sms: "SMS",
  phone: "Phone",
  in_person: "In person",
  app: "App",
  other: "Other"
};

const statusLabels: Record<IncidentStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed"
};

export function IncidentsPage({
  initialStudentId = "",
  onBack,
  onIncidentSaved,
  startInNewMode = false
}: {
  initialStudentId?: string;
  onBack?: () => void;
  onIncidentSaved?: (incident: Incident) => void;
  startInNewMode?: boolean;
}) {
  const { appContext, currentUser } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<CustomListItem[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [mode, setMode] = useState<ViewMode>(startInNewMode ? "new" : "list");
  const [form, setForm] = useState<IncidentFormState>(() =>
    emptyForm(appContext?.site?.timezone || "America/Chicago", initialStudentId)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const siteTimezone = appContext?.site?.timezone || "America/Chicago";
  const studentNames = useMemo(() => Object.fromEntries(students.map((student) => [student.id, studentName(student)])), [students]);
  const classroomNames = useMemo(
    () => Object.fromEntries(classrooms.map((classroom) => [classroom.id, classroom.name])),
    [classrooms]
  );

  useEffect(() => {
    void loadPageData();
  }, [currentUser]);

  async function getToken() {
    if (!currentUser) {
      throw new Error("You must be signed in.");
    }

    return currentUser.getIdToken();
  }

  async function loadPageData() {
    if (!currentUser) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = await getToken();
      const [incidentList, studentList, classroomList, typeList] = await Promise.all([
        listIncidents(token),
        listStudents(token),
        listClassrooms(token),
        listCustomListItems(token, "incident_type")
      ]);
      setIncidents(incidentList);
      setStudents(studentList);
      setClassrooms(classroomList);
      setIncidentTypes(typeList);
    } catch (loadError) {
      setError(loadError instanceof Error ? `${loadError.message} Please try again.` : "Unable to load incidents. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openIncident(incidentId: string) {
    setError("");

    try {
      const token = await getToken();
      setSelectedIncident(await getIncident(token, incidentId));
      setMode("detail");
    } catch (loadError) {
      setError(loadError instanceof Error ? `${loadError.message} Please try again.` : "Unable to load incident. Please try again.");
    }
  }

  function startNewIncident() {
    setSelectedIncident(null);
    setForm(emptyForm(siteTimezone, initialStudentId));
    setMode("new");
    setError("");
  }

  function startEditIncident() {
    if (!selectedIncident) {
      return;
    }

    setForm(fromIncident(selectedIncident, siteTimezone));
    setMode("edit");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const token = await getToken();
      const payload = toPayload(form, siteTimezone);
      const savedIncident =
        mode === "edit" && selectedIncident
          ? await updateIncident(token, selectedIncident.id, payload)
          : await createIncident(token, payload);
      setSelectedIncident(savedIncident);
      setIncidents(await listIncidents(token));
      onIncidentSaved?.(savedIncident);
      setMode("detail");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save incident.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof IncidentFormState, value: string | boolean) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "location" && value !== "Other") {
        next.otherLocation = "";
      }

      if (field === "parentNotified" && value === false) {
        next.parentNotificationMethod = "none";
      }

      return next;
    });
  }

  if (mode === "new" || mode === "edit") {
    return (
      <IncidentForm
        classrooms={classrooms}
        error={error}
        form={form}
        incidentTypes={incidentTypes}
        mode={mode}
        onCancel={() => (startInNewMode && onBack ? onBack() : setMode(selectedIncident ? "detail" : "list"))}
        onChange={updateField}
        onSubmit={handleSubmit}
        saving={saving}
        students={students}
      />
    );
  }

  if (mode === "detail" && selectedIncident) {
    return (
      <IncidentDetail
        classroomName={selectedIncident.classroomName || classroomNames[selectedIncident.classroomId] || ""}
        incident={selectedIncident}
        onBack={() => setMode("list")}
        onEdit={startEditIncident}
        siteTimezone={siteTimezone}
        studentName={selectedIncident.studentName || studentNames[selectedIncident.studentId] || ""}
      />
    );
  }

  return (
    <section className="page">
      {onBack ? (
        <button className="text-button back-button" type="button" onClick={onBack}>
          Back
        </button>
      ) : null}
      <div className="page-header">
        <div>
          <p className="eyebrow">Records</p>
          <h1>Incidents</h1>
        </div>
        <button className="primary-button page-action" type="button" onClick={startNewIncident}>
          Add Incident
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="page-copy">Loading incidents...</p> : null}
      {!loading && incidents.length === 0 ? (
        <div className="empty-state">
          <h2>No incidents reported.</h2>
          <p>Create an incident report only when something needs a formal record.</p>
          <button className="primary-button" type="button" onClick={startNewIncident}>
            Add Incident
          </button>
        </div>
      ) : null}
      <div className="incident-list">
        {incidents.map((incident) => (
          <button className="incident-card" key={incident.id} type="button" onClick={() => openIncident(incident.id)}>
            <span>
              <strong>{incident.studentName || studentNames[incident.studentId] || "Student"}</strong>
              <small>
                {incident.incidentTypeLabel} / {locationLabel(incident)}
              </small>
              <small>{formatDateTime(incident.occurredAt, siteTimezone)}</small>
            </span>
            <span className="incident-meta">
              <span className="status-pill">{severityLabels[incident.severity]}</span>
              <span>{statusLabels[incident.status]}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function IncidentForm({
  classrooms,
  error,
  form,
  incidentTypes,
  mode,
  onCancel,
  onChange,
  onSubmit,
  saving,
  students
}: {
  classrooms: Classroom[];
  error: string;
  form: IncidentFormState;
  incidentTypes: CustomListItem[];
  mode: "new" | "edit";
  onCancel: () => void;
  onChange: (field: keyof IncidentFormState, value: string | boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  students: Student[];
}) {
  return (
    <section className="page">
      <p className="eyebrow">{mode === "edit" ? "Edit report" : "New report"}</p>
      <h1>{mode === "edit" ? "Edit Incident" : "Add Incident"}</h1>
      <form className="student-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Student</span>
          <select required value={form.studentId} onChange={(event) => onChange("studentId", event.target.value)}>
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {studentName(student)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Classroom</span>
          <select value={form.classroomId} onChange={(event) => onChange("classroomId", event.target.value)}>
            <option value="">No classroom</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Incident type</span>
          <select required value={form.incidentType} onChange={(event) => onChange("incidentType", event.target.value)}>
            <option value="">Select type</option>
            {incidentTypes.map((item) => (
              <option key={item.id} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Severity</span>
          <select value={form.severity} onChange={(event) => onChange("severity", event.target.value)}>
            {Object.entries(severityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <IncidentLocationField
          location={form.location}
          otherLocation={form.otherLocation}
          onLocationChange={(value) => onChange("location", value)}
          onOtherLocationChange={(value) => onChange("otherLocation", value)}
        />
        <label className="field">
          <span>Occurred</span>
          <input required type="datetime-local" value={form.occurredAt} onChange={(event) => onChange("occurredAt", event.target.value)} />
        </label>
        <label className="field field--wide">
          <span>Description</span>
          <textarea required value={form.description} onChange={(event) => onChange("description", event.target.value)} />
        </label>
        <label className="field field--wide">
          <span>Action taken</span>
          <textarea value={form.actionTaken} onChange={(event) => onChange("actionTaken", event.target.value)} />
        </label>
        <label className="field field--wide">
          <span>Staff witnesses</span>
          <input
            placeholder="Separate names with commas"
            value={form.staffWitnesses}
            onChange={(event) => onChange("staffWitnesses", event.target.value)}
          />
        </label>
        <label className="field checkbox-field">
          <span>Parent notified</span>
          <input checked={form.parentNotified} type="checkbox" onChange={(event) => onChange("parentNotified", event.target.checked)} />
        </label>
        <label className="field">
          <span>Notification method</span>
          <select
            disabled={!form.parentNotified}
            value={form.parentNotificationMethod}
            onChange={(event) => onChange("parentNotificationMethod", event.target.value)}
          >
            {Object.entries(notificationMethodLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={(event) => onChange("status", event.target.value)}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="form-error field--wide">{error}</p> : null}
        <div className="form-actions field--wide">
          <button className="text-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save Incident"}
          </button>
        </div>
      </form>
    </section>
  );
}

function IncidentDetail({
  classroomName,
  incident,
  onBack,
  onEdit,
  siteTimezone,
  studentName
}: {
  classroomName: string;
  incident: Incident;
  onBack: () => void;
  onEdit: () => void;
  siteTimezone: string;
  studentName: string;
}) {
  return (
    <section className="page">
      <button className="text-button back-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="page-header">
        <div>
          <p className="eyebrow">Incident detail</p>
          <h1>{incident.incidentTypeLabel}</h1>
        </div>
        <button className="primary-button page-action" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
      <dl className="user-details">
        <div>
          <dt>Student</dt>
          <dd>{studentName || "Student"}</dd>
        </div>
        <div>
          <dt>Severity</dt>
          <dd>{severityLabels[incident.severity]}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{locationLabel(incident)}</dd>
        </div>
        <div>
          <dt>Classroom</dt>
          <dd>{classroomName || "No classroom"}</dd>
        </div>
        <div>
          <dt>Occurred</dt>
          <dd>{formatDateTime(incident.occurredAt, siteTimezone)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabels[incident.status]}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{incident.description}</dd>
        </div>
        <div>
          <dt>Action taken</dt>
          <dd>{incident.actionTaken || "None listed"}</dd>
        </div>
        <div>
          <dt>Parent notification</dt>
          <dd>
            {incident.parentNotified ? `Yes, by ${notificationMethodLabels[incident.parentNotificationMethod]}` : "No"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function emptyForm(siteTimezone: string, studentId = ""): IncidentFormState {
  return {
    studentId,
    classroomId: "",
    incidentType: "",
    severity: "minor",
    location: "",
    otherLocation: "",
    occurredAt: toDatetimeLocalValue(new Date().toISOString(), siteTimezone),
    description: "",
    actionTaken: "",
    staffWitnesses: "",
    parentNotified: false,
    parentNotificationMethod: "none",
    status: "open"
  };
}

function fromIncident(incident: Incident, siteTimezone: string): IncidentFormState {
  return {
    studentId: incident.studentId,
    classroomId: incident.classroomId,
    incidentType: incident.incidentType,
    severity: incident.severity,
    location: incident.location,
    otherLocation: incident.otherLocation,
    occurredAt: toDatetimeLocalValue(incident.occurredAt, siteTimezone),
    description: incident.description,
    actionTaken: incident.actionTaken,
    staffWitnesses: incident.staffWitnesses.join(", "),
    parentNotified: incident.parentNotified,
    parentNotificationMethod: incident.parentNotificationMethod,
    status: incident.status
  };
}

function toPayload(form: IncidentFormState, siteTimezone: string): IncidentPayload {
  return {
    studentId: form.studentId,
    classroomId: form.classroomId,
    incidentType: form.incidentType,
    severity: form.severity,
    location: form.location,
    otherLocation: form.location === "Other" ? form.otherLocation.trim() : "",
    occurredAt: zonedDateTimeToIso(form.occurredAt, siteTimezone),
    description: form.description.trim(),
    actionTaken: form.actionTaken.trim(),
    staffWitnesses: form.staffWitnesses
      .split(",")
      .map((witness) => witness.trim())
      .filter(Boolean),
    parentNotified: form.parentNotified,
    parentNotificationMethod: form.parentNotified ? form.parentNotificationMethod : "none",
    status: form.status
  };
}

function studentName(student: Student) {
  return [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ");
}

function locationLabel(incident: Pick<Incident, "locationLabel" | "otherLocation">) {
  return incident.locationLabel === "Other" && incident.otherLocation ? incident.otherLocation : incident.locationLabel;
}

function formatDateTime(timestamp: string, siteTimezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: siteTimezone
  }).format(new Date(timestamp));
}

function toDatetimeLocalValue(timestamp: string, siteTimezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: siteTimezone,
    year: "numeric"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function zonedDateTimeToIso(value: string, siteTimezone: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  let utcTime = Date.UTC(year, month - 1, day, hour, minute);

  for (let index = 0; index < 2; index += 1) {
    const offset = timezoneOffsetMs(new Date(utcTime), siteTimezone);
    utcTime = Date.UTC(year, month - 1, day, hour, minute) - offset;
  }

  return new Date(utcTime).toISOString();
}

function timezoneOffsetMs(date: Date, siteTimezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: siteTimezone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}
