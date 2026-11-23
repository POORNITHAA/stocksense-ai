# StockSense AI — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Owner Isolation**: Every business document (`products`, `skuIndex`, `suppliers`, `sales`, `stockMovements`, `purchaseOrders`, `forecasts`, `notifications`, `settings`) must carry `ownerId == request.auth.uid` on creation and preserve `ownerId` immutably on update.
2. **RBAC & No Self-Promotion**: New users default to `INVENTORY_MANAGER`. A user cannot set or elevate their own `role` to `ADMIN` during profile creation or update (only an existing `ADMIN` or the bootstrapped owner email may assign `ADMIN`).
3. **Non-Negative Stock & Pricing**: `products.quantity >= 0`, `products.purchasePrice >= 0`, `products.sellingPrice >= 0`, `products.minimumStock >= 0`, `products.safetyStock >= 0`.
4. **SKU Uniqueness**: Every product SKU for an owner maps 1:1 to a `/skuIndex/{ownerId}__{normalizedSku}` lock document created atomically in the same transaction.
5. **Immutable Audit Logs**: `sales` and `stockMovements` cannot be modified after creation (`allow update: if false`), and real (`dataSource == 'real'`) sales/movements cannot be deleted via client SDKs.
6. **PO Terminal State Lock**: Once a `purchaseOrder` reaches `Received` or `Cancelled`, non-admin updates are rejected.
7. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable; `updatedAt` must equal `request.time` on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation on Signup**: `POST /users/{uid}` with `{ role: "ADMIN" }` from non-admin non-bootstrapped email -> **REJECTED** (`PERMISSION_DENIED`).
2. **Self-Role Promotion**: `PATCH /users/{uid}` changing `role` from `INVENTORY_MANAGER` to `ADMIN` -> **REJECTED**.
3. **Cross-Tenant Read/List**: `GET /products` without `where('ownerId', '==', auth.uid)` or reading another owner's `productId` -> **REJECTED**.
4. **Owner Spoofing**: `POST /products/{id}` with `ownerId: "other_user_uid"` -> **REJECTED**.
5. **Shadow / Ghost Field Injection**: `POST /products/{id}` including `{ isApprovedBySystem: true }` -> **REJECTED** via `keys().hasOnly(...)`.
6. **Negative Stock Manipulation**: `PATCH /products/{id}` setting `quantity: -15` -> **REJECTED**.
7. **Unverified Email Write**: Write attempt with `request.auth.token.email_verified == false` -> **REJECTED**.
8. **Path ID Poisoning**: `PUT /products/invalid$id!@#` or 500-char doc ID -> **REJECTED** by `isValidId()`.
9. **Client Timestamp Forgery**: `POST /sales/{id}` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> **REJECTED**.
10. **Audit Ledger Tampering**: `PATCH /stockMovements/{id}` or `DELETE /sales/{id}` where `dataSource == "real"` -> **REJECTED**.
11. **Terminal PO Re-Opening**: `PATCH /purchaseOrders/{id}` changing `orderStatus` from `Received` back to `Ordered` by non-admin -> **REJECTED**.
12. **PII Directory Scraping**: `LIST /users` by an `INVENTORY_MANAGER` user -> **REJECTED**.
