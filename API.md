# API Reference

Base URL: `http://localhost:5000/api`

Every response is wrapped:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": {}, "timestamp": "..." }
```

Protected routes need a header: `Authorization: Bearer <accessToken>`.
Amounts are in rupees (2 dp). Quantities in responses are in **base units**
(`g` / `ml` / `piece`) unless a field name says otherwise.

---

## 1. Authentication

### POST /auth/register → 201
```json
{ "name": "Asha", "email": "asha@example.com", "password": "Cake@1234", "businessName": "Asha's Bakes" }
```
Creates an unverified vendor and emails a 6-digit OTP (valid `OTP_EXPIRY_MINUTES`).
If an unverified account with that email exists it is refreshed instead of failing.
`409` if a verified account already exists.

```json
{ "message": "Registration successful. Please verify the OTP sent to your email.",
  "data": { "vendorId": "...", "email": "asha@example.com", "otpExpiresInMinutes": 10 } }
```

### POST /auth/verify-otp → 200
```json
{ "email": "asha@example.com", "otp": "483920" }
```
Activates the account and returns the JWT:
```json
{ "data": { "vendor": { }, "accessToken": "eyJ...", "expiresIn": "7d", "tokenType": "Bearer" } }
```
`400` invalid/expired OTP · `401` too many attempts.

### POST /auth/resend-otp → 200
`{ "email": "asha@example.com" }` — subject to the resend cooldown (`400` if too soon).

### POST /auth/login → 200
`{ "email": "asha@example.com", "password": "Cake@1234" }` → vendor + `accessToken`.
`401` for wrong credentials, unverified email, or a deactivated account.

### POST /auth/forgot-password → 200
`{ "email": "..." }` — always the same response (no email enumeration).

### POST /auth/reset-password → 200
`{ "email": "...", "otp": "123456", "newPassword": "NewCake@123" }`

### GET /auth/me → 200 🔒
Returns the authenticated vendor.

---

## 2. Vendor profile 🔒

| Method | Path | Body |
|---|---|---|
| GET | `/vendors/me` | — |
| PATCH | `/vendors/me` | `{ "name", "businessName", "phone", "currency" }` |
| PATCH | `/vendors/me/password` | `{ "currentPassword", "newPassword" }` |
| DELETE | `/vendors/me` | — (deactivates the account) |

---

## 3. Ingredients 🔒

### POST /ingredients → 201
```json
{
  "name": "Chocolate",
  "unit": "kg",
  "purchasePrice": 500,
  "purchaseQuantity": 1,
  "openingQuantity": 5,
  "minimumStockLevel": 1,
  "supplier": "Sweet Supplies Co."
}
```
→ `costPerBaseUnit = 500 / 1000 = 0.5` per `g`. Opening stock is written to the
ledger as an `OPENING_STOCK` transaction. `409` on a duplicate name.

Response `data` adds derived fields:
```json
{ "currentQuantity": 5000, "baseUnit": "g", "costPerBaseUnit": 0.5,
  "isLowStock": false, "stockValue": 2500, "costPerPurchaseUnit": 500,
  "currentQuantityInUnit": 5 }
```

### GET /ingredients → 200
Query: `page`, `limit`, `sortBy`, `sortOrder`, `search`, `isActive`, `lowStock`.
Returns `{ items: [...], meta: { total, page, limit, totalPages } }`.

### GET /ingredients/:id → 200
### PATCH /ingredients/:id → 200
`{ "name", "unit", "minimumStockLevel", "minimumStockUnit", "supplier", "notes", "isActive" }`
Stock quantity is **not** editable here — use the inventory endpoints.
`unit` may only change within the same family (`kg` ↔ `g`, never `kg` ↔ `ltr`).

### PATCH /ingredients/:id/price → 200
```json
{ "purchasePrice": 600, "purchaseQuantity": 1, "unit": "kg", "note": "Supplier hike" }
```
Updates the rate only (stock untouched), writes a price-history entry and
reports how many recipes are affected — all of which now cost with the new rate:
```json
{ "data": { "ingredient": {}, "previousCostPerBaseUnit": 0.5,
            "newCostPerBaseUnit": 0.6, "affectedRecipes": 3 } }
```

### GET /ingredients/:id/price-history → 200
Latest 100 changes, newest first, each with `previousCostPerBaseUnit` and
`source` (`CREATE` / `MANUAL_UPDATE` / `PURCHASE`).

### DELETE /ingredients/:id?force=true → 200
Soft delete (archive). `409` while the ingredient is used by an active recipe,
unless `force=true`.

---

## 4. Inventory 🔒

### POST /inventory/purchase → 201
```json
{ "ingredientId": "...", "quantity": 2, "unit": "kg", "totalCost": 1100, "updatePrice": true }
```
Adds stock. With `totalCost` and `updatePrice` (default `true`) the rate is
refreshed to this purchase's rate and logged in price history.

### POST /inventory/adjust → 201
```json
{ "ingredientId": "...", "quantity": -250, "unit": "g", "reason": "Stock count correction", "allowNegative": false }
```
`400` if the result would be negative and `allowNegative` is not `true`.

### POST /inventory/wastage → 201
`{ "ingredientId": "...", "quantity": 100, "unit": "g", "reason": "Spoiled" }`

### GET /inventory/transactions → 200
Query: `ingredientId`, `type` (`PURCHASE`, `PRODUCTION_CONSUMPTION`, `WASTAGE`,
`ADJUSTMENT`, `OPENING_STOCK`, `PRODUCTION_REVERSAL`), `from`, `to`, plus pagination.
Each entry carries `quantityBefore`, `quantityAfter`, `costPerBaseUnit`, `totalCost`.

### GET /inventory/low-stock → 200
Ingredients where `currentQuantity <= minimumStockLevel`.

### GET /inventory/valuation → 200
```json
{ "totalStockValue": 4821.5, "ingredientCount": 6, "breakdown": [ ] }
```

---

## 5. Recipes 🔒

### POST /recipes → 201
```json
{
  "name": "Chocolate Cake",
  "description": "Classic 1 kg chocolate cake",
  "baseServings": 1,
  "servingUnit": "kg",
  "items": [
    { "ingredientId": "<chocolate>", "quantity": 200, "unit": "g" },
    { "ingredientId": "<flour>",     "quantity": 300, "unit": "g" },
    { "ingredientId": "<sugar>",     "quantity": 200, "unit": "g" },
    { "ingredientId": "<eggs>",      "quantity": 4,   "unit": "piece" }
  ],
  "packagingCost": 30,
  "laborCost": 80,
  "utilityCost": 20,
  "wastageType": "PERCENTAGE",
  "wastageValue": 3,
  "wastageBasis": "INGREDIENT",
  "sellingPrice": 700,
  "scaleOverheads": true
}
```
`wastageType`: `NONE` | `FIXED` (rupees) | `PERCENTAGE` (0–100).
`wastageBasis`: `INGREDIENT` (default) | `SUBTOTAL`.

### GET /recipes → 200
Query: `search`, `isActive`, `ingredientId`, `withCost=true`, pagination.
With `withCost` each recipe gains a live `cost` summary.

### GET /recipes/:id → 200 · PATCH /recipes/:id → 200 · DELETE /recipes/:id → 200 (archive)

### Recipe ingredients
| Method | Path | Body |
|---|---|---|
| POST | `/recipes/:id/ingredients` | `{ "ingredientId", "quantity", "unit", "note" }` |
| PATCH | `/recipes/:id/ingredients/:ingredientId` | `{ "quantity", "unit" }` |
| DELETE | `/recipes/:id/ingredients/:ingredientId` | — |

`409` when adding an ingredient already in the recipe; `400` when removing the last one.

---

## 6. Costing 🔒

### GET /recipes/:id/cost?servings=2&sellingPrice=1500 → 200
(identical: `GET /costing/recipes/:id`)

```json
{
  "recipeId": "...", "recipeName": "Chocolate Cake",
  "baseServings": 1, "servings": 2, "servingUnit": "kg", "scaleFactor": 2,
  "lines": [
    { "name": "Chocolate", "recipeQuantity": 200, "recipeUnit": "g",
      "requiredQuantity": 400, "baseUnit": "g", "costPerBaseUnit": 0.5,
      "lineCost": 200, "availableQuantity": 5000, "shortage": 0, "isSufficient": true }
  ],
  "ingredientCost": 310, "packagingCost": 60, "laborCost": 160, "utilityCost": 40,
  "wastageCost": 9.3, "wastage": { "type": "PERCENTAGE", "value": 3, "basis": "INGREDIENT" },
  "totalCost": 579.3, "costPerServing": 289.65,
  "sellingPrice": 1400, "sellingPricePerServing": 700,
  "profit": 820.7, "profitPerServing": 410.35,
  "profitMarginPercent": 58.62, "markupPercent": 141.67, "breakEvenPrice": 579.3,
  "canProduce": true, "missingIngredients": [], "maxProducibleServings": 15,
  "pricedAt": "2026-01-01T10:00:00.000Z"
}
```
Always computed from **current** ingredient rates. `sellingPrice` is the only
money value a client may supply, and it is optional.

### POST /recipes/:id/scale → 200
```json
{ "servings": 2 }
```
Returns original vs scaled quantity per ingredient plus the full `cost` block.
The stored recipe is **not** modified.

### GET /recipes/:id/availability?servings=5 → 200
`canProduce`, `missingIngredients`, `maxProducibleServings`, and a per-ingredient
required/available/shortage list.

### POST /costing/recipes/:id/suggest-price → 200
```json
{ "targetMarginPercent": 40, "servings": 1 }
```
→ `suggestedSellingPrice = totalCost / (1 − margin/100)`, alongside the current
price and margin.

---

## 7. Production / Sale 🔒

### POST /recipes/:id/prepare → 201
(identical: `POST /production` with `recipeId` in the body)

```json
{ "servings": 2, "sellingPrice": 1500, "notes": "Birthday order", "preparedAt": "2026-01-01T09:00:00.000Z" }
```

The backend:
1. scales the recipe to `servings`
2. costs it at **current** ingredient prices
3. checks stock (`400` with the shortfall if anything is missing)
4. deducts every ingredient atomically (inside a transaction when available)
5. saves a production record with a per-ingredient snapshot
6. stores cost, selling price, profit and margin as of that moment

```json
{ "data": {
    "production": {
      "recipeName": "Chocolate Cake", "servings": 2, "scaleFactor": 2,
      "items": [ { "ingredientName": "Chocolate", "quantity": 400, "baseUnit": "g",
                   "costPerBaseUnit": 0.5, "lineCost": 200 } ],
      "ingredientCost": 310, "packagingCost": 60, "laborCost": 160,
      "utilityCost": 40, "wastageCost": 9.3, "totalCost": 579.3,
      "costPerServing": 289.65, "sellingPrice": 1500,
      "profit": 920.7, "profitMarginPercent": 61.38,
      "status": "COMPLETED", "preparedAt": "..."
    },
    "costBreakdown": { }
} }
```

This record never changes when ingredient prices change later.

### GET /production → 200
Query: `recipeId`, `status`, `from`, `to`, pagination.

### GET /production/:id → 200

### GET /production/summary?from=2026-01-01&to=2026-01-31 → 200
Totals for the period plus a per-recipe breakdown (batches, servings, cost,
revenue, profit, margin).

### PATCH /production/:id/cancel → 200
Restores the exact quantities to stock (logged as `PRODUCTION_REVERSAL`) and
marks the record `CANCELLED`. The recorded cost figures stay untouched.

---

## 8. Health

### GET /health → 200
`{ "status": "ok", "database": "connected", "uptimeSeconds": 42 }`

---

## Error codes

| Code | When |
|---|---|
| 400 | validation failure, unknown/incompatible unit, insufficient stock, bad OTP |
| 401 | missing/invalid/expired JWT, wrong credentials, unverified email |
| 404 | record not found **or owned by another vendor** |
| 409 | duplicate name, ingredient already in recipe, ingredient still in use |
| 500 | unexpected server error (logged with a stack trace) |
