import { FormEvent, useEffect, useMemo, useState } from "react";
import { IncidentsPage } from "./Incidents";
import { useAuth } from "../context/AuthContext";
import {
  createStudent,
  getStudent,
  listStudentEvents,
  listStudentIncidents,
  listStudents,
  updateStudent,
  type ChildcAirEvent,
  type Guardian,
  type Incident,
  type Student,
  type StudentPayload
} from "../services/api";

type ViewMode = "list" | "new" | "detail" | "edit" | "incident-new";
type ProfileTab = "profile" | "timeline" | "incidents";

type StudentFormState = {
  firstName: string;
  lastName: string;
  preferredName: string;
  birthdate: string;
  defaultClassroomId: string;
  status: Student["status"];
  allergies: string;
  medicalNotes: string;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianEmail: string;
};

const emptyForm: StudentFormState = {
  firstName: "",
  lastName: "",
  preferredName: "",
  birthdate: "",
  defaultClassroomId: "",
  status: "active",
  allergies: "",
  medicalNotes: "",
  guardianName: "",
  guardianRelationship: "",
  guardianPhone: "",
  guardianEmail: ""
};

const statusLabels: Record<Student["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  future_enrollment: "Future Enrollment",
  withdrawn: "Withdrawn",
  graduated: "Graduated"
};

export function StudentsPage({ initialStudentId = "" }: { initialStudentId?: string }) {
  const { appContext, currentUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<ChildcAirEvent[]>([]);
  const [selectedIncidents, setSelectedIncidents] = useState<Incident[]>([]);
  const [mode, setMode] = useState<ViewMode>("list");
  const [profileTab, setProfileTab] = useState<ProfileTab>("profile");
  const [form, setForm] = useState<StudentFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const classrooms = appContext?.classrooms.items ?? [];
  const siteTimezone = appContext?.site?.timezone || "America/Chicago";
  const classroomNames = useMemo(
    () => Object.fromEntries(classrooms.map((classroom) => [classroom.id, classroom.name])),
    [classrooms]
  );

  useEffect(() => {
    void loadStudents();
  }, [currentUser]);

  useEffect(() => {
    if (initialStudentId) {
      void openStudent(initialStudentId);
    }
  }, [initialStudentId, currentUser]);

  async function getToken() {
    if (!currentUser) {
      throw new Error("You must be signed in.");
    }

    return currentUser.getIdToken();
  }

  async function loadStudents() {
    if (!currentUser) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = await getToken();
      setStudents(await listStudents(token));
    } catch (loadError) {
      setError(loadError instanceof Error ? `${loadError.message} Please try again.` : "Unable to load students. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openStudent(studentId: string) {
    setError("");
    setDetailLoading(true);

    try {
      const token = await getToken();
      const student = await getStudent(token, studentId);
      const [events, incidents] = await Promise.all([listStudentEvents(token, studentId), listStudentIncidents(token, studentId)]);
      setSelectedStudent(student);
      setSelectedEvents(events);
      setSelectedIncidents(incidents);
      setProfileTab("profile");
      setMode("detail");
    } catch (loadError) {
      setError(loadError instanceof Error ? `${loadError.message} Please try again.` : "Unable to load student. Please try again.");
    } finally {
      setDetailLoading(false);
    }
  }

  function startNewStudent() {
    setForm(emptyForm);
    setSelectedStudent(null);
    setSelectedIncidents([]);
    setMode("new");
    setError("");
  }

  function startEditStudent() {
    if (!selectedStudent) {
      return;
    }

    const primaryGuardian = selectedStudent.guardians[0];
    setForm({
      firstName: selectedStudent.firstName,
      lastName: selectedStudent.lastName,
      preferredName: selectedStudent.preferredName,
      birthdate: selectedStudent.birthdate,
      defaultClassroomId: selectedStudent.defaultClassroomId,
      status: selectedStudent.status,
      allergies: selectedStudent.allergies.join(", "),
      medicalNotes: selectedStudent.medicalNotes,
      guardianName: primaryGuardian?.name ?? "",
      guardianRelationship: primaryGuardian?.relationship ?? "",
      guardianPhone: primaryGuardian?.phone ?? "",
      guardianEmail: primaryGuardian?.email ?? ""
    });
    setMode("edit");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const token = await getToken();
      const payload = toPayload(form);
      const savedStudent =
        mode === "edit" && selectedStudent
          ? await updateStudent(token, selectedStudent.id, payload)
          : await createStudent(token, payload);

      setSelectedStudent(savedStudent);
      if (mode === "edit") {
        const [events, incidents] = await Promise.all([listStudentEvents(token, savedStudent.id), listStudentIncidents(token, savedStudent.id)]);
        setSelectedEvents(events);
        setSelectedIncidents(incidents);
      } else {
        setSelectedEvents([]);
        setSelectedIncidents([]);
      }
      setMode("detail");
      setStudents(await listStudents(token));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save student.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof StudentFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function refreshSelectedStudentActivity(studentId: string) {
    const token = await getToken();
    const [events, incidents] = await Promise.all([listStudentEvents(token, studentId), listStudentIncidents(token, studentId)]);
    setSelectedEvents(events);
    setSelectedIncidents(incidents);
  }

  async function finishIncidentForSelectedStudent() {
    if (!selectedStudent) {
      setMode("list");
      return;
    }

    await refreshSelectedStudentActivity(selectedStudent.id);
    setProfileTab("incidents");
    setMode("detail");
  }

  if (mode === "new" || mode === "edit") {
    return (
      <StudentForm
        classrooms={classrooms}
        error={error}
        form={form}
        mode={mode}
        onCancel={() => setMode(selectedStudent ? "detail" : "list")}
        onChange={updateField}
        onSubmit={handleSubmit}
        saving={saving}
      />
    );
  }

  if (mode === "incident-new" && selectedStudent) {
    return (
      <IncidentsPage
        initialStudentId={selectedStudent.id}
        onBack={() => setMode("detail")}
        onIncidentSaved={() => void finishIncidentForSelectedStudent()}
        startInNewMode
      />
    );
  }

  if (mode === "detail" && selectedStudent) {
    return (
      <StudentProfile
        classroomName={classroomNames[selectedStudent.defaultClassroomId] ?? ""}
        events={selectedEvents}
        incidents={selectedIncidents}
        onBack={() => setMode("list")}
        onEdit={startEditStudent}
        onNewIncident={() => setMode("incident-new")}
        initialTab={profileTab}
        siteTimezone={siteTimezone}
        student={selectedStudent}
      />
    );
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Directory</p>
          <h1>Students</h1>
        </div>
        <button className="primary-button page-action" type="button" onClick={startNewStudent}>
          Add Student
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? <p className="page-copy">Loading students...</p> : null}
      {detailLoading ? <p className="page-copy">Loading timeline...</p> : null}

      {!loading && students.length === 0 ? (
        <div className="empty-state">
          <h2>No students enrolled.</h2>
          <p>Add a student when the pilot classroom is ready.</p>
          <button className="primary-button" type="button" onClick={startNewStudent}>
            Add Student
          </button>
        </div>
      ) : null}

      <div className="student-list">
        {students.map((student) => (
          <button className="student-card" key={student.id} type="button" onClick={() => openStudent(student.id)}>
            <span>
              <strong>{studentName(student)}</strong>
              <small>{classroomNames[student.defaultClassroomId] || "No classroom assigned"}</small>
            </span>
            <span className="status-pill">{statusLabels[student.status]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StudentForm({
  classrooms,
  error,
  form,
  mode,
  onCancel,
  onChange,
  onSubmit,
  saving
}: {
  classrooms: { id: string; name: string }[];
  error: string;
  form: StudentFormState;
  mode: "new" | "edit";
  onCancel: () => void;
  onChange: (field: keyof StudentFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <section className="page">
      <p className="eyebrow">{mode === "edit" ? "Edit profile" : "New profile"}</p>
      <h1>{mode === "edit" ? "Edit Student" : "Add Student"}</h1>
      <form className="student-form" onSubmit={onSubmit}>
        <label className="field">
          <span>First name</span>
          <input required value={form.firstName} onChange={(event) => onChange("firstName", event.target.value)} />
        </label>
        <label className="field">
          <span>Last name</span>
          <input required value={form.lastName} onChange={(event) => onChange("lastName", event.target.value)} />
        </label>
        <label className="field">
          <span>Preferred name</span>
          <input value={form.preferredName} onChange={(event) => onChange("preferredName", event.target.value)} />
        </label>
        <label className="field">
          <span>Birthdate</span>
          <input type="date" value={form.birthdate} onChange={(event) => onChange("birthdate", event.target.value)} />
        </label>
        <label className="field">
          <span>Default classroom</span>
          <select value={form.defaultClassroomId} onChange={(event) => onChange("defaultClassroomId", event.target.value)}>
            <option value="">No classroom assigned</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={(event) => onChange("status", event.target.value as Student["status"])}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--wide">
          <span>Allergies</span>
          <input
            placeholder="Separate allergies with commas"
            value={form.allergies}
            onChange={(event) => onChange("allergies", event.target.value)}
          />
        </label>
        <label className="field field--wide">
          <span>Medical notes</span>
          <textarea value={form.medicalNotes} onChange={(event) => onChange("medicalNotes", event.target.value)} />
        </label>
        <h2 className="form-section-title">Primary Guardian</h2>
        <label className="field">
          <span>Name</span>
          <input value={form.guardianName} onChange={(event) => onChange("guardianName", event.target.value)} />
        </label>
        <label className="field">
          <span>Relationship</span>
          <input
            value={form.guardianRelationship}
            onChange={(event) => onChange("guardianRelationship", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Phone</span>
          <input value={form.guardianPhone} onChange={(event) => onChange("guardianPhone", event.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.guardianEmail}
            onChange={(event) => onChange("guardianEmail", event.target.value)}
          />
        </label>
        {error ? <p className="form-error field--wide">{error}</p> : null}
        <div className="form-actions field--wide">
          <button className="text-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save Student"}
          </button>
        </div>
      </form>
    </section>
  );
}

function StudentProfile({
  classroomName,
  events,
  incidents,
  onBack,
  onEdit,
  onNewIncident,
  initialTab,
  siteTimezone,
  student
}: {
  classroomName: string;
  events: ChildcAirEvent[];
  incidents: Incident[];
  onBack: () => void;
  onEdit: () => void;
  onNewIncident: () => void;
  initialTab: ProfileTab;
  siteTimezone: string;
  student: Student;
}) {
  const guardian = student.guardians[0];
  const groupedEvents = groupEventsByDay(events, siteTimezone);
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

  return (
    <section className="page">
      <button className="text-button back-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="page-header">
        <div>
          <p className="eyebrow">Student profile</p>
          <h1>{studentName(student)}</h1>
        </div>
        <button className="primary-button page-action" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Student profile sections">
        <button
          className={`profile-tab${activeTab === "profile" ? " profile-tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          className={`profile-tab${activeTab === "timeline" ? " profile-tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("timeline")}
        >
          Timeline
        </button>
        <button
          className={`profile-tab${activeTab === "incidents" ? " profile-tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("incidents")}
        >
          Incidents
        </button>
      </div>
      {activeTab === "profile" ? (
      <section className="profile-section">
        <dl className="user-details">
          <div>
            <dt>Birthdate</dt>
            <dd>{student.birthdate || "Not provided"}</dd>
          </div>
          <div>
            <dt>Default classroom</dt>
            <dd>{classroomName || "No classroom assigned"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{statusLabels[student.status]}</dd>
          </div>
          <div>
            <dt>Allergies</dt>
            <dd>{student.allergies.length ? student.allergies.join(", ") : "None listed"}</dd>
          </div>
          <div>
            <dt>Medical notes</dt>
            <dd>{student.medicalNotes || "None listed"}</dd>
          </div>
          <div>
            <dt>Guardian</dt>
            <dd>
              {guardian ? (
                <>
                  {guardian.name || "Unnamed guardian"}
                  <br />
                  {guardian.relationship || "Relationship not provided"}
                  <br />
                  {guardian.phone || "No phone"} / {guardian.email || "No email"}
                </>
              ) : (
                "No guardian listed"
              )}
            </dd>
          </div>
        </dl>
      </section>
      ) : null}
      {activeTab === "timeline" ? (
      <section className="timeline-section" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Timeline</h2>
        {events.length === 0 ? <p className="page-copy">No activity yet.</p> : null}
        {groupedEvents.map((group) => (
          <div className="timeline-day" key={group.label}>
            <h3>{group.label}</h3>
            <div className="timeline-list">
              {group.events.map((event) => (
                <article className="timeline-item" key={event.id}>
                  <time>{formatEventTime(event.timestamp, siteTimezone)}</time>
                  <div>
                    <strong>{eventTypeLabel(event.eventType)}</strong>
                    {event.notes ? <p>{event.notes}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
      ) : null}
      {activeTab === "incidents" ? (
      <section className="timeline-section" aria-labelledby="incidents-heading">
        <div className="section-header">
          <h2 id="incidents-heading">Incidents</h2>
          <button className="primary-button section-action" type="button" onClick={onNewIncident}>
            + New Incident
          </button>
        </div>
        {incidents.length === 0 ? <p className="page-copy">No incidents reported.</p> : null}
        <div className="incident-list">
          {incidents.map((incident) => (
            <article className="incident-card" key={incident.id}>
              <span>
                <strong>{incident.incidentTypeLabel}</strong>
                <small>
                  {incident.severity} / {incident.locationLabel === "Other" && incident.otherLocation ? incident.otherLocation : incident.locationLabel}
                </small>
                <small>{formatEventDateTime(incident.occurredAt, siteTimezone)}</small>
              </span>
              <span className="incident-meta">
                <span className="status-pill">{incident.status}</span>
              </span>
            </article>
          ))}
        </div>
      </section>
      ) : null}
    </section>
  );
}

function toPayload(form: StudentFormState): StudentPayload {
  const guardian: Guardian = {
    name: form.guardianName.trim(),
    relationship: form.guardianRelationship.trim(),
    phone: form.guardianPhone.trim(),
    email: form.guardianEmail.trim(),
    preferredMethod: "email",
    emailOptIn: true,
    smsOptIn: false,
    primary: true
  };

  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    preferredName: form.preferredName.trim(),
    birthdate: form.birthdate || null,
    status: form.status,
    defaultClassroomId: form.defaultClassroomId,
    allergies: form.allergies
      .split(",")
      .map((allergy) => allergy.trim())
      .filter(Boolean),
    medicalNotes: form.medicalNotes.trim(),
    guardians: guardian.name || guardian.email || guardian.phone ? [guardian] : []
  };
}

function studentName(student: Student) {
  return [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ");
}

function eventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    "attendance.check_in": "Checked In",
    "attendance.check_out": "Checked Out",
    "attendance.absent": "Absent",
    "attendance.late": "Late",
    "movement.classroom_change": "Classroom Change",
    "nap.started": "Nap Started",
    "nap.ended": "Nap Ended",
    "meal.snack": "Snack",
    "meal.lunch": "Lunch",
    "meal.breakfast": "Breakfast",
    "meal.pm_snack": "PM Snack",
    "activity.circle_time": "Circle Time",
    "activity.outside": "Outside",
    "activity.art": "Art",
    "activity.music": "Music",
    "activity.story_time": "Story Time",
    "activity.group": "Group Activity",
    "activity.group_lesson": "Group Lesson",
    "activity.sensory": "Sensory Activity",
    "activity.water_play": "Water Play",
    "activity.field_trip": "Field Trip",
    "care.potty": "Potty",
    "care.diaper_wet": "Diaper Wet",
    "care.diaper_dirty": "Diaper Dirty",
    "care.diaper_dry": "Diaper Dry",
    "incident.created": "Incident Created",
    "communication.sent": "Communication Sent",
    "document.uploaded": "Document Uploaded"
  };

  return labels[eventType] ?? eventType;
}

function groupEventsByDay(events: ChildcAirEvent[], siteTimezone: string) {
  const groups = new Map<string, ChildcAirEvent[]>();

  events.forEach((event) => {
    const label = formatEventDay(event.timestamp, siteTimezone);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  });

  return Array.from(groups.entries()).map(([label, groupEvents]) => ({ label, events: groupEvents }));
}

function formatEventDay(timestamp: string, siteTimezone: string) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(date, siteTimezone) === dateKey(today, siteTimezone)) {
    return "Today";
  }

  if (dateKey(date, siteTimezone) === dateKey(yesterday, siteTimezone)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: siteTimezone
  }).format(date);
}

function dateKey(date: Date, siteTimezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: siteTimezone,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function formatEventTime(timestamp: string, siteTimezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: siteTimezone
  }).format(new Date(timestamp));
}

function formatEventDateTime(timestamp: string, siteTimezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: siteTimezone
  }).format(new Date(timestamp));
}
