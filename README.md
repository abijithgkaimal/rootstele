<div align="center">
  <h1>🚀 Telecaller Backend Engine</h1>
  <p><strong>A high-performance, robust, and scalable lead management API built for seamless telecaller operations.</strong></p>
  <p>This backend engine powers the entire lifecycle of lead management—from initial inquiries to complex follow-ups, complaints, and external synchronization. With auto-deduplication, smart caching layers, and a dynamic incoming call popup detection system, it provides the ultimate developer and user experience.</p>

  [![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Express.js](https://img.shields.io/badge/Express.js-Fast-000000?logo=express&logoColor=white)](https://expressjs.com/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
  [![Swagger](https://img.shields.io/badge/Swagger-OpenAPI_3.0-85EA2D?logo=swagger&logoColor=black)](https://swagger.io/)
</div>

---

## ⚡ Architecture & UX Philosophy

We believe that **APIs should be as intuitive as the UIs they power**. 

- **Developer-First Design**: Unified data models, strictly typed routes, and comprehensive OpenAPI documentation.
- **Resilient Synchronization**: Master schedulers handle concurrent syncs from external systems (RMS, JustDial) with robust database locks, preventing data duplication.
- **Flattened Data Models**: Synced leads are flattened into the root of the document for O(1) query complexity without deep nesting.
- **Smart Call Intelligence**: The `Customer` collection serves as a fast lookup layer to instantly detect customer history and suggest dynamic UI popups (`newLeadPopup`, `followupPopup`, etc.) on incoming calls.

---

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Node.js 20.x** | Core runtime for asynchronous high performance |
| **Express.js** | Minimalist web framework for routing and middleware |
| **MongoDB & Mongoose** | NoSQL database with strict schema validation |
| **JSON Web Tokens (JWT)** | Stateless, secure API authentication |
| **Node-Cron** | Automated synchronization scheduling |
| **Swagger / OpenAPI** | World-class interactive API documentation |

---

## 🚀 Quick Start

Get the engine running locally in less than 2 minutes.

### 1. Clone & Install
```bash
git clone <repository-url>
cd telebackend
npm install
```

### 2. Environment Configuration
Duplicate the example environment file and configure your local setup.
```bash
cp .env.example .env
```

| Environment Variable | Description |
|----------------------|-------------|
| `PORT` | The port the server runs on (default: `3000`) |
| `MONGODB_URI` | Your MongoDB connection string |
| `JWT_SECRET` | Cryptographic key for signing auth tokens |
| `ROOTMENTS_VERIFY_API` | External API for employee verification |
| `RENTAL_BOOKING_SUMMARY_API`| Sync endpoint for booking confirmations |
| `RENTAL_RETURN_REPORT_API` | Sync endpoint for return leads |
| `JUSTDIAL_API_URL` | Sync endpoint for JustDial leads |

### 3. Ignite the Server
```bash
# Development mode with hot-reloading
npm run dev

# Production mode
npm start
```

---

## 📖 API Documentation (Swagger)

The entire API surface is fully documented using Swagger OpenAPI 3.0. Once the server is running, explore the interactive docs at:
👉 **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

---

## 🧩 Core Systems & Workflows

### 🔐 Authentication (`/api/auth`)
Stateless JWT authentication. Telecallers login using `employeeId` (or `userId`) and `password`. The system automatically populates audit fields (`createdBy`, `updatedBy`) from the bearer token.

### 🎯 Lead Management (`/api/leads`)
The single source of truth for `booked`, `enquiry`, `bookingConfirmation`, `return`, and `justdial` leads. Supports advanced, ISO-compliant date filtering (`fromDate`, `toDate`) based on lead status (e.g., `updatedAt` for completed, `returnDate` for returns).

### 📞 Call Intelligence & Popups (`/api/customers`)
An optimized layer specifically designed to power incoming call UIs. When a call drops in, the API returns the exact popup type to display based on the customer's historical interactions and latest lead status.

### 🔄 Master Scheduler & Sync
- **Initial Sync**: Fetches the last 60 days of store, return, and booking data on startup.
- **Incremental Sync**: Runs every 30 minutes for the last 7 days.
- **Concurrency Control**: A resilient `synclock` collection prevents overlapping external API calls.

### 📊 Admin Console (`/api/admin`)
High-level aggregations and pivot data for dashboards, empowering administrators with insights on telecaller performance, complaint analytics, and total call durations.

---

<div align="center">
  <sub>Built with ❤️ for High-Velocity Telecalling Teams.</sub>
</div>

## Admin Panel (React SPA)
The backend also serves a fully integrated Admin Dashboard (React SPA).

- **URL:** `/` (Root URL of the backend deployment)
- **Fallback/Test Credentials:** 
  - **Username:** `admin`
  - **Password:** `admin123`
- **Pages:**
  - Dashboard (Overview stats & Leaderboard)
  - Telecallers (Call Category Report)
  - Telecaller Details (Summary & Recent Calls)

### Backend APIs for Admin

#### Admin Panel APIs (New)
The following endpoints reside under `/api/admin/` and are used by the modern Admin Dashboard:
- `POST /api/admin/login` - Authenticate admin users with username/password
- `POST /api/admin/logout` - Clear admin session cookies
- `GET /api/admin/dashboard-summary` - High-level total leads and summary statistics
- `GET /api/admin/telecaller-leaderboard` - Active telecaller leaderboard and performance
- `GET /api/admin/telecallers/:employeeId/summary` - Detailed metric summary for a single telecaller
- `GET /api/admin/telecallers/:employeeId/category-performance` - Performance breakdown across categories
- `GET /api/admin/telecallers/:employeeId/recent-calls` - View recent completed calls for a telecaller
- `GET /api/admin/reports/completed-leads` - Completed leads report
- `GET /api/admin/reports/completed-leads/export` - Export completed reports to CSV

#### Legacy Admin APIs
The following endpoints reside under `/api/admin/` for older admin integrations:
- `GET /api/admin/dashboard` - Get old style dashboard stats
- `GET /api/admin/telecaller-summary` - Old style telecaller summary stats
- `GET /api/admin/reports` - Get detailed reports of completed leads
- `GET /api/admin/complaints/pivot` - Complaints pivot breakdown
- `GET /api/admin/filter-options` - Retrieve filtering options for the legacy frontend

All APIs support optional date filtering (`fromDate`, `toDate`), which predominantly applies to the `updatedAt` field.
