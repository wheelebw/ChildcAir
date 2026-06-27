import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  checkInStudents,
  checkOutStudents,
  getClassroomAttendance,
  listClassrooms,
  type AttendanceStatus,
  type Classroom,
  type ClassroomAttendance
} from "../services/api";

export function ClassroomsPage() {
  const { currentUser } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [attendance, setAttendance] = useState<ClassroomAttendance | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadClassrooms();
  }, [currentUser]);

  async function getToken() {
    if (!currentUser) {
      throw new Error("You must be signed in.");
    }

    return currentUser.getIdToken();
  }

  async function loadClassrooms() {
    if (!currentUser) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = await getToken();
      setClassrooms(await listClassrooms(token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load classrooms.");
    } finally {
      setLoading(false);
    }
  }

  async function openClassroom(classroomId: string) {
    setError("");
    setSelectedIds([]);

    try {
      const token = await getToken();
      setAttendance(await getClassroomAttendance(token, classroomId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load attendance.");
    }
  }

  async function refreshAttendance() {
    if (!attendance) {
      await loadClassrooms();
      return;
    }

    const token = await getToken();
    const updated = await getClassroomAttendance(token, attendance.classroom.id);
    setAttendance(updated);
    setClassrooms(await listClassrooms(token));
  }

  async function writeAttendance(action: "check_in" | "check_out", studentIds: string[]) {
    if (!attendance || studentIds.length === 0) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const token = await getToken();
      const payload = { studentIds, classroomId: attendance.classroom.id };

      if (action === "check_in") {
        await checkInStudents(token, payload);
      } else {
        await checkOutStudents(token, payload);
      }

      setSelectedIds([]);
      await refreshAttendance();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update attendance.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(studentId: string) {
    setSelectedIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  }

  if (attendance) {
    return (
      <section className="page">
        <button className="text-button back-button" type="button" onClick={() => setAttendance(null)}>
          Back
        </button>
        <div className="page-header">
          <div>
            <p className="eyebrow">Attendance</p>
            <h1>{attendance.classroom.name}</h1>
          </div>
        </div>
        <AttendanceSummary counts={attendance.classroom.attendance} />
        {error ? <p className="form-error">{error}</p> : null}
        <div className="bulk-actions">
          <button
            className="primary-button"
            disabled={saving || selectedIds.length === 0}
            type="button"
            onClick={() => writeAttendance("check_in", selectedIds)}
          >
            Check In Selected
          </button>
          <button
            className="text-button"
            disabled={saving || selectedIds.length === 0}
            type="button"
            onClick={() => writeAttendance("check_out", selectedIds)}
          >
            Check Out Selected
          </button>
        </div>
        <div className="attendance-list">
          {attendance.students.map((student) => (
            <article className="attendance-card" key={student.id}>
              <label className="attendance-select">
                <input
                  checked={selectedIds.includes(student.id)}
                  onChange={() => toggleSelected(student.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{studentName(student)}</strong>
                  <small>{statusText(student.attendance.status, student.attendance.timestamp)}</small>
                </span>
              </label>
              <button
                className={student.attendance.status === "checked_in" ? "text-button" : "primary-button"}
                disabled={saving}
                type="button"
                onClick={() =>
                  writeAttendance(student.attendance.status === "checked_in" ? "check_out" : "check_in", [student.id])
                }
              >
                {student.attendance.status === "checked_in"
                  ? "Check Out"
                  : student.attendance.status === "checked_out"
                    ? "Check In Again"
                    : "Check In"}
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <p className="eyebrow">Rooms</p>
      <h1>Classrooms</h1>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="page-copy">Loading classrooms...</p> : null}
      <div className="classroom-list">
        {classrooms.map((classroom) => (
          <button className="classroom-card" key={classroom.id} type="button" onClick={() => openClassroom(classroom.id)}>
            <strong>{classroom.name}</strong>
            <AttendanceSummary counts={classroom.attendance} />
          </button>
        ))}
      </div>
    </section>
  );
}

function AttendanceSummary({ counts }: { counts: Classroom["attendance"] }) {
  return (
    <div className="attendance-summary">
      <span>Present: {counts.checked_in}</span>
      <span>Not checked in: {counts.not_checked_in}</span>
      <span>Checked out: {counts.checked_out}</span>
    </div>
  );
}

function studentName(student: { firstName: string; lastName: string; preferredName: string }) {
  return [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ");
}

function statusText(status: AttendanceStatus, timestamp: string) {
  if (status === "checked_in") {
    return `Status: Checked in at ${formatTime(timestamp)}`;
  }

  if (status === "checked_out") {
    return `Status: Checked out at ${formatTime(timestamp)}`;
  }

  return "Status: Not checked in";
}

function formatTime(timestamp: string) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
