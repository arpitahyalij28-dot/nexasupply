# Supabase Database Migrations

## How to Run Migrations

### Option A: Supabase CLI
```bash
supabase db push
```

### Option B: Supabase Dashboard SQL Editor
1. Log into your Supabase Dashboard at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select your project and navigate to the **SQL Editor** (`>_` icon in the left navigation).
3. Click **New Query**.
4. Open [20261025000000_logistics_twin_schema.sql](20261025000000_logistics_twin_schema.sql), copy its full contents, paste into the editor, and click **Run**.
5. Once completed, your database tables (`networks`, `suppliers`, `warehouses`, `buyers`, `routes`, `vehicles`, `disruption_scenarios`, `plans`, `trips`, `audit_log`), RLS policies, and RPC functions (`publish_plan`, `update_trip_status`, `reset_demo_network`) are fully deployed.

### Running Seed Script
```bash
SUPABASE_SERVICE_ROLE_KEY="ey..." VITE_SUPABASE_URL="https://xxx.supabase.co" DEMO_PASSWORD="YourSecretPassword" node scripts/seed-twin.mjs
```
