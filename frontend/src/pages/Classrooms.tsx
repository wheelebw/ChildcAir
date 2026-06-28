import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  checkInStudents,
  checkOutStudents,
  endNap,
  getClassroomAttendance,
  listClassrooms,
  logCare,
  logActivity,
  logMeal,
  startNap,
  type AlertSeverity,
  type AlertsSummary,
  type AttendanceStatus,
  type Classroom,
  type ClassroomAttendance
} from "../services/api";

type DailyAction =
  | { kind: "meal"; label: string; value: string }
  | { kind: "care"; label: string; value: string }
  | { kind: "activity"; label: string; value: string }
  | { kind: "nap_start"; label: string }
  | { kind: "nap_end"; label: string };

const dailyActions: DailyAction[] = [
  { kind: "meal", label: "Snack", value: "Snack" },
  { kind: "meal", label: "Lunch", value: "Lunch" },
  { kind: "activity", label: "Circle Time", value: "Circle Time" },
  { kind: "activity", label: "Outside", value: "Outside Time" },
  { kind: "activity", label: "Art", value: "Art" },
  { kind: "activity", label: "Music", value: "Music" },
  { kind: "activity", label: "Story", value: "Story Time" },
  { kind: "nap_start", label: "Nap Start" },
  { kind: "nap_end", label: "Nap End" },
  { kind: "care", label: "Potty", value: "Potty" },
  { kind: "care", label: "Diaper Wet", value: "Diaper Wet" },
  { kind: "care", label: "Diaper Dirty", value: "Diaper Dirty" },
  { kind: "care", label: "Diaper Dry", value: "Diaper Dry" }
];

export function ClassroomsPage({ onOpenStudent }: { onOpenStudent?: (studentId: string) => void }) {
  const { appContext, currentUser } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [attendance, setAttendance] = useState<ClassroomAttendance | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const siteTimezone = appContext?.site?.timezone || "America/Chicago";

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
    setSuccess("");

    try {
      const token = await getToken();
      setClassrooms(await listClassrooms(token));
    } catch (loadError) {
      setError(loadError instanceof Error ? `${loadError.message} Please try again.` : "Unable to load classrooms. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openClassroom(classroomId: string) {
    setError("");
    setSuccess("");
    setSelectedIds([]);

    try {
      const token = await getToken();
      setAttendance(await getClassroomAttendance(token, classroomId));
    } catch (loadError) {
      setError(loadError instanceof Error ? `${loadError.message} Please try again.` : "Unable to load attendance. Please try again.");
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
    setSuccess("");

    try {
      const token = await getToken();
      const payload = { studentIds, classroomId: attendance.classroom.id };
      const summary = selectedStudentSummary(studentIds, attendance.students);

      if (action === "check_in") {
        await checkInStudents(token, payload);
        setSuccess(`${summary} checked in.`);
      } else {
        await checkOutStudents(token, payload);
        setSuccess(`${summary} checked out.`);
      }

      setSelectedIds([]);
      await refreshAttendance();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update attendance.");
    } finally {
      setSaving(false);
    }
  }

  async function writeDailyAction(action: DailyAction) {
    if (!attendance || selectedIds.length === 0) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (selectedIds.some((studentId) => attendance.students.find((student) => student.id === studentId)?.attendance.status !== "checked_in")) {
        setError("Daily actions can only be logged for students who are currently checked in.");
        return;
      }

      const token = await getToken();
      const payload = { studentIds: selectedIds, classroomId: attendance.classroom.id };
      const summary = selectedStudentSummary(selectedIds, attendance.students);

      if (action.kind === "meal") {
        await logMeal(token, { ...payload, mealType: action.value });
      } else if (action.kind === "activity") {
        await logActivity(token, { ...payload, activityType: action.value });
      } else if (action.kind === "care") {
        await logCare(token, { ...payload, careType: action.value });
      } else if (action.kind === "nap_start") {
        await startNap(token, payload);
      } else {
        await endNap(token, payload);
      }

      setSuccess(successMessage(action, summary));
      setSelectedIds([]);
      await refreshAttendance();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to log daily action.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(studentId: string) {
    setSuccess("");
    setSelectedIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  }

  if (attendance) {
    const hasCheckedInSelection = selectedIds.some(
      (studentId) => attendance.students.find((student) => student.id === studentId)?.attendance.status === "checked_in"
    );

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
        <p className="page-copy">
          {selectedIds.length > 0 ? `${selectedIds.length} selected. Choose an attendance or daily action.` : "Select students, then tap an action."}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}
        {selectedIds.length > 0 && !hasCheckedInSelection ? (
          <p className="form-error">Daily actions can only be logged for students who are currently checked in.</p>
        ) : null}
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
        <section className="daily-actions" aria-labelledby="daily-actions-heading">
          <h2 id="daily-actions-heading">Daily Actions</h2>
          <div className="daily-actions__grid">
            {dailyActions.map((action) => (
              <button
                className="text-button"
                disabled={saving || selectedIds.length === 0 || !hasCheckedInSelection}
                key={action.label}
                type="button"
                onClick={() => writeDailyAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
        {attendance.students.length === 0 ? (
          <div className="empty-state">
            <h2>No students assigned.</h2>
            <p>Assign active students to this classroom before taking attendance.</p>
          </div>
        ) : null}
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
                  <button className="inline-link" type="button" onClick={() => onOpenStudent?.(student.id)}>
                    {studentName(student)}
                  </button>
                  <AlertSummaryChips summary={student.alertsSummary} />
                  <small>{statusText(student.attendance.status, student.attendance.timestamp, siteTimezone)}</small>
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
      {!loading && classrooms.length === 0 ? (
        <div className="empty-state">
          <h2>No classrooms available.</h2>
          <p>Classrooms will appear here after site setup is complete.</p>
        </div>
      ) : null}
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

function selectedStudentSummary(studentIds: string[], students: ClassroomAttendance["students"]) {
  if (studentIds.length === 1) {
    const student = students.find((item) => item.id === studentIds[0]);
    return student ? studentName(student) : "1 student";
  }

  return `${studentIds.length} students`;
}

function successMessage(action: DailyAction, summary: string) {
  if (action.kind === "nap_start") {
    return `Nap started for ${summary}.`;
  }

  if (action.kind === "nap_end") {
    return `Nap ended for ${summary}.`;
  }

  return `${action.label} logged for ${summary}.`;
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

const severityLabels: Record<AlertSeverity, string> = {
  critical: "Critical",
  important: "Important",
  warning: "Warning",
  reminder: "Reminder",
  info: "Info"
};

const severityOrder: AlertSeverity[] = ["critical", "important", "warning", "reminder", "info"];

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

function studentName(student: { firstName: string; lastName: string; preferredName: string }) {
  return [student.preferredName || student.firstName, student.lastName].filter(Boolean).join(" ");
}

function statusText(status: AttendanceStatus, timestamp: string, siteTimezone: string) {
  if (status === "checked_in") {
    return `Status: Checked in at ${formatTime(timestamp, siteTimezone)}`;
  }

  if (status === "checked_out") {
    return `Status: Checked out at ${formatTime(timestamp, siteTimezone)}`;
  }

  return "Status: Not checked in";
}

function formatTime(timestamp: string, siteTimezone: string) {
  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: siteTimezone
  }).format(new Date(timestamp));
}
