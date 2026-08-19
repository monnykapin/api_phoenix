# Project Brief

## Project
**api_phoenix** — a RESTful API for property/room rental management.

## Core Requirements
- Backend API built with Node.js, Express, and MongoDB (Mongoose).
- JWT authentication + GitHub OAuth (Passport.js).
- Resources: assets, projects, tasks, transactions, guests, rentals, rooms, tenants, users.
- Room rental management with monthly filtering and room availability status.
- Security middleware: Helmet, CORS, XSS-clean, rate limiting.

## Goals
- Manage rooms and tenants, track rentals and rent payments.
- Provide rental data filterable by selected month (active-during-month semantics).
- Track room status (`available` / `rented`) and rental payment status (`paid` / `pending` / `overdue`).

## Scope
- This is a single backend service (modular monolith). No microservices.
- Docker support for dev and prod.
