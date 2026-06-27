import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createStudent,
  getStudent,
  listStudents,
  updateStudent,
  type Guardian,
  type Student,
  type StudentPayload
} from "../services/api";

type ViewMode = "list" | "new" | "detail" | "edit";

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

export function StudentsPage() {
  const { appContext, currentUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [mode, setMode] = useState<ViewMode>("list");
  const [form, setForm] = useState<StudentFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const classrooms = appContext?.classrooms.items ?? [];
  const classroomNames = useMemo(
    () => Object.fromEntries(classrooms.map((classroom) => [classroom.id, classroom.name])),
    [classrooms]
  );

  useEffect(() => {
    void loadStudents();
  }, [currentUser]);

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
      setError(loadError instanceof Error ? loadError.message : "Unable to load students.");
    } finally {
      setLoading(false);
    }
  }

  async function openStudent(studentId: string) {
    setError("");

    try {
      const token = await getToken();
      const student = await getStudent(token, studentId);
      setSelectedStudent(student);
      setMode("detail");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load student.");
    }
  }

  function startNewStudent() {
    setForm(emptyForm);
    setSelectedStudent(null);
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

  if (mode === "detail" && selectedStudent) {
    return (
      <StudentProfile
        classroomName={classroomNames[selectedStudent.defaultClassroomId] ?? ""}
        onBack={() => setMode("list")}
        onEdit={startEditStudent}
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

      {!loading && students.length === 0 ? (
        <div className="empty-state">
          <h2>No students yet.</h2>
          <p>Add your first student.</p>
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
  onBack,
  onEdit,
  student
}: {
  classroomName: string;
  onBack: () => void;
  onEdit: () => void;
  student: Student;
}) {
  const guardian = student.guardians[0];

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
                {guardian.phone || "No phone"} · {guardian.email || "No email"}
              </>
            ) : (
              "No guardian listed"
            )}
          </dd>
        </div>
      </dl>
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
