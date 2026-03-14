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

### Customers (Phase 2 – popup detection)
- **GET /api/customers/check-phone?phone=...** – Incoming call lookup; returns `popupType`, `customer`, `lead`
- **GET /api/customers/:id/history** – Customer lead history (newest first)

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

---

## Customer Collection / Phase 2 Popup Detection

### Why Customer collection

The `Customer` collection is a **fast lookup layer** for incoming call popup behavior. When a call arrives, the frontend sends the phone number; the backend checks `Customer` and returns which popup to show, plus the latest lead when available.

### Relationship

- **LeadMaster**: source of truth for all leads (manual, return, booking confirmation, etc.)
- **Customer**: denormalized index per phone number, holding `latestLeadId`, `latestLeadStatus`, `latestLeadType`, lead counts, and ID arrays
- **Updates**: Whenever a lead is created or updated, `customerService.upsertCustomerFromLead()` runs and keeps the Customer document in sync

### Phone normalization

- Remove all non-digits
- Keep last 10 digits
- Stored as `normalizedPhone` in Customer and LeadMaster
- Used for lookup, lead creation, and updates

### Incoming call popup workflow

1. Incoming call → frontend sends `GET /api/customers/check-phone?phone=...`
2. Backend normalizes phone and looks up Customer
3. If **no customer**:
   - `exists: false`, `popupType: "newLeadPopup"`, `options: ["enquiry", "booked"]`
4. If **customer exists**:
   - Load latest lead from LeadMaster
   - Compute `popupType` and return `customer`, `lead`

### popupType mapping

| latestLeadStatus | latestLeadType | popupType |
|------------------|----------------|-----------|
| followup | any | followupPopup |
| completed | any | reportPopup |
| complaint | any | complaintPopup |
| new | return | returnPopup |
| new | bookingConfirmation | bookingConfirmationPopup |
| new | other | newLeadPopup |
| (other) | any | newLeadPopup |

### Latest lead priority

Order used to pick the “latest” lead for a customer:

1. complaint  
2. followup  
3. new  
4. completed  

Within the same priority, the lead with the most recent `updatedAt` is chosen.

### APIs

- **GET /api/customers/check-phone?phone=...** – Incoming call lookup (auth required)
- **GET /api/customers/:id/history** – All leads for a customer (auth required)
