import { FormEvent, useEffect, useMemo, useState } from "react";
import { IncidentsPage } from "./Incidents";
import { useAuth } from "../context/AuthContext";
import {
  createManualStudentAlert,
  createStudent,
  createStudentDocument,
  deleteStudentDocument,
  getStudent,
  listCustomListItems,
  listManualStudentAlerts,
  listStudentAlerts,
  listStudentDocuments,
  listStudentEvents,
  listStudentIncidents,
  listStudents,
  updateManualStudentAlert,
  updateStudent,
  updateStudentDocument,
  type AlertSeverity,
  type AlertsSummary,
  type ChildcAirEvent,
  type CustomListItem,
  type Guardian,
  type Incident,
  type ManualStudentAlert,
  type ManualStudentAlertPayload,
  type Student,
  type StudentAlert,
  type StudentDocument,
  type StudentDocumentPayload,
  type StudentDocumentStatus,
  type StudentPayload
} from "../services/api";

type ViewMode = "list" | "new" | "detail" | "edit" | "incident-new";
type ProfileTab = "profile" | "timeline" | "incidents" | "documents" | "alerts";
type DocumentMode = "idle" | "new" | "edit";

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

type DocumentFormState = {
  id: string;
  documentType: string;
  status: StudentDocumentStatus;
  title: string;
  receivedAt: string;
  expiresAt: string;
  notes: string;
};

type ManualAlertFormState = {
  severity: AlertSeverity;
  label: string;
  message: string;
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

const emptyDocumentForm: DocumentFormState = {
  id: "",
  documentType: "",
  status: "missing",
  title: "",
  receivedAt: "",
  expiresAt: "",
  notes: ""
};

const emptyManualAlertForm: ManualAlertFormState = {
  severity: "important",
  label: "",
  message: ""
};

const statusLabels: Record<Student["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  future_enrollment: "Future Enrollment",
  withdrawn: "Withdrawn",
  graduated: "Graduated"
};

const documentStatusLabels: Record<StudentDocumentStatus, string> = {
  missing: "Missing",
  received: "Received",
  expired: "Expired",
  not_required: "Not Required"
};

const severityLabels: Record<AlertSeverity, string> = {
  critical: "Critical",
  important: "Important",
  warning: "Warning",
  reminder: "Reminder",
  info: "Info"
};

const severityOrder: AlertSeverity[] = ["critical", "important", "warning", "reminder", "info"];

export function StudentsPage({ initialStudentId = "" }: { initialStudentId?: string }) {
  const { appContext, currentUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [documentTypes, setDocumentTypes] = useState<CustomListItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<ChildcAirEvent[]>([]);
  const [selectedIncidents, setSelectedIncidents] = useState<Incident[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<StudentDocument[]>([]);
  const [selectedAlerts, setSelectedAlerts] = useState<StudentAlert[]>([]);
  const [selectedManualAlerts, setSelectedManualAlerts] = useState<ManualStudentAlert[]>([]);
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
      const [studentList, documentTypeList] = await Promise.all([listStudents(token), listCustomListItems(token, "document_type")]);
      setStudents(studentList);
      setDocumentTypes(documentTypeList);
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
      const [student, events, incidents, documents, alerts, manualAlerts] = await Promise.all([
        getStudent(token, studentId),
        listStudentEvents(token, studentId),
        listStudentIncidents(token, studentId),
        listStudentDocuments(token, studentId),
        listStudentAlerts(token, studentId),
        listManualStudentAlerts(token, studentId)
      ]);
      setSelectedStudent(student);
      setSelectedEvents(events);
      setSelectedIncidents(incidents);
      setSelectedDocuments(documents);
      setSelectedAlerts(alerts);
      setSelectedManualAlerts(manualAlerts);
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
    setSelectedEvents([]);
    setSelectedIncidents([]);
    setSelectedDocuments([]);
    setSelectedAlerts([]);
    setSelectedManualAlerts([]);
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
        await refreshSelectedStudentActivity(savedStudent.id, token);
      } else {
        setSelectedEvents([]);
        setSelectedIncidents([]);
        setSelectedDocuments([]);
        setSelectedAlerts([]);
        setSelectedManualAlerts([]);
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

  async function refreshSelectedStudentActivity(studentId: string, existingToken?: string) {
    const token = existingToken ?? (await getToken());
    const [student, events, incidents, documents, alerts, manualAlerts, studentList] = await Promise.all([
      getStudent(token, studentId),
      listStudentEvents(token, studentId),
      listStudentIncidents(token, studentId),
      listStudentDocuments(token, studentId),
      listStudentAlerts(token, studentId),
      listManualStudentAlerts(token, studentId),
      listStudents(token)
    ]);
    setSelectedStudent(student);
    setSelectedEvents(events);
    setSelectedIncidents(incidents);
    setSelectedDocuments(documents);
    setSelectedAlerts(alerts);
    setSelectedManualAlerts(manualAlerts);
    setStudents(studentList);
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

  async function handleCreateDocument(payload: StudentDocumentPayload) {
    if (!selectedStudent) {
      return;
    }

    const token = await getToken();
    await createStudentDocument(token, selectedStudent.id, payload);
    await refreshSelectedStudentActivity(selectedStudent.id, token);
    setProfileTab("documents");
  }

  async function handleUpdateDocument(documentId: string, payload: StudentDocumentPayload) {
    if (!selectedStudent) {
      return;
    }

    const token = await getToken();
    await updateStudentDocument(token, documentId, payload);
    await refreshSelectedStudentActivity(selectedStudent.id, token);
    setProfileTab("documents");
  }

  async function handleDeleteDocument(documentId: string) {
    if (!selectedStudent) {
      return;
    }

    const token = await getToken();
    await deleteStudentDocument(token, documentId);
    await refreshSelectedStudentActivity(selectedStudent.id, token);
    setProfileTab("documents");
  }

  async function handleCreateManualAlert(payload: ManualStudentAlertPayload) {
    if (!selectedStudent) {
      return;
    }

    const token = await getToken();
    await createManualStudentAlert(token, selectedStudent.id, payload);
    await refreshSelectedStudentActivity(selectedStudent.id, token);
    setProfileTab("alerts");
  }

  async function handleDeactivateManualAlert(alertId: string) {
    if (!selectedStudent) {
      return;
    }

    const token = await getToken();
    await updateManualStudentAlert(token, alertId, { active: false });
    await refreshSelectedStudentActivity(selectedStudent.id, token);
    setProfileTab("alerts");
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
        alerts={selectedAlerts}
        classroomName={classroomNames[selectedStudent.defaultClassroomId] ?? ""}
        documents={selectedDocuments}
        documentTypes={documentTypes}
        events={selectedEvents}
        incidents={selectedIncidents}
        manualAlerts={selectedManualAlerts}
        onBack={() => setMode("list")}
        onCreateDocument={handleCreateDocument}
        onCreateManualAlert={handleCreateManualAlert}
        onDeactivateManualAlert={handleDeactivateManualAlert}
        onDeleteDocument={handleDeleteDocument}
        onEdit={startEditStudent}
        onNewIncident={() => setMode("incident-new")}
        onUpdateDocument={handleUpdateDocument}
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
              <AlertSummaryChips summary={student.alertsSummary} />
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
  alerts,
  classroomName,
  documents,
  documentTypes,
  events,
  incidents,
  manualAlerts,
  onBack,
  onCreateDocument,
  onCreateManualAlert,
  onDeactivateManualAlert,
  onDeleteDocument,
  onEdit,
  onNewIncident,
  onUpdateDocument,
  initialTab,
  siteTimezone,
  student
}: {
  alerts: StudentAlert[];
  classroomName: string;
  documents: StudentDocument[];
  documentTypes: CustomListItem[];
  events: ChildcAirEvent[];
  incidents: Incident[];
  manualAlerts: ManualStudentAlert[];
  onBack: () => void;
  onCreateDocument: (payload: StudentDocumentPayload) => Promise<void>;
  onCreateManualAlert: (payload: ManualStudentAlertPayload) => Promise<void>;
  onDeactivateManualAlert: (alertId: string) => Promise<void>;
  onDeleteDocument: (documentId: string) => Promise<void>;
  onEdit: () => void;
  onNewIncident: () => void;
  onUpdateDocument: (documentId: string, payload: StudentDocumentPayload) => Promise<void>;
  initialTab: ProfileTab;
  siteTimezone: string;
  student: Student;
}) {
  const guardian = student.guardians[0];
  const groupedEvents = groupEventsByDay(events, siteTimezone);
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [documentMode, setDocumentMode] = useState<DocumentMode>("idle");
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [manualAlertForm, setManualAlertForm] = useState<ManualAlertFormState>(emptyManualAlertForm);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  function beginNewDocument() {
    setProfileError("");
    setProfileMessage("");
    setDocumentForm({ ...emptyDocumentForm, documentType: documentTypes[0]?.value ?? "" });
    setDocumentMode("new");
  }

  function beginEditDocument(document: StudentDocument) {
    setProfileError("");
    setProfileMessage("");
    setDocumentForm({
      id: document.id,
      documentType: document.documentType,
      status: document.status,
      title: document.title,
      receivedAt: dateInputValue(document.receivedAt),
      expiresAt: dateInputValue(document.expiresAt),
      notes: document.notes
    });
    setDocumentMode("edit");
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");

    try {
      const payload = toDocumentPayload(documentForm);
      if (documentMode === "edit" && documentForm.id) {
        await onUpdateDocument(documentForm.id, payload);
        setProfileMessage("Document updated.");
      } else {
        await onCreateDocument(payload);
        setProfileMessage("Document added.");
      }
      setDocumentMode("idle");
      setDocumentForm(emptyDocumentForm);
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Unable to save document.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function removeDocument(documentId: string) {
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");

    try {
      await onDeleteDocument(documentId);
      setProfileMessage("Document removed.");
    } catch (deleteError) {
      setProfileError(deleteError instanceof Error ? deleteError.message : "Unable to remove document.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitManualAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");

    try {
      await onCreateManualAlert(manualAlertForm);
      setManualAlertForm(emptyManualAlertForm);
      setProfileMessage("Manual alert added.");
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Unable to save alert.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function deactivateManualAlert(alertId: string) {
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");

    try {
      await onDeactivateManualAlert(alertId);
      setProfileMessage("Manual alert deactivated.");
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Unable to update alert.");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <section className="page">
      <button className="text-button back-button" type="button" onClick={onBack}>
        Back
      </button>
      <div className="page-header">
        <div>
          <p className="eyebrow">Student profile</p>
          <h1>{studentName(student)}</h1>
          <AlertSummaryChips summary={student.alertsSummary} />
        </div>
        <button className="primary-button page-action" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Student profile sections">
        {(["profile", "timeline", "incidents", "documents", "alerts"] as ProfileTab[]).map((tab) => (
          <button
            className={`profile-tab${activeTab === tab ? " profile-tab--active" : ""}`}
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>
      {profileError ? <p className="form-error">{profileError}</p> : null}
      {profileMessage ? <p className="form-success">{profileMessage}</p> : null}
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
                    {incident.severity} /{" "}
                    {incident.locationLabel === "Other" && incident.otherLocation ? incident.otherLocation : incident.locationLabel}
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
      {activeTab === "documents" ? (
        <section className="timeline-section" aria-labelledby="documents-heading">
          <div className="section-header">
            <h2 id="documents-heading">Documents</h2>
            <button className="primary-button section-action" type="button" onClick={beginNewDocument}>
              + Add Document
            </button>
          </div>
          {documentMode !== "idle" ? (
            <DocumentForm
              documentTypes={documentTypes}
              form={documentForm}
              mode={documentMode}
              onCancel={() => setDocumentMode("idle")}
              onChange={(field, value) => setDocumentForm((current) => ({ ...current, [field]: value }))}
              onSubmit={submitDocument}
              saving={profileSaving}
            />
          ) : null}
          {documents.length === 0 ? <p className="page-copy">No documents recorded.</p> : null}
          <div className="incident-list">
            {documents.map((document) => (
              <article className="incident-card" key={document.id}>
                <span>
                  <strong>{document.documentTypeLabel}</strong>
                  <small>{documentStatusLabels[document.status]}</small>
                  <small>Received: {formatDateOnly(document.receivedAt) || "Not recorded"}</small>
                  <small>Expires: {formatDateOnly(document.expiresAt) || "Not recorded"}</small>
                  {document.notes ? <small>{document.notes}</small> : null}
                </span>
                <span className="incident-meta">
                  <button className="text-button" type="button" onClick={() => beginEditDocument(document)}>
                    Edit
                  </button>
                  <button className="text-button" disabled={profileSaving} type="button" onClick={() => void removeDocument(document.id)}>
                    Delete
                  </button>
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {activeTab === "alerts" ? (
        <section className="timeline-section" aria-labelledby="alerts-heading">
          <h2 id="alerts-heading">Alerts</h2>
          {alerts.length === 0 ? <p className="page-copy">No alerts.</p> : null}
          <div className="incident-list">
            {alerts.map((alert, index) => (
              <article className={`incident-card alert-card alert-card--${alert.severity}`} key={`${alert.source}-${alert.type}-${alert.id ?? index}`}>
                <span>
                  <strong>{alert.label}</strong>
                  <small>{severityLabels[alert.severity]}</small>
                  {alert.message ? <small>{alert.message}</small> : null}
                </span>
              </article>
            ))}
          </div>
          <h3 className="form-section-title">Manual Alert</h3>
          <form className="student-form compact-form" onSubmit={submitManualAlert}>
            <label className="field">
              <span>Severity</span>
              <select
                value={manualAlertForm.severity}
                onChange={(event) => setManualAlertForm((current) => ({ ...current, severity: event.target.value as AlertSeverity }))}
              >
                {severityOrder.map((severity) => (
                  <option key={severity} value={severity}>
                    {severityLabels[severity]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Label</span>
              <input
                required
                value={manualAlertForm.label}
                onChange={(event) => setManualAlertForm((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label className="field field--wide">
              <span>Message</span>
              <textarea
                value={manualAlertForm.message}
                onChange={(event) => setManualAlertForm((current) => ({ ...current, message: event.target.value }))}
              />
            </label>
            <div className="form-actions field--wide">
              <button className="primary-button" disabled={profileSaving} type="submit">
                {profileSaving ? "Saving..." : "Add Manual Alert"}
              </button>
            </div>
          </form>
          {manualAlerts.filter((alert) => alert.active).length === 0 ? null : (
            <>
              <h3 className="form-section-title">Active Manual Alerts</h3>
              <div className="incident-list">
                {manualAlerts
                  .filter((alert) => alert.active)
                  .map((alert) => (
                    <article className={`incident-card alert-card alert-card--${alert.severity}`} key={alert.id}>
                      <span>
                        <strong>{alert.label}</strong>
                        <small>{severityLabels[alert.severity]}</small>
                        {alert.message ? <small>{alert.message}</small> : null}
                      </span>
                      <button className="text-button" disabled={profileSaving} type="button" onClick={() => void deactivateManualAlert(alert.id)}>
                        Deactivate
                      </button>
                    </article>
                  ))}
              </div>
            </>
          )}
        </section>
      ) : null}
    </section>
  );
}

function DocumentForm({
  documentTypes,
  form,
  mode,
  onCancel,
  onChange,
  onSubmit,
  saving
}: {
  documentTypes: CustomListItem[];
  form: DocumentFormState;
  mode: DocumentMode;
  onCancel: () => void;
  onChange: (field: keyof DocumentFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <form className="student-form compact-form" onSubmit={onSubmit}>
      <label className="field">
        <span>Document type</span>
        <select required value={form.documentType} onChange={(event) => onChange("documentType", event.target.value)}>
          <option value="">Choose a document</option>
          {documentTypes.map((documentType) => (
            <option key={documentType.id} value={documentType.value}>
              {documentType.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select value={form.status} onChange={(event) => onChange("status", event.target.value as StudentDocumentStatus)}>
          {Object.entries(documentStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Title</span>
        <input value={form.title} onChange={(event) => onChange("title", event.target.value)} />
      </label>
      <label className="field">
        <span>Received</span>
        <input type="date" value={form.receivedAt} onChange={(event) => onChange("receivedAt", event.target.value)} />
      </label>
      <label className="field">
        <span>Expires</span>
        <input type="date" value={form.expiresAt} onChange={(event) => onChange("expiresAt", event.target.value)} />
      </label>
      <label className="field field--wide">
        <span>Notes</span>
        <textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} />
      </label>
      <div className="form-actions field--wide">
        <button className="text-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? "Saving..." : mode === "edit" ? "Save Document" : "Add Document"}
        </button>
      </div>
    </form>
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

function toDocumentPayload(form: DocumentFormState): StudentDocumentPayload {
  return {
    documentType: form.documentType,
    status: form.status,
    title: form.title.trim(),
    receivedAt: form.receivedAt || null,
    expiresAt: form.expiresAt || null,
    notes: form.notes.trim()
  };
}

function studentName(student: { firstName: string; lastName: string; preferredName: string }) {
  return [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ");
}

function tabLabel(tab: ProfileTab) {
  const labels: Record<ProfileTab, string> = {
    profile: "Profile",
    timeline: "Timeline",
    incidents: "Incidents",
    documents: "Documents",
    alerts: "Alerts"
  };

  return labels[tab];
}

function AlertSummaryChips({ summary }: { summary?: AlertsSummary }) {
  if (!summary || summary.count === 0) {
    return null;
  }

  return (
    <span className="alert-summary" aria-label={`${summary.count} alerts`}>
      {severityOrder
        .filter((severity) => (summary.bySeverity?.[severity] ?? 0) > 0)
        .map((severity) => (
          <span className={`alert-chip alert-chip--${severity}`} key={severity}>
            {severityLabels[severity]} {summary.bySeverity?.[severity]}
          </span>
        ))}
    </span>
  );
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

function formatDateOnly(timestamp: string) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(timestamp));
}

function dateInputValue(timestamp: string) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}
