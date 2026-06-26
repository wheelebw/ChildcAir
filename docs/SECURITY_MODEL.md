# Security Model

## Core Rule

A user may only access data for a site they are assigned to, and only actions allowed by their role/permissions.

## Tenant Isolation

Every major record must include:

```json
{
  "siteId": "two-rivers"
}
```

No API endpoint should return student, classroom, document, billing, or communication data without filtering by `siteId`.

## Auth

Use Firebase Authentication.

Required:

* Email verification
* Admin MFA recommended
* No anonymous access to student data

## Roles

Initial roles:

### Platform Admin

Can access all sites. Reserved for app owner/support.

### Site Owner

Can manage one site, users, settings, students, billing, documents, and reports.

### Site Admin

Can manage students, attendance, communication, incidents, and documents.

### Guide

Can manage classroom activity, attendance, incidents, naps, and communication.

### Assistant

Can view assigned classroom and log limited events.

### Parent

Future role. Can view only their own child/children.

## Permissions

Use permission strings rather than hardcoding role names.

Examples:

* students.read
* students.write
* classrooms.read
* classrooms.write
* attendance.write
* incidents.write
* communication.write
* documents.read
* documents.write
* billing.read
* billing.write
* settings.customize
* users.manage
* audit.read

## Audit Logs

Log sensitive actions:

* Student viewed
* Student edited
* Incident created
* Message sent
* Document uploaded/viewed
* User permission changed
* Billing record changed

Audit log fields:

```json
{
  "siteId": "two-rivers",
  "actorUserId": "...",
  "action": "student.updated",
  "entityType": "student",
  "entityId": "...",
  "timestamp": "...",
  "metadata": {}
}
```

## Data Safety Rules

* Do not expose MongoDB directly to frontend.
* All database access must go through secured backend API.
* Use least-privilege database credentials.
* Keep dev and production databases separate.
* Do not store payment card data.
* Payment links should redirect to third-party services.
* Do not store unnecessary medical/legal data for MVP.
