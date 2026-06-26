# Codex Instructions

## Project Objective

Build a mobile-first childcare management MVP for Two Rivers Academy.

## Tech Stack

Frontend:

* React
* Vite
* TypeScript
* Firebase Auth
* Firebase Hosting

Backend:

* FastAPI
* Python
* MongoDB Atlas
* Cloud Run-ready structure

## Build Style

Prefer small, working increments.

Each feature should include:

* Data model
* API route
* Frontend view/component
* Basic error handling
* Site-based authorization check
* Audit log where appropriate

## Do Not Build Yet

Do not build:

* Native mobile app
* Full payment processing
* Payroll
* CACFP
* Subsidy tracking
* Lesson planning
* AI assistant
* Complex reporting
* SMS integration beyond placeholder schema

## MVP Collections

Use these initial MongoDB collections:

* sites
* users
* roles
* students
* classrooms
* events
* incidents
* communications
* documents
* custom_lists
* custom_fields
* audit_logs

## Core Architecture Rule

Every tenant-specific collection must include `siteId`.

## Event Engine

Most daily activity should be stored as events.

Example:

```json
{
  "siteId": "two-rivers",
  "studentIds": ["student_123"],
  "classroomId": "primary",
  "eventType": "attendance.check_in",
  "timestamp": "2026-06-26T08:00:00Z",
  "createdBy": "user_123",
  "notes": ""
}
```

## UI Priority

Build for mobile first.

Preferred navigation:

* Home
* Students
* Classrooms
* Communication
* More

Common student actions should open from a bottom sheet/modal.

## First Build Order

1. Repo scaffold
2. Firebase Auth shell
3. Backend health check
4. Mongo connection
5. Site/user bootstrap
6. Students CRUD
7. Classrooms CRUD
8. Event logging
9. Attendance workflow
10. Incident workflow
11. Communication log
12. Custom lists
13. Audit logs
