# DaycAIre / Two Rivers MVP - Product Requirements

## Product Goal

Build a mobile-first childcare management MVP for Two Rivers Academy that is simple, secure, and usable by staff for daily school operations.

## Core Philosophy

Simple by default. Customizable when needed.

The app should help small schools manage:

* Students
* Classrooms
* Attendance
* Daily events
* Incidents
* Family communication
* Documents
* Basic tuition/payment links

## MVP Priority

P0 features:

* Firebase login
* Site-based access control
* Student list and student profiles
* Classroom list
* Check-in/check-out
* Student timeline/event log
* Classroom actions
* Incident logging
* Communication log
* Custom lists
* Basic document records
* Audit logging

P1 features:

* Email notifications
* Parent payment links
* File uploads
* Custom fields
* Parent portal

Future:

* SMS/Twilio integration
* Dedicated school phone numbers
* Push notifications
* Billing automation
* Native mobile app

## Primary Screens

1. Home Dashboard
2. Students
3. Classrooms
4. Communication Hub
5. Documents
6. Billing Lite
7. Settings

## Mobile-First Requirements

* No dense tables on mobile
* Large tap targets
* Bottom navigation
* Student action bottom sheet
* Classroom action buttons
* Maximum 3 taps for common workflows

## Core Workflows

### Morning Check-In

Staff opens classroom or student list, selects one or more students, and checks them in.

### Student Action

Staff taps a student and sees actions:

* Check in
* Check out
* Move classroom
* Nap
* Incident
* Message parent
* View profile

### Classroom Action

Staff opens a classroom and logs an action for all selected/present students:

* Snack
* Lunch
* Outside time
* Group activity
* Nap
* Announcement

### Incident

Staff creates incident, selects student, type, notes, parent notified status, and optional communication record.

### Communication

Staff logs or sends communication connected to a student, classroom, incident, or general announcement.

## Design Tone

Calm, clean, warm, Montessori-friendly, not corporate or cluttered.
