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
- **POST /api/leads** – Add new lead (booked/enquiry). `createdBy` auto-set from authenticated user — do NOT pass in body.
- **GET /api/leads/completed** – Completed report (filters: fromDate, toDate, store, leadtype; pagination: page, limit)
- **GET /api/leads/performance** – Get personal call counts (followup, complaint, completed) with date filters.

### Followups
- **GET /api/leads/followups** – Followup list (filters: fromDate, toDate, store; filtered by followupDate)
- **POST /api/leads/followups/:id** – Update followup → sets leadStatus=completed. `updatedBy`/`updatedAt` auto-set by server.
- **GET /api/leads/complaints** – Complaint list (filters: fromDate, toDate, store; filtered by updatedAt)
- **POST /api/leads/complaints/:id** – Update complaint remarks and metadata. `leadStatus` remains `complaint`. `updatedBy`/`updatedAt` auto-set.

### Booking Confirmation
- **GET /api/leads/booking-confirmation** – List booking confirmation leads (leadStatus=new)
- **POST /api/leads/booking-confirmation/:id** – Update. Status priority: markasComplaint → complaint | markasFollowup → followup | billReceived=no/amountMismatch → complaint | default → completed. `updatedBy`/`updatedAt` auto-set.

### Returns
- **GET /api/leads/returns** – List return leads (leadStatus=new, filtered by returnDate)
- **POST /api/leads/returns/:id** – Update. Status priority: markasComplaint → complaint | markasFollowup → followup | default → completed. `updatedBy`/`updatedAt` auto-set.

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
- **Fields returned**: `_id`, `name`, `phone`, `store`, `leadtype`, `leadStatus`, `createdAt`, `functionDate`, `subCategory`, `closingAction`, `remarks`, `followupDate`, `followupremarks`, `updatedAt`, `updatedBy`.
- **`updatedBy`**: Automatically set by the server from the authenticated user's `employeeId`. Not accepted from the request body.

### 📅 Date Filtering Logic

All APIs support date filtering using these query parameters:
- `fromDate`
- `toDate`

**Supported Formats:**
1. **Simple Date**: `YYYY-MM-DD` (e.g. `2026-03-15`)
   - Backend automatically expands `fromDate` to `00:00:00` and `toDate` to `23:59:59`.
2. **ISO Format**: `YYYY-MM-DDTHH:mm:ss` (e.g. `2026-03-15T10:30:00`)

| leadStatus | leadtype | Filtering Field | Description |
|------------|----------|-----------------|-------------|
| **new** | return | `returnDate` | Specific date from RMS return API |
| **new** | bookingConfirmation | `bookingDate` | Specific date from RMS booking API |
| **new** | enquiry / booked / justDial | `createdAt` | System creation date |
| **followup** | any | `followupDate` | Scheduled callback date |
| **complaint** | any | `updatedAt` | Date when lead became a complaint |
| **completed** | any | `updatedAt` | Date when lead was finalized (Closed) |

All lead/sync/admin APIs require auth: JWT Bearer, Basic auth, or headers `x-user-id` and `x-password`.

> **`updatedBy` is always auto-populated** from the authenticated user's `employeeId` on update calls — do not pass it in the request body.
> **`updatedAt`** is always set by the server to the exact time of the update call.

### Audit Field Rules

| Operation | `createdAt` | `createdBy` | `updatedAt` | `updatedBy` |
|-----------|------------|------------|------------|------------|
| Manual lead creation (`POST /api/leads`) | `new Date()` | `req.user.employeeId` | — | — |
| Telecaller updates lead (returns / booking / followup) | unchanged | unchanged | `new Date()` | `req.user.employeeId` |
| External sync (new lead) | From API or `new Date()` | — | — | — |
| External sync (existing lead re-sync) | unchanged (`$setOnInsert` only) | unchanged | unchanged | unchanged |

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
- `createdAt`: **Original Lead Date**. For synced leads, set from the RMS API date (returnDate/bookingDate) on first insert only — never overwritten by re-syncs. For manual leads, set at creation time.
- `updatedAt`: **Action Date**. Set by the server whenever a telecaller updates a lead (followup, complaint, or completed). Never set during external sync.
- `createdBy`: Telecaller employeeId who created a manual lead. Auto-populated from auth token. Never set for synced leads.
- `updatedBy`: Telecaller employeeId who last updated the lead. Auto-populated from auth token on every update call. Never set during external sync.

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
- The system calls the external RMS API once per sync type for Returns.
- **Booking Confirmation Sync**: Now iterates through each store in the database and calls the API per `locCode`.
- Leads from all locations are processed efficiently and upserted into the `LeadMaster` collection.
- Upsert logic uses `bookingNo + leadType` to prevent duplicates.

### 🔒 Sync Meta & Locking
- **SyncMeta**: Tracks `lastRunAt`, `initialSequenceCompleted` (gate for incremental syncs), and per-job `firstSyncCompleted` state.
- **SyncLock**: Database-level lock (collection `synclock`) — prevents overlapping syncs. Created when sync starts, deleted when all steps finish (success or failure). No time-based expiry.


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
