# Logistics Twin - Manual Setup & Cloud Configuration Guide

> [!NOTE]
> Logistics Twin is designed with **Dual-Mode Architecture**. In **Offline Demo Mode**, zero environment variables or cloud setup are required—evaluators can clone and run `npm install && npm run dev` immediately. Follow this guide when provisioning the multi-tenant Supabase database and production Vercel deployment.

---

## 1. Supabase Cloud Setup

### 1.1 Create Supabase Project
1. Navigate to [Supabase Console](https://supabase.com/dashboard/projects) and log in.
2. Click **New Project**.
3. Choose an organization, enter Project Name: `reroute-ai-production`.
4. Generate and securely store a strong database password.
5. Select Region: **South Asia (Mumbai) `ap-south-1`** for lowest latency on Indian logistics corridors.
6. Click **Create new project**.

---

### 1.2 Run Schema Migrations
1. In the Supabase project sidebar, click **SQL Editor** (icon with `>_`).
2. Click **New Query**.
3. **Logistics Twin Migration (Required)**: Copy the entire contents of [supabase/migrations/20261025000000_logistics_twin_schema.sql](supabase/migrations/20261025000000_logistics_twin_schema.sql) and click **Run**.
   - Creates the 10 core Logistics Twin relational tables: `organizations`, `profiles`, `networks`, `suppliers`, `warehouses`, `buyers`, `routes`, `vehicles`, `disruption_scenarios`, `plans`, `trips`, and `audit_log`.
   - Enforces strict DB CHECK constraints mirroring engine domain shapes (stock limits, capacities, 4 vehicle truck classes, positive metrics).
   - Installs Row-Level Security (RLS) on all tables with multi-tenant isolation via `public.current_org_id()`.
   - Installs security-definer RPCs: `publish_plan(plan_id)`, `update_trip_status(trip_id, status)`, `reset_demo_network()`.
   - Sets up Realtime replication for `networks`, `disruption_scenarios`, `plans`, and `trips`.
4. *(Optional / Legacy ReRoute)*: If maintaining compatibility with legacy ReRoute tables:
   - Run [supabase/migrations/20261022000000_create_reroute_schema.sql](supabase/migrations/20261022000000_create_reroute_schema.sql) and [supabase/migrations/20261022000001_handle_new_user_and_profiles.sql](supabase/migrations/20261022000001_handle_new_user_and_profiles.sql).

---

### 1.3 Seed Demonstration Data & Multi-Role Demo Users
Seed the complete Western Maharashtra corridor network and create the 3 role accounts using the seed script:
```bash
# In your terminal (with Node 18+):
SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>" \
VITE_SUPABASE_URL="https://<your-project>.supabase.co" \
DEMO_PASSWORD="DemoPassword2026!" \
node scripts/seed-twin.mjs
```
This script automatically:
1. Connects via Supabase Admin service-role client.
2. Creates the default organization `demo-org` (Western Corridor Logistics Consortium).
3. Reads the exact demo network from [src/data/networkDemo.js](src/data/networkDemo.js) without duplication and inserts all suppliers, warehouses, buyers, routes, and vehicles into Supabase.
4. Provisions 3 authenticated multi-role test accounts:
   - **Planner**: `planner@demo.reroute` (Role: `planner`, Full network control)
   - **Driver**: `driver@demo.reroute` (Role: `driver`, linked to vehicle `veh-nashik-1`)
   - **Buyer**: `buyer@demo.reroute` (Role: `buyer`, linked to buyer `buy-thane-med`)
5. Passes validation and verifies idempotent upserts.

---

### 1.4 Retrieve API Credentials
1. In the Supabase sidebar, go to **Project Settings** > **API**.
2. Copy the following keys:
   - **Project URL** (e.g. `https://xyzcompany.supabase.co`)
   - **anon / public key** (safe for client-side browser requests)
   - **service_role key** (secret key with elevated admin permissions—**never expose to frontend**)

---

## 2. Vercel Project & Environment Configuration

### 2.1 Connect Repository to Vercel
1. Navigate to [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** > **Project**.
3. Import the GitHub repository: `https://github.com/arpitahyalij28-dot/ReRouteAI`.
4. Framework Preset: **Vite**.
5. Root Directory: `./`.

---

### 2.2 Configure Environment Variables
In the Vercel project deployment screen (or **Settings** > **Environment Variables**), add the following keys:

| Variable Name | Scope | Description | Where to Obtain |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Production & Preview (Client) | Supabase project REST URL | Supabase Dashboard > Settings > API |
| `VITE_SUPABASE_ANON_KEY` | Production & Preview (Client) | Supabase public anonymous API key | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Production & Preview (Serverless only) | Secret service role key for administrative functions | Supabase Dashboard > Settings > API |
| `ANTHROPIC_API_KEY` | Production & Preview (Serverless only) | Anthropic API key for natural language explainability | [Anthropic Console](https://console.anthropic.com/) |
| `ANTHROPIC_MODEL` | Production & Preview (Serverless only, Optional) | Model ID (defaults to `claude-3-5-haiku-20241022`) | [Anthropic Docs](https://docs.anthropic.com/) |
| `OPENROUTESERVICE_API_KEY` | Production & Preview (Serverless only) | High-resolution corridor routing proxy key | [OpenRouteService](https://openrouteservice.org/dev/#/signup) |

> [!WARNING]
> Ensure `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `OPENROUTESERVICE_API_KEY` do **NOT** have the `VITE_` prefix. This ensures Vite's bundler will never leak them into the client-side JavaScript distribution.

---

## 3. Multi-Tenant RLS & Security Verification

To verify that Row-Level Security (RLS) is properly isolating customer freight data:

### Step 1: Create Two Distinct Organizations
Run in Supabase SQL editor:
```sql
INSERT INTO public.organizations (id, name, slug)
VALUES
  ('org-alpha', 'Alpha Express Carriers', 'alpha-express'),
  ('org-beta', 'Beta Global Freight', 'beta-global');
```

### Step 2: Create Two Test Users in Supabase Auth
1. Go to **Authentication** > **Users** in Supabase.
2. Click **Add User** > **Create User**:
   - `dispatcher@alpha.com` (assigned to `org-alpha`)
   - `dispatcher@beta.com` (assigned to `org-beta`)

### Step 3: Link Profiles
```sql
UPDATE public.profiles
SET org_id = 'org-alpha', role = 'dispatcher'
WHERE email = 'dispatcher@alpha.com';

UPDATE public.profiles
SET org_id = 'org-beta', role = 'dispatcher'
WHERE email = 'dispatcher@beta.com';
```

### Step 4: Verify Cross-Tenant Isolation
1. Sign in as `dispatcher@alpha.com` and post a new shipment via the UI (`Loads Pool`).
2. Sign in as `dispatcher@beta.com` in a separate private browser window.
3. **Expected result**: `dispatcher@beta.com` cannot see `org-alpha`'s shipment or vehicle telemetry. Supabase Postgres RLS policies automatically filter queries by `public.current_user_org_id()` resolved dynamically from `public.profiles`.

---

## 4. Realtime Synchronization Verification

1. Open two browser windows side-by-side pointing to the application.
2. In Window 1 (Shipper mode), go to `/loads` and click **Post New Load Tender**. Fill in details and click **Verify & Post Load**.
3. In Window 2 (Dispatcher Cockpit), observe:
   - A floating realtime toast appears: `New Load Posted: <Consignment Name>`.
   - The Demand Pool and map markers update dynamically without refreshing the page.
