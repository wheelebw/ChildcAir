# Data Model

## Core Principle

The app is multi-site from the beginning.

Every tenant-specific record must include:

```json
{
  "siteId": "two-rivers"
}
```

Never query tenant data without filtering by `siteId`.

---

# Collections

## sites

Represents a childcare program, preschool, microschool, or daycare.

```json
{
  "_id": "site_two_rivers",
  "siteId": "two-rivers",
  "name": "Two Rivers Academy",
  "status": "active",
  "timezone": "America/Chicago",
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z",
  "settings": {
    "communication": {
      "emailEnabled": true,
      "smsEnabled": false,
      "defaultFromName": "Two Rivers Academy"
    },
    "billing": {
      "enabled": false,
      "paymentLinksEnabled": true
    }
  }
}
```

---

## users

Represents staff/admin users who can log into the app.

```json
{
  "_id": "user_123",
  "firebaseUid": "firebase_uid_here",
  "email": "staff@example.com",
  "displayName": "Staff Member",
  "siteMemberships": [
    {
      "siteId": "two-rivers",
      "role": "site_owner",
      "permissions": [
        "students.read",
        "students.write",
        "attendance.write",
        "incidents.write",
        "communication.write",
        "settings.customize"
      ],
      "status": "active"
    }
  ],
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

---

## roles

Reusable role templates.

```json
{
  "_id": "role_site_owner",
  "siteId": "two-rivers",
  "roleKey": "site_owner",
  "label": "Site Owner",
  "permissions": [
    "students.read",
    "students.write",
    "classrooms.read",
    "classrooms.write",
    "attendance.write",
    "incidents.write",
    "communication.write",
    "documents.read",
    "documents.write",
    "billing.read",
    "billing.write",
    "settings.customize",
    "users.manage",
    "audit.read"
  ],
  "systemRole": true,
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

---

## students

Core student profile.

```json
{
  "_id": "student_123",
  "siteId": "two-rivers",
  "firstName": "Isaac",
  "lastName": "Wheeler",
  "preferredName": "Isaac",
  "birthdate": "2025-06-27",
  "status": "active",
  "defaultClassroomId": "classroom_primary",
  "photoUrl": null,
  "allergies": [
    "peanuts"
  ],
  "medicalNotes": "",
  "authorizedPickup": [
    {
      "name": "Parent One",
      "relationship": "Mother",
      "phone": "+19185551234",
      "email": "parent@example.com",
      "notes": ""
    }
  ],
  "guardians": [
    {
      "name": "Parent One",
      "relationship": "Mother",
      "phone": "+19185551234",
      "email": "parent@example.com",
      "preferredMethod": "email",
      "emailOptIn": true,
      "smsOptIn": false,
      "primary": true
    }
  ],
  "custom": {
    "napPreference": "Sleeps with blanket from home"
  },
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

---

## classrooms

Represents classrooms, rooms, or program groups.

```json
{
  "_id": "classroom_primary",
  "siteId": "two-rivers",
  "name": "Primary Classroom",
  "status": "active",
  "sortOrder": 10,
  "capacity": 24,
  "defaultStaffUserIds": [
    "user_123"
  ],
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

---

## events

Central activity log. Attendance, movement, naps, meals, incidents, and communication references can all create events.

```json
{
  "_id": "event_123",
  "siteId": "two-rivers",
  "eventType": "attendance.check_in",
  "studentIds": [
    "student_123"
  ],
  "classroomId": "classroom_primary",
  "createdBy": "user_123",
  "timestamp": "2026-06-26T08:00:00Z",
  "notes": "",
  "metadata": {
    "checkInMethod": "staff",
    "source": "mobile"
  },
  "relatedEntity": {
    "type": "incident",
    "id": null
  },
  "createdAt": "2026-06-26T08:00:00Z"
}
```

Suggested event types:

```text
attendance.check_in
attendance.check_out
attendance.absent
movement.classroom_change
nap.started
nap.ended
meal.snack
meal.lunch
activity.group
incident.created
communication.sent
communication.received
document.added
billing.notice_sent
```

---

## incidents

Incident report details. Creating an incident should also create an `incident.created` event.

```json
{
  "_id": "incident_123",
  "siteId": "two-rivers",
  "studentId": "student_123",
  "classroomId": "classroom_primary",
  "incidentType": "fall",
  "incidentTypeLabel": "Fall",
  "occurredAt": "2026-06-26T10:15:00Z",
  "createdBy": "user_123",
  "description": "Student tripped on playground and scraped knee.",
  "actionTaken": "Cleaned area and applied bandage.",
  "parentNotified": true,
  "communicationId": "communication_123",
  "status": "open",
  "signature": {
    "required": false,
    "signedAt": null,
    "signedBy": null
  },
  "custom": {},
  "createdAt": "2026-06-26T10:20:00Z",
  "updatedAt": "2026-06-26T10:20:00Z"
}
```

---

## communications

Stores outbound and inbound messages, regardless of channel.

```json
{
  "_id": "communication_123",
  "siteId": "two-rivers",
  "studentId": "student_123",
  "classroomId": "classroom_primary",
  "threadId": "thread_123",
  "type": "incident",
  "channel": "email",
  "direction": "outbound",
  "subject": "Incident notice for Isaac",
  "body": "Isaac scraped his knee on the playground. He is okay, and we cleaned the area.",
  "status": "sent",
  "sentBy": "user_123",
  "sentAt": "2026-06-26T10:22:00Z",
  "recipients": [
    {
      "name": "Parent One",
      "email": "parent@example.com",
      "phone": "+19185551234",
      "relationship": "Mother"
    }
  ],
  "provider": {
    "name": "email_placeholder",
    "messageId": null
  },
  "relatedEntity": {
    "type": "incident",
    "id": "incident_123"
  },
  "createdAt": "2026-06-26T10:22:00Z",
  "updatedAt": "2026-06-26T10:22:00Z"
}
```

---

## documents

Document records and metadata. File upload can come later.

```json
{
  "_id": "document_123",
  "siteId": "two-rivers",
  "studentId": "student_123",
  "documentType": "immunization",
  "documentTypeLabel": "Immunization Record",
  "title": "Immunization Record",
  "status": "active",
  "fileUrl": null,
  "storagePath": null,
  "expiresAt": null,
  "uploadedBy": "user_123",
  "custom": {},
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

---

## billing_accounts

Basic billing/account status per student or family.

```json
{
  "_id": "billing_123",
  "siteId": "two-rivers",
  "studentId": "student_123",
  "familyName": "Wheeler Family",
  "currentBalance": 425.00,
  "dueDate": "2026-07-01",
  "status": "due",
  "paymentLinks": [
    {
      "label": "Pay via QuickBooks",
      "url": "https://example.com/pay",
      "active": true
    }
  ],
  "lastNoticeSentAt": null,
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

---

## custom_lists

Site-specific dropdown/list values.

```json
{
  "_id": "list_incident_fall",
  "siteId": "two-rivers",
  "listKey": "incident_type",
  "value": "fall",
  "label": "Fall",
  "active": true,
  "sortOrder": 10,
  "systemDefault": true,
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

Example list keys:

```text
incident_type
document_type
classroom_action
student_action
attendance_status
meal_type
nap_status
communication_type
```

---

## custom_fields

Site-specific custom field definitions.

```json
{
  "_id": "field_student_nap_preference",
  "siteId": "two-rivers",
  "entity": "student",
  "fieldKey": "napPreference",
  "label": "Nap Preference",
  "type": "text",
  "required": false,
  "active": true,
  "options": [],
  "sortOrder": 10,
  "createdAt": "2026-06-26T00:00:00Z",
  "updatedAt": "2026-06-26T00:00:00Z"
}
```

Allowed field types for MVP:

```text
text
long_text
yes_no
date
dropdown
multi_select
phone
email
file
```

---

## audit_logs

Immutable record of sensitive actions.

```json
{
  "_id": "audit_123",
  "siteId": "two-rivers",
  "actorUserId": "user_123",
  "action": "student.updated",
  "entityType": "student",
  "entityId": "student_123",
  "timestamp": "2026-06-26T12:00:00Z",
  "metadata": {
    "fieldsChanged": [
      "allergies"
    ]
  }
}
```

---

# Index Recommendations

Create indexes for:

```text
users.firebaseUid
users.email
students.siteId
students.siteId + status
students.siteId + lastName
classrooms.siteId
events.siteId + timestamp
events.siteId + studentIds
events.siteId + classroomId + timestamp
incidents.siteId + studentId
communications.siteId + studentId
communications.siteId + threadId
documents.siteId + studentId
custom_lists.siteId + listKey
custom_fields.siteId + entity
audit_logs.siteId + timestamp
```

---

# Data Model Rules

1. All site-specific records require `siteId`.
2. Do not duplicate sensitive data unless necessary.
3. Student profile data should stay standardized where possible.
4. Program-specific details should go in `custom`.
5. Daily activity should be stored as events.
6. Incident details should live in `incidents`, with a linked event.
7. Communication should be channel-agnostic.
8. SMS should be modeled now but disabled by default.
9. Billing should use payment links only for MVP.
10. Do not store credit card or bank data.
