# Kitchen Math & Costing System — Backend

A production-ready **NestJS + MongoDB** backend that tells a vendor or home chef what a
recipe *actually* costs to produce, and what they earn on every batch.

```
Vendor → Inventory → Recipes → Cost Calculation → Expenses → Selling Price → Profit → Inventory Deduction
```

---

## Table of contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Folder structure](#folder-structure)
- [Core concepts](#core-concepts)
  - [Base units](#base-units)
  - [Cost per base unit](#cost-per-base-unit)
  - [The costing formula](#the-costing-formula)
  - [Wastage](#wastage)
  - [Recipe scaling](#recipe-scaling)
  - [Why costs are never cached](#why-costs-are-never-cached)
  - [Decimal-safe money](#decimal-safe-money)
- [Business rules enforced](#business-rules-enforced)
- [Response format](#response-format)
- [API documentation](#api-documentation)
- [Seed data](#seed-data)
- [MongoDB transactions](#mongodb-transactions)
- [Indexes](#indexes)

---

## Quick start

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env
#    set MONGODB_URI and a JWT_SECRET (16+ characters)
#    RESEND_API_KEY is optional in development - OTPs are printed to the console

# 3. run
npm run start:dev          # http://localhost:5000/api

# 4. (optional) sample data
npm run seed               # demo@kitchen.test / Demo@1234
```

Health check: `GET http://localhost:5000/api/health`

Requirements: Node 18+, MongoDB 5+ (a replica set or Atlas cluster if you want
multi-document transactions — see [MongoDB transactions](#mongodb-transactions)).

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `5000` | |
| `MONGODB_URI` | **yes** | — | e.g. `mongodb://127.0.0.1:27017/kitchen_costing` |
| `JWT_SECRET` | **yes** | — | minimum 16 characters |
| `JWT_EXPIRES_IN` | no | `7d` | |
| `RESEND_API_KEY` | no | — | when empty, OTP emails are logged to the console |
| `RESEND_FROM_EMAIL` | no | `onboarding@resend.dev` | must be a verified Resend sender |
| `OTP_EXPIRY_MINUTES` | no | `10` | |
| `OTP_MAX_ATTEMPTS` | no | `5` | wrong guesses before the OTP is locked |
| `OTP_RESEND_COOLDOWN_SECONDS` | no | `60` | |
| `BCRYPT_SALT_ROUNDS` | no | `10` | |
| `USE_TRANSACTIONS` | no | `true` | set `false` for standalone MongoDB |
| `API_PREFIX` | no | `api` | |

The app **fails to boot** if a required variable is missing (Joi schema in
`src/config/env.validation.ts`). No secret is ever hardcoded.

---

## Folder structure

```
src/
├── main.ts                     bootstrap, global pipes, CORS, prefix
├── app.module.ts               module wiring + global filter/interceptor
├── health.controller.ts
├── config/
│   ├── configuration.ts        typed config factory
│   └── env.validation.ts       Joi schema, fails fast
├── database/database.module.ts Mongoose connection
├── common/
│   ├── decorators/             @CurrentVendor, @Public
│   ├── dto/                    pagination, ObjectId param
│   ├── filters/                AllExceptionsFilter
│   ├── interceptors/           ResponseInterceptor (uniform envelope)
│   └── utils/
│       ├── money.util.ts       decimal.js helpers
│       └── unit.util.ts        unit conversion + validation
├── mail/                       Resend wrapper (dev fallback to console)
├── auth/                       register, OTP, login, reset, JWT strategy/guard
├── vendors/                    profile, password change, deactivate
├── ingredients/                catalogue + rates + price history
├── inventory/                  purchases, adjustments, wastage, ledger
├── recipes/                    CRUD, recipe items, scaling, availability
├── costing/                    the costing engine (single source of truth)
├── production/                 prepare/sell, frozen snapshots, summary
└── seed/seed.ts                sample vendor, ingredients, recipes
```

Controllers only parse/return. All logic lives in services; costing lives in
exactly one reusable service (`CostingService`) used by recipes, costing and
production.

---

## Core concepts

### Base units

Everything is stored in a base unit so mixed units can be compared safely:

| Family | Base unit | Accepted input units |
|---|---|---|
| WEIGHT | `g` | `mg`, `g`, `gram`, `kg` |
| VOLUME | `ml` | `ml`, `l`, `ltr`, `litre` |
| COUNT | `piece` | `piece`, `pcs`, `unit`, `dozen` |

You may buy in `kg` and write the recipe in `g` — the API converts. Mixing
families (`kg` vs `ltr`) is rejected with `400`.

### Cost per base unit

```
costPerBaseUnit = purchasePrice / toBaseUnits(purchaseQuantity, unit)
```

> 1 kg chocolate for ₹500 → 500 / 1000 = **₹0.50 per g**
> A recipe needing 200 g → 200 × 0.50 = **₹100**

Rates keep 6 decimals internally so cheap-per-gram items don't round to zero.

### The costing formula

```
scaleFactor      = servings / baseServings
lineCost         = recipeBaseQuantity × scaleFactor × ingredient.costPerBaseUnit
ingredientCost   = Σ lineCost
overheads        = (packaging + labor + utility) × (scaleOverheads ? scaleFactor : 1)
wastageCost      = see below
totalCost        = ingredientCost + packaging + labor + utility + wastage
costPerServing   = totalCost / servings
profit           = sellingPrice − totalCost
profitMargin %   = profit / sellingPrice × 100
markup %         = profit / totalCost × 100
breakEvenPrice   = totalCost
```

Worked example (the one from the spec):

| | |
|---|---:|
| Ingredients | ₹320.00 |
| Packaging | ₹30.00 |
| Labor | ₹80.00 |
| Utilities | ₹20.00 |
| Wastage | ₹10.00 |
| **Total cost** | **₹460.00** |
| Selling price | ₹700.00 |
| **Profit** | **₹240.00** |
| **Margin** | **34.29 %** |

### Wastage

| `wastageType` | `wastageValue` means | Calculation |
|---|---|---|
| `NONE` | — | `0` |
| `FIXED` | rupees per base batch | `value × (scaleOverheads ? scaleFactor : 1)` |
| `PERCENTAGE` | percent, 0–100 | `basis × value / 100` |

For `PERCENTAGE`, `wastageBasis` decides the basis:

- `INGREDIENT` *(default)* — percentage of ingredient cost only
- `SUBTOTAL` — percentage of ingredient + packaging + labor + utility

### Recipe scaling

A recipe stores quantities for **one base batch** (`baseServings` +
`servingUnit`, e.g. `1 kg`). `POST /recipes/:id/scale` returns scaled
quantities plus a full cost breakdown **without modifying the stored recipe**:

```
1 kg → 2 kg   Chocolate 200 g → 400 g, Flour 300 g → 600 g, Eggs 4 → 8
```

`scaleOverheads` (default `true`) controls whether packaging/labor/utility and
the selling price scale with the batch. Set it to `false` when those costs are
flat per batch regardless of size.

### Why costs are never cached

Recipes store **no** computed cost. Every cost response is derived from the
ingredients' *current* `costPerBaseUnit`, so a price change is reflected
everywhere the moment it is saved:

```
Chocolate ₹500/kg → ₹600/kg
→ every recipe using chocolate immediately costs more, with no migration
```

The only place costs are frozen is a **production record**, which stores a full
snapshot (per-ingredient quantity, rate and line cost) at the moment of
production. Those numbers never change afterwards. `PriceHistory` records every
rate change (`CREATE` / `MANUAL_UPDATE` / `PURCHASE`) so old records can still
be explained.

### Decimal-safe money

All arithmetic runs through `decimal.js` (`src/common/utils/money.util.ts`) and
is rounded once, at the end (money 2 dp, quantities 4 dp, rates 6 dp). No
`0.30000000000000004` in your ₹ totals.

---

## Business rules enforced

- **Vendor isolation** — every schema carries a `vendor` reference and every
  query filters on the id taken from the JWT. There is no endpoint that accepts
  a vendor id from the client, so cross-vendor access is impossible.
- **Never trust the frontend** — only `servings`, `sellingPrice` and the recipe
  inputs are accepted. Every cost, profit and margin is computed server-side,
  and `forbidNonWhitelisted` rejects any payload that smuggles in extra fields.
- **Stock can't go negative** — deduction uses a conditional atomic update
  (`currentQuantity: { $gte: required }`), which is race-safe. Manual
  adjustments require an explicit `allowNegative: true` to go below zero.
- **Inventory is a ledger** — quantity is never edited directly through the
  ingredient endpoints; every movement writes an `InventoryTransaction` with
  before/after quantities.
- **Unit validation** — units must be known and belong to the ingredient's
  family; changing `kg` → `ltr` on an existing ingredient is rejected.
- **Recipe validation** — at least one ingredient, no duplicates, every
  ingredient owned by the vendor and not archived.
- **Historical integrity** — production records are snapshots; cancelling one
  restores stock but leaves its cost figures untouched.

---

## Response format

Success (via the global interceptor):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Cost calculated",
  "data": { },
  "timestamp": "2026-01-01T10:00:00.000Z"
}
```

Error (via the global exception filter):

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": ["servings must be a positive number"],
  "path": "/api/recipes/.../prepare",
  "timestamp": "2026-01-01T10:00:00.000Z"
}
```

Status codes: `200` reads/updates, `201` creates, `400` validation, `401`
auth, `404` not found, `409` duplicates/conflicts, `500` unexpected.

---

## API documentation

Full endpoint reference with request/response examples: **[API.md](./API.md)**

Summary:

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/me` |
| Vendor | `GET/PATCH /vendors/me`, `PATCH /vendors/me/password`, `DELETE /vendors/me` |
| Ingredients | `POST/GET /ingredients`, `GET/PATCH/DELETE /ingredients/:id`, `PATCH /ingredients/:id/price`, `GET /ingredients/:id/price-history` |
| Inventory | `POST /inventory/purchase`, `/inventory/adjust`, `/inventory/wastage`, `GET /inventory/transactions`, `/inventory/low-stock`, `/inventory/valuation` |
| Recipes | `POST/GET /recipes`, `GET/PATCH/DELETE /recipes/:id`, `POST/PATCH/DELETE /recipes/:id/ingredients[/:ingredientId]` |
| Costing | `GET /recipes/:id/cost`, `GET /costing/recipes/:id`, `POST /costing/recipes/:id/suggest-price`, `POST /recipes/:id/scale`, `GET /recipes/:id/availability` |
| Production | `POST /recipes/:id/prepare`, `POST /production`, `GET /production`, `GET /production/summary`, `GET /production/:id`, `PATCH /production/:id/cancel` |

All routes except `/auth/*` and `/health` require `Authorization: Bearer <token>`.

---

## Seed data

`npm run seed` creates a verified vendor (`demo@kitchen.test` / `Demo@1234`)
with six ingredients (chocolate, flour, sugar, eggs, butter, milk) and two
recipes (Chocolate Cake 1 kg, Banana Bread). It prints the recipe ids and a
sample URL to try. Re-running it wipes and recreates that vendor's data only.

---

## MongoDB transactions

Production and cancellation wrap all stock movements plus the production record
in a single `session.withTransaction(...)`, so a failure halfway through a
multi-ingredient deduction rolls everything back.

Transactions need a replica set. On a standalone local MongoDB, the service
detects the unsupported-operation error, logs a warning and retries the same
work without a session — the conditional `$gte` update still prevents
overselling. Set `USE_TRANSACTIONS=false` to skip the attempt entirely.

To run a single-node replica set locally:

```bash
mongod --replSet rs0 --dbpath /data/db
mongosh --eval 'rs.initiate()'
# MONGODB_URI=mongodb://127.0.0.1:27017/kitchen_costing?replicaSet=rs0
```

---

## Indexes

| Collection | Index | Purpose |
|---|---|---|
| vendors | `{ email: 1 }` unique | login lookup |
| otps | `{ email, purpose, consumedAt }` | fetch pending OTP |
| otps | `{ expiresAt: 1 }` TTL | auto-purge expired OTPs |
| ingredients | `{ vendor, name }` unique | isolation + no duplicate names |
| ingredients | `{ vendor, isActive }`, `{ vendor, currentQuantity }` | listing, low-stock |
| pricehistories | `{ vendor, ingredient, createdAt: -1 }` | rate timeline |
| inventorytransactions | `{ vendor, createdAt: -1 }`, `{ vendor, ingredient, createdAt: -1 }`, `{ vendor, type, createdAt: -1 }` | ledger queries |
| recipes | `{ vendor, name }` unique, `{ vendor, isActive }`, `{ vendor, 'items.ingredient' }` | listing + "which recipes use X" |
| productions | `{ vendor, preparedAt: -1 }`, `{ vendor, recipe, preparedAt: -1 }`, `{ vendor, status }` | history + reports |
