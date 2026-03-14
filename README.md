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

### Admin Console
- **GET /api/admin/dashboard** – Get main dashboard stats (Total calls, duration, complaints).
- **GET /api/admin/telecaller-summary** – Performance leaderboard for telecallers.
- **GET /api/admin/reports** – Detailed calls report with CSV export support.
- **GET /api/admin/complaints/pivot** – Complaint breakdown by store and category.
- **GET /api/admin/filter-options** – Fetch unique stores, lead types, and users for dashboard filters.

### Reports (Completed Leads)
- **GET /api/leads/completed** – Main report API returning all leads with `leadStatus: "completed"`.
- **Filtering**: Uses `updatedAt` for date filtering.
- **Fields**: returns `createdAt`, `store`, `name`, `phone`, `leadtype`, `functionDate`, `subCategory`, `closingAction`, `remarks`, `followupDate`, `followupremarks`, `updatedAt`, `updatedBy`.

### 📅 Date Filtering Logic

All APIs follow a unified date filtering architecture based on `leadStatus`:

| leadStatus | leadtype | Filtering Field | Description |
|------------|----------|-----------------|-------------|
| **new** | return | `returnDate` | Specific date from RMS return API |
| **new** | bookingConfirmation | `bookingDate` | Specific date from RMS booking API |
| **new** | enquiry / booked / justDial | `createdAt` | System creation date |
| **followup** | any | `updatedAt` | Date when lead became a followup |
| **complaint** | any | `updatedAt` | Date when lead became a complaint |
| **completed** | any | `updatedAt` | Date when lead was finalized (Closed) |

**Date Format**: APIs expect ISO format strings like `2026-01-26T00:00:00`.

All lead/sync/admin APIs require auth: JWT Bearer, Basic auth, or headers `x-user-id` and `x-password`.

## Swagger

http://localhost:3000/api-docs

## Leadmaster Collection

Single MongoDB collection `leadmaster` stores all lead types:
- Manual leads (booked, enquiry)
- Booking confirmation (from sync)
- Return leads (from sync)
- JustDial

Fields:
- `leadtype`: [booked, enquiry, bookingConfirmation, return, justDial]
- `leadStatus`: [new, followup, complaint, completed]
- `phone`: Raw phone number
- `normalizedPhone`: Normalized last 10 digits
- `name`: Customer name
- `store`: Store location (e.g., Zorucci - Edapally)
- `functionDate / bookingDate`: Date of event/booking
- `returnDate`: Date of return (for return leads)
- `callStatus`: [connected, not connected, interested, etc.]
- `callDuration`: Duration in seconds/minutes
- `subCategory`: Enquiry category/type
- `remarks`: Lead notes
- `billReceived / amountMismatch`: For booking confirmation leads
- `noofFunctions / noofAttires`: For return leads
- `bookingNo`: Unique ID from RMS
- `source`: [manual, bookingSync, returnSync]
- `createdAt`: **Original Lead Date**. For synced leads, this is the date from the RMS API (returnDate/bookingDate). For manual leads, it is the creation time.
- `updatedAt`: **Action Date**. Tracks when a telecaller updated the lead (e.g., moved to followup, complaint, or completed).

Backward-compatible update fields:
- `billrecieved` → mapped to `billReceived`
- `noofFuctions` → mapped to `noofFunctions`
- `followupclosingAction / followupremarks / followupcallDuration`: Used for followup updates.

### Data Flattening
All leads synced from external APIs are **flattened**. Instead of storing original fields in a `rawData` sub-object, they are spread directly into the root of the `LeadMaster` document. This ensures all fields are accessible in a single "roll" without nesting.

## Sync Deduplication

- **Booking confirmation**: Upsert by `bookingNo`
- **Return leads**: Upsert by `bookingNo` or `returnId` (depends on external API response shape)

## Scheduler & Sync Architecture

The system uses a Master Scheduler (`src/schedulers/masterSyncScheduler.js`) to keep data in sync with external RMS APIs.

### 🔄 Sync Flow
1. **Initial Sync (on start)**:
   - Fetches **last 60 days** of data.
   - Flow: `syncStores` → `syncReturnLeads` → `syncBookingConfirmationLeads`.
2. **Incremental Sync (every 30 minutes)**:
   - Fetches **last 7 days** of data to ensure no updates are missed.
   - Follows the same flow as the initial sync.

### ⚡ Parallel & Bulk Processing
- The system calls the external RMS API once per sync type (Returns/Bookings) instead of per store.
- Leads from all locations are returned in a single dataset and processed efficiently.
- Upsert logic uses `bookingNo + leadType` to prevent duplicates.

### 🔒 Sync Meta & Locking
- **SyncMeta**: Tracks `lastRunAt` and `firstSyncCompleted` state to ensure we don't duplicate work.
- **SyncLock**: Uses a database-level lock to prevent multiple sync processes from running at the same time if a previous process is still active.


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
