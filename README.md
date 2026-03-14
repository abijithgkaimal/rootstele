# Telecaller Backend

Node.js + Express + MongoDB backend for the Telecaller application.

## Tech Stack

- Node.js
- Express
- MongoDB + Mongoose
- Axios (external APIs)
- Swagger (swagger-jsdoc, swagger-ui-express)
- dotenv, cors, morgan
- express-validator
- jsonwebtoken (JWT)

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set variables
3. Ensure MongoDB is running
4. Run: `npm start` or `npm run dev` (nodemon)

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 3000) |
| MONGODB_URI | MongoDB connection string |
| JWT_SECRET | Secret for JWT signing |
| ROOTMENTS_VERIFY_API | Login verification API URL |
| RENTAL_BOOKING_SUMMARY_API | Booking summary sync API |
| RENTAL_RETURN_REPORT_API | Return report sync API |

## API Overview

### Auth
- **POST /api/auth/login** – Login (userId, password). Returns JWT on success.

### Leads
- **POST /api/leads** – Add new lead (booked/enquiry)
- **GET /api/leads/completed** – Completed report (filters: fromDate, toDate, store, leadtype; pagination: page, limit)

### Followups
- **GET /api/leads/followups** – Followup list
- **POST /api/leads/followups/:id** – Update followup (sets leadStatus = completed)
- **GET /api/leads/complaints** – Complaint list

### Booking Confirmation
- **GET /api/leads/booking-confirmation** – List booking confirmation leads
- **POST /api/leads/booking-confirmation/:id** – Update (billReceived, amountMismatch → leadStatus)

### Returns
- **GET /api/leads/returns** – List return leads
- **POST /api/leads/returns/:id** – Update return lead

### Sync
- **POST /api/sync/booking-confirmation** – Sync from rental API (upsert by bookingNo)
- **POST /api/sync/returns** – Sync return report (upsert by bookingNo or returnId)

All lead/sync APIs require auth: JWT Bearer, Basic auth, or headers `x-user-id` and `x-password`.

## Swagger

http://localhost:3000/api-docs

## Leadmaster Collection

Single MongoDB collection `leadmaster` stores all lead types:
- Manual leads (booked, enquiry)
- Booking confirmation (from sync)
- Return leads (from sync)
- JustDial

Fields: leadtype, leadStatus, phone, name, store, functionDate, billReceived, noofFunctions, etc.  
Backward-compatible: accepts `billrecieved` → `billReceived`, `noofFuctions` → `noofFunctions`.

## Sync Deduplication

- **Booking confirmation**: Upsert by `bookingNo`
- **Return leads**: Upsert by `bookingNo` or `returnId` (depends on external API response shape)
