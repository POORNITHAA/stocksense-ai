# StockSense AI — Intelligent Inventory Management and Demand Forecasting Platform

StockSense AI is a full-stack SaaS inventory management, POS billing, procurement, statistical demand forecasting, and Gemini-powered business analytics platform built for general retail stores and supermarkets. Every operation persists in Google Cloud Firestore with owner-isolated access control and server-side validation.

---

## 1. Project Overview

Retail store managers and supermarket operators often rely on fragmented spreadsheets that fail to link point-of-sale activity, physical inventory movements, supplier lead times, and future demand projections. StockSense AI unifies these workflows into one real-time operational workspace:

- **Live Inventory Ledger**: Atomic stock-in, stock-out, and physical count adjustments with negative-stock prevention and audit trails.
- **POS & Sales Invoices**: Multi-item retail checkout with automatic revenue/gross-profit calculation and atomic stock deduction.
- **Supplier & Purchase Order Lifecycle**: Vendor lead-time management, multi-SKU purchase orders, partial delivery receiving, and idempotent goods receipt processing.
- **Statistical Demand Forecasting & Smart Reorder**: Moving Average, Weighted Moving Average, and Ordinary Least Squares Linear Regression forecasting with chronological holdout MAE evaluation, paired with editable lead-time, safety-stock, and target-stock reorder recommendations.
- **Server-Side AI Business Assistant**: Conversational Google Gemini analyst grounded exclusively on verified Firestore metrics computed on the backend, with explicit confirmation before creating any purchase order.
- **Analytics, Exports & Alerts**: 10 live operational reports, interactive Recharts visualizations, CSV and PDF report exports, and a deduplicated notification center.

---

## 2. Features

- **Authentication & Role-Based Access Control (RBAC)**
  - Firebase Authentication supporting Google Sign-In and Email/Password registration, login, email verification gating, and password reset.
  - Protected frontend routes (`ProtectedRoute`) and Firestore Security Rules enforcing owner isolation (`ownerId == request.auth.uid`) plus `ADMIN` vs `INVENTORY_MANAGER` permissions.
  - Admin-only User Management console (`/users`) for viewing registered team members and updating roles.
- **Idempotent Demo Supermarket Dataset**
  - First-login seeding of **25 supermarket products** across 5 categories, **5 suppliers** with lead times, **90+ days of realistic sales history**, sample purchase orders, and stock movements (`dataSource = "sample"`).
  - Global header filter (`All Data` / `Sample` / `Real`) and a safe **Clear Sample Records** / **Restore Sample Dataset** workflow in Settings that preserves user-created records (`dataSource = "real"`).
- **Product Catalog & Inventory Control**
  - Complete product CRUD, image upload with automatic client-side compression, SKU uniqueness lock (`skuIndex`), search, category/supplier/stock/status filters, sorting, and pagination.
  - Atomic stock-in, stock-out, and count adjustments (`runTransaction`) with movement history and automatic low-stock / out-of-stock notification generation.
- **Sales & POS Checkout**
  - Multi-item invoice builder supporting Cash, UPI, Card, and Credit payments, real-time margin calculation, duplicate-submission idempotency, and CSV export.
- **Suppliers & Purchase Orders**
  - Supplier CRUD with bidirectional catalog product mapping and lead-time tracking.
  - PO workflow (`Draft` → `Pending` → `Approved` → `Ordered` → `Partially Received` → `Received` / `Cancelled`) with batch receipt idempotency (`receiptIds`) so inventory only increments when goods are actually received.
- **Demand Forecasting & Smart Reorder**
  - Dedicated TypeScript forecasting engine (`server/forecasting/engine.ts`) with daily, weekly, and monthly aggregation, zero-sales date filling, and 7-day, 30-day, and 90-day horizons.
  - Strict chronological train/test walk-forward validation reporting holdout MAE (Mean Absolute Error) and demand trend classification (`Increasing`, `Decreasing`, `Stable`), plus Firestore persistence for saved forecast history.
  - Smart Reorder calculator computing `Expected Lead-Time Demand`, `Reorder Point = Expected Lead-Time Demand + Safety Stock`, and `Suggested Reorder Qty = max(0, Target Stock - Current Stock)` with editable overrides and plain-English explanations.
- **AI Business Assistant**
  - Server-side Express API (`/api/assistant/chat` and `/api/assistant/dashboard-summary`) verifying Firebase ID tokens before querying the caller's Firestore data and computing business metrics in Node.js.
  - Never exposes `GEMINI_API_KEY` to the browser and enforces explicit UI confirmation before creating any suggested purchase order.
- **Analytics, Reports & Notifications**
  - 10 interactive report tabs: Daily Sales, Weekly Sales, Monthly Revenue, Gross Profit, Product Performance, Category Performance, Inventory Valuation, Stock Movements, Supplier Purchases, and Forecast Evaluation.
  - Date range, category, and product filters; CSV and PDF exports (`jspdf` + `jspdf-autotable`); and Notification Center with unread filter, mark-read, mark-all-read, and dismiss actions.

---

## 3. Architecture

### System Overview

```text
Browser SPA (React 19 + Vite)
 ├── Firebase Auth SDK (ID tokens + email verification)
 ├── Cloud Firestore SDK (Real-time onSnapshot & runTransaction writes scoped by ownerId)
 └── Express Backend (/api/* proxy & analytics engine on port 3000)
      ├── Firebase Token Verification Middleware (server/middleware/auth.ts)
      ├── Authenticated Firestore REST Client (server/lib/firebaseAuth.ts)
      ├── Statistical Forecasting Engine (server/forecasting/engine.ts)
      ├── Backend Metrics Aggregator (server/services/businessAnalytics.ts)
      └── Google Gemini SDK (@google/genai) using server-only GEMINI_API_KEY
```

### Security & Data Ownership Model

- **Database Isolation**: Every domain document includes `ownerId`. `firestore.rules` requires `request.auth != null && request.auth.token.email_verified == true` and verifies `ownerId == request.auth.uid` on reads and writes.
- **RBAC Protection**: New sign-ups default to `INVENTORY_MANAGER` and cannot self-escalate to `ADMIN` via client writes. Deleting `"real"` products or suppliers, listing all users, and assigning roles are restricted to `ADMIN` accounts.
- **API & Secret Protection**: All `/api/*` endpoints (except `/api/health`) require a valid `Authorization: Bearer <Firebase ID Token>` header. Backend Firestore reads forward the caller's token to Firestore REST APIs so security rules remain enforced end-to-end. `GEMINI_API_KEY` is read exclusively inside `server/services/geminiAssistant.ts`.

---

## 4. Technology Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, React Router v7, Recharts v3, Lucide React, Motion, jsPDF & jspdf-autotable |
| **Backend** | Node.js 22, Express 4, TypeScript (`tsx` in dev, native Node type-stripping in production `server.ts`) |
| **Database & Auth** | Google Cloud Firestore, Firebase Authentication (`firebase` v13) |
| **AI & Analytics** | Google Gemini API (`@google/genai` SDK, `gemini-4-hydrogen`), custom TypeScript statistical forecasting & holdout evaluation engine |
| **Deployment** | Google Cloud Run via Google AI Studio (`npm run build` + `npm start`) |

---

## 5. Database Structure (Cloud Firestore)

Firestore database ID: `ai-studio-c7affb91-0e56-44bd-ae9f-5bf2049d1268`

| Collection | Document Key | Primary Fields & Purpose |
| --- | --- | --- |
| `users` | `{uid}` | `uid`, `name`, `email`, `role` (`ADMIN` \| `INVENTORY_MANAGER`), `photoUrl`, `createdAt`, `updatedAt` |
| `products` | `{productId}` | `productId`, `ownerId`, `name`, `sku`, `barcode`, `category`, `purchasePrice`, `sellingPrice`, `quantity`, `minimumStock`, `safetyStock`, `supplierId`, `unit`, `imageUrl`, `isActive`, `dataSource` |
| `skuIndex` | `{ownerId}__{SKU}` | `ownerId`, `sku`, `productId`, `createdAt` — guarantees atomic per-owner SKU uniqueness |
| `suppliers` | `{supplierId}` | `supplierId`, `ownerId`, `name`, `company`, `email`, `phone`, `address`, `suppliedProducts`, `leadTimeDays`, `status`, `dataSource` |
| `sales` | `{saleId}` | `saleId`, `ownerId`, `invoiceNumber`, `items[]`, `totalAmount`, `totalCost`, `totalProfit`, `paymentMethod`, `saleDate`, `dataSource` |
| `stockMovements` | `{movementId}` | `movementId`, `ownerId`, `productId`, `productName`, `movementType`, `quantity`, `previousStock`, `newStock`, `referenceId`, `reason`, `dataSource` |
| `purchaseOrders` | `{purchaseOrderId}` | `purchaseOrderId`, `ownerId`, `poNumber`, `supplierId`, `supplierName`, `items[]`, `totalAmount`, `orderStatus`, `orderDate`, `expectedDeliveryDate`, `receivedDate`, `receiptIds[]`, `dataSource` |
| `forecasts` | `{forecastId}` | `forecastId`, `ownerId`, `productId`, `productName`, `algorithm`, `aggregation`, `forecastHorizon`, `predictions[]`, `evaluationMetrics`, `generatedAt`, `dataSource` |
| `notifications` | `{notificationId}` | `notificationId`, `ownerId`, `title`, `message`, `notificationType`, `conditionKey`, `isRead`, `createdAt` |
| `settings` | `{ownerId}` | `ownerId`, `storeName`, `currency`, `timezone`, `defaultSafetyStock`, `defaultLeadTimeDays`, `lowStockThreshold`, `theme`, `demoSeeded`, `updatedAt` |
| `assistantMessages` | `{messageId}` | `messageId`, `ownerId`, `role` (`user` \| `assistant`), `content`, `dataSourceFilter`, `metricsTimestamp`, `createdAt` |

---

## 6. Installation Instructions

1. **Prerequisites**
   - Node.js 22+ (`node -v` >= `v22.x`)
   - Firebase project configured in `/firebase-applet-config.json`
2. **Install Dependencies**
   ```bash
   npm install
   ```
3. **Start Development Server (Express + Vite Middleware on port 3000)**
   ```bash
   npm run dev
   ```
4. **Firebase Console Configuration**
   - Google Sign-In is ready immediately.
   - To allow Email/Password registration and login, open **Firebase Console → Authentication → Sign-in method** and enable **Email/Password**.
   - **Promoting First Admin**: All self-registered users start as `INVENTORY_MANAGER`. To promote a user in Firestore Database `ai-studio-c7affb91-0e56-44bd-ae9f-5bf2049d1268`, open `users/{uid}` and set `role` to `"ADMIN"`.

---

## 7. Environment Variables

Defined in `/.env.example` (never commit secrets or `.env` files to source control):

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Server only | Google Gemini API key configured via **Google AI Studio → Settings → Secrets** (or Cloud Run Secrets). Never exposed to frontend code. |
| `APP_URL` | Auto-injected | Server | Hosted application URL injected at runtime by Google AI Studio / Cloud Run. |
| `PORT` | Optional | Server | Listening port for `server.ts` (defaults to `3000`). |
| `NODE_ENV` | Production | Server | Set to `production` when running `npm start` to serve the compiled `dist/` SPA bundle. |

Firebase client public configuration lives in `/firebase-applet-config.json` (project ID, API key, auth domain, and Firestore database ID).

---

## 8. Testing Instructions

Run the verification commands below from the project root:

```bash
# 1. TypeScript type-check across frontend and backend
npm run lint

# 2. Lint Cloud Firestore security rules
npx eslint firestore.rules

# 3. Production Vite build (compiles static bundle into dist/)
npm run build

# 4. Start production server (Node 22+ executes server.ts directly)
NODE_ENV=production PORT=3000 npm start
```

### Functional Verification Checklist

- **Auth & RBAC**: Register or sign in via Google, refresh browser to verify session persistence, and confirm non-admin users cannot access `/users` role management or delete `"real"` records.
- **Catalog, Inventory & POS**: Create a product, attempt duplicate SKU creation (blocked), perform Stock In / Stock Out (negative stock blocked), and complete a multi-item POS sale confirming stock deduction, gross profit calculation, and reload persistence.
- **Suppliers & PO Receiving**: Link products to a supplier, create a PO, record a partial delivery (`Partially Received`), record the remaining balance (`Received`), and confirm stock and movement logs update once per batch.
- **Forecasting & Reorder**: Run MA, WMA, and Linear Regression forecasts across `daily`, `weekly`, and `monthly` aggregations; inspect holdout MAE; save to Firestore; and adjust Smart Reorder parameters to verify updated ROP and suggested PO quantities.
- **Gemini AI Assistant**: Ask inventory/sales/PO questions with `"sample"` and `"real"` filters, verify `assistantMessages` persist across page reload, and test the confirmation-gated PO creation modal.
- **Analytics & Exports**: Filter reports by date/category/product, export `.csv` and `.pdf` files, and mark notifications as read.

---

## 9. Deployment Instructions (Google Cloud Run via Google AI Studio)

StockSense AI is configured for seamless deployment from Google AI Studio to **Google Cloud Run**:

1. **Secrets Configuration**
   - In Google AI Studio, open **Settings → Secrets** and ensure `GEMINI_API_KEY` is set with a valid Gemini API key.
2. **Firebase Security Rules & Auth Providers**
   - Verify `firestore.rules` is deployed to project `driven-superstate-qxhgq` / database `ai-studio-c7affb91-0e56-44bd-ae9f-5bf2049d1268`.
   - Enable **Email/Password** in Firebase Authentication if users will register with email/password.
   - After Cloud Run generates your production `.run.app` domain, add that domain to **Firebase Console → Authentication → Settings → Authorized domains** so Google Sign-In works on the live URL.
3. **Production Build & Entrypoint**
   - Google Cloud Run executes:
     - Build: `npm run build` (outputs static assets to `dist/`)
     - Start: `npm start` (`node server.ts` on `process.env.PORT || 3000`, serving `/api/*` endpoints alongside `dist/` with SPA fallback)
4. **Deploy**
   - Click **Deploy → Cloud Run** in Google AI Studio and verify `/api/health` returns `{"status":"ok"}`.
