# Project: Mlm_Backend

## Deploying to Render

1. **Prepare the blueprint** - Commit the included `render.yaml` file (already added) so Render knows how to build (`npm install && npm run prisma:generate`) and start (`npm run start:render`) the service.
2. **Provision a MySQL instance** - Render does not currently host MySQL, so create one with your preferred provider (e.g., Aiven, Neon for MySQL, PlanetScale) and copy the connection string into the `DATABASE_URL` environment variable on Render.
3. **Create the service** - In Render, choose *Blueprint Deploys*, connect this repository, and select the `render.yaml`. Render will create a Node web service named `mlm-auth-api`.
4. **Set environment variables** - At a minimum configure `DATABASE_URL`, `APP_URL` (your Render URL, e.g., `https://mlm-auth-api.onrender.com`), `JWT_SECRET`, and the SMTP/Twilio/Payment keys you plan to use. The blueprint marks the ones that Render should prompt you for.
5. **First deploy** - Render uses the `start:render` script which runs database migrations (`prisma migrate deploy`) before launching `node src/server.js`. Watch the deploy logs to confirm Prisma connects to your database and the server prints `listening on port`.
6. **Validate** - Hit `https://<service>.onrender.com/health` once the deploy succeeds. If CORS errors appear on the client, ensure `APP_URL` (and any frontend origins) are correct in `.env`/Render settings.

> Tip: for manual deploys without Blueprint, create a new Web Service from your repo, set the same build/start commands, and copy the environment variables listed above.

## End-point: http://localhost:5000/health
checkup
### Method: GET
>```
>http://localhost:5000/health
>```

⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/signup
signup
### Method: POST
>```
>http://localhost:5000/auth/signup
>```
### Body (**raw**)

```json
{"username":"rhi","email":"rishisurya1320@gmail.com","phone":"+919600421982","password":"StrongPiis987!"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/verify-phone-otp
verify Otp
### Method: POST
>```
>http://localhost:5000/auth/verify-phone-otp
>```
### Body (**raw**)

```json
 {"phone":"+919600421982","code":"395658"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/login
login
### Method: POST
>```
>http://localhost:5000/auth/login
>```
### Body (**raw**)

```json
{"identifier":"+919600421622","password":"StrongPass987!"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/set-pin
Set 4-digit Transaction pin
### Method: POST
>```
>http://localhost:5000/auth/set-pin
>```
### Body (**raw**)

```json
 {"pin":"9887"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/login
Login
### Method: POST
>```
>http://localhost:5000/auth/login
>```
### Body (**raw**)

```json
{"identifier":"rishisurya1320@gmail.com","password":"StrongPiis987!"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/login/request-otp
login request otp
### Method: POST
>```
>http://localhost:5000/auth/login/request-otp
>```
### Body (**raw**)

```json
{"identifier":"rishisurya1320@gmail.com"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/verify-otp
verify login using otp
### Method: POST
>```
>http://localhost:5000/auth/verify-otp
>```
### Body (**raw**)

```json
{"jhgj":"jhjhjh","type":"EMAIL","identifier":"rishisurya1320@gmail.com","code":"402139"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/forgot-password/request-otp
request otp for forgot password

### Method: POST
>```
>http://localhost:5000/auth/forgot-password/request-otp
>```
### Body (**raw**)

```json
{"identifier":"rishisurya1320@gmail.com"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/forgot-password/reset
Change password
### Method: POST
>```
>http://localhost:5000/auth/forgot-password/reset
>```
### Body (**raw**)

```json
{"type":"EMAIL","identifier":"rishisurya2024@gmail.com","code":"395741","newPassword":"ksjhiuSDF4839@"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/forgot-password/reset
### Method: POST
>```
>http://localhost:5000/auth/forgot-password/reset
>```
### Body (**raw**)

```json
{"identifier":"rishisurya1320@gmail.com","code":"614804","newPassword":"ksjhiuSDF4839@"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/forgot-pin/request-otp
Request otp for pin reset
### Method: POST
>```
>http://localhost:5000/auth/forgot-pin/request-otp
>```
### Body (**raw**)

```json
{"identifier":"+919600421982"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/forgot-pin/reset
Change pin
### Method: POST
>```
>http://localhost:5000/auth/forgot-pin/reset
>```
### Body (**raw**)

```json
{"identifier":"+919600421982","code":"876280","newPin":"0986"}
```


⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃

## End-point: http://localhost:5000/auth/logout
logout
### Method: POST
>```
>http://localhost:5000/auth/logout
>```

⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃ ⁃
_________________________________________________
## Wallet & Payments

- Auth uses the HTTP-only `access_token` cookie that login/OTP endpoints set. Ensure your API client sends cookies (`credentials: 'include'` in fetch/Axios `withCredentials: true`).

- GET `http://localhost:5000/wallet` — Get wallet balances (auth)
- POST `http://localhost:5000/wallet/transfer` — Referral → Main
  - Body: `{ "amount": 50, "pin": "1234" }`
  - Requires 4-digit transaction PIN set via `/auth/set-pin`.
- (Removed) Wallet-level withdraw route deprecated; use payments withdraw.
- GET `http://localhost:5000/wallet/transactions` — Transaction history (auth)

- POST `http://localhost:5000/payments/add-funds/order` — Create Razorpay order (live REST call)
  - Body: `{ "amount": 500, "currency": "INR" }`
  - Returns Razorpay order payload; `/webhooks/razorpay` credits wallet on success.

- POST `http://localhost:5000/payments/withdraw` — Withdraw from main wallet (Razorpay payouts semantics)
  - Body (UPI): `{ "amount": 1200, "method": "UPI", "pin": "1234", "details": { "vpa": "user@bank", "contact": { "name": "John", "email": "john@example.com", "phone": "+9199..." } } }`
  - Body (BANK): `{ "amount": 1200, "method": "BANK", "pin": "1234", "details": { "ifsc": "HDFC0001", "accountNumber": "1234567890", "accountName": "John Doe", "mode": "IMPS", "contact": { ... } } }`
  - Enforces min (₹100 default). Amounts above `WITHDRAW_ADMIN_THRESHOLD` stay pending until an admin approves (which triggers the Razorpay payout).
  - Requires Razorpay payout creds (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`).
  - Optional: pass existing Razorpay identifiers (`details.contactId`, `details.fundAccountId`) to reuse stored payout destinations.
  - Requires the user's 4-digit transaction PIN in every request.

- GET `http://localhost:5000/payments/transactions` - List payment transactions (add-funds + withdrawals)
  - Query: `?limit=20&cursor=<id>&type=ADD_FUNDS|WITHDRAW&status=PENDING|SUCCESS|FAILED`

- GET `http://localhost:5000/payments/plans` - List active token sale plans with computed INR price and token quantity. Tokens are priced at INR 10 each (configurable via `TOKEN_VALUE_INR`).

- POST `http://localhost:5000/payments/token/purchase` - Buy tokens using main wallet balance (alias: `/payments/token/order`).
  - Body: `{ "planId": "<plan-id>", "pin": "1234" }` or `{ "planName": "Starter", "pin": "1234" }`
  - Debits main balance, credits token balance, creates `Transaction`, `TokenPurchase`, and PDF invoice. Response includes `{ tokenPurchaseId, transactionId, tokens, tokenValueInr, amountInr, invoiceId, wallet }`.
  - Requires the 4-digit transaction PIN on every purchase.

- Razorpay webhook configuration (needed for `/payments/add-funds/order` to reflect in the wallet):
  1. Deploy or tunnel the backend so Razorpay can reach `POST https://<your-domain>/webhooks/razorpay`.
  2. In the Razorpay dashboard, add that URL as a webhook, enable at least the `order.paid` event, and set a secret.
  3. Copy the same secret into `.env` as `RAZORPAY_WEBHOOK_SECRET`, restart the server, and ensure the `/webhooks` route stays ahead of `express.json()` (already configured in `src/server.js`).
  4. When a payment succeeds, Razorpay sends the webhook, our handler verifies the signature, marks the transaction `SUCCESS`, and credits `Wallet.mainBalance`.

- GET `http://localhost:5000/payments/token/purchases` - Paginated token purchase history for the authenticated user.
  - Query: `?limit=20&cursor=<id>`
  - Returns plan info, tokens, prices, transaction summary, and invoice metadata.

- GET `http://localhost:5000/payments/token/purchases/:id/invoice` - Download the PDF invoice for a specific purchase (auth + ownership required).

- Admin endpoints
  - POST `http://localhost:5000/payments/withdrawals/:id/approve` — mark pending withdrawal SUCCESS (requires admin)
  - POST `http://localhost:5000/payments/withdrawals/:id/reject` — mark pending withdrawal FAILED and refund (requires admin)
  - Configure admins via `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` (comma-separated)

- POST `http://localhost:5000/webhooks/razorpay` — Razorpay webhook (configure secret)
- POST `http://localhost:5000/webhooks/stripe` — Stripe webhook (configure secret)

Environment keys in `.env`:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`
- `STRIPE_WEBHOOK_SECRET` (only for webhook verification; payments use Razorpay)
- `MIN_WITHDRAW_AMOUNT` (default 100)
- `WITHDRAW_ADMIN_THRESHOLD` (default 5000)
- `USD_INR_RATE`, `TOKEN_VALUE_INR`, `PLAN_STARTER_USD`, `PLAN_GROWTH_USD`, `PLAN_PRO_USD`, `PLAN_ELITE_USD`
Powered By: [postman-to-markdown](https://github.com/bautistaj/postman-to-markdown/)
