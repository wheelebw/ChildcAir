# ChildcAir Decisions Log

## 2026-06-26
Decision:
Student is the core object.

Reason:
Attendance, incidents, communication, documents, billing, and events all relate to students.


## 2026-06-26
Decision:
Event engine is canonical history.

Reason:
Timeline, attendance, incidents, communications, meals, naps, and reports can all be generated from events.


## 2026-06-26
Decision:
Email-first parent communication.

Reason:
No additional cost.
No app installation requirement.
SMS can be added later.


## 2026-06-27
Decision:
Custom lists everywhere.

Reason:
Site-specific options such as incident types, incident locations, activity types, meal types, document types, attendance states, and student statuses should be configurable without frontend code changes.


## 2026-06-27
Decision:
Store timestamps in UTC.

Reason:
UTC storage keeps database records consistent across devices, browsers, and server environments.


## 2026-06-27
Decision:
Display times in the site's timezone.

Reason:
Guides need attendance, incidents, naps, meals, and timeline entries to match the local school day. Two Rivers Academy uses America/Chicago.
