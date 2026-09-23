# AI Workstation Cloud Server

Independent backend service for WeChat QR login, WeChat Pay V3, membership subscriptions, and external API gateways. Built with **Hono**, **Drizzle ORM**, and **PostgreSQL**.

---

## Quick Start (Development)

### 1. Install dependencies from workspace root
```bash
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your credentials when ready:
```bash
cp .env.example .env
```
*(If credentials are not yet configured, the server automatically boots in developer simulation mode with mock QR scans and mock payments)*

### 3. Start Development Server
```bash
# In server directory:
pnpm dev

# Or from root directory:
pnpm --filter @aiworkstation/cloud-server dev
```
The server will run at `http://localhost:4000`.

---

## Database Migrations (PostgreSQL)

When your PostgreSQL instance is ready, update `DATABASE_URL` in `.env`:
```bash
# Push schema changes to database directly
pnpm db:push

# Or generate and run migrations
pnpm db:generate
pnpm db:migrate
```

---

## API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Server health check | No |
| `GET` | `/api/auth/wx/qrcode` | Generate WeChat QR code & Ticket | No |
| `GET` | `/api/auth/wx/callback` | WeChat OAuth redirect callback | No |
| `GET` | `/api/auth/wx/check` | Poll QR code login status (`?ticket=xxx`) | No |
| `GET` | `/api/auth/me` | Current user profile & membership | Yes (`Bearer <token>`) |
| `GET` | `/api/pay/plans` | List available subscription plans | No |
| `POST` | `/api/pay/create-order` | Create order & get WeChat Native QR code | Yes (`Bearer <token>`) |
| `POST` | `/api/pay/wx-notify` | WeChat Pay V3 Webhook (Raw Body verification) | No |
| `GET` | `/api/pay/order-status/:orderNo` | Poll payment and fulfillment status | No |
| `POST` | `/api/pay/mock-fulfill/:orderNo` | Developer mock fulfillment trigger | No |
