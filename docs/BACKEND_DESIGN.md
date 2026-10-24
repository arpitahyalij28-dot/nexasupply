# Logistics Twin — Backend, Database & Auth Architecture Design

> **Hackathon Track 3-05: Disruption-Aware Logistics Twin for Regional Supply Networks**  
> Document Version: 1.0.0  
> Status: Approved & Baseline Recorded

---

## 1. Engine Field to Database Column Mapping

To prevent conversion mismatches, database column definitions strictly mirror the pure engine schemas (`src/engine/network.js`, `src/engine/disruptions.js`, `src/engine/planner.js`, `src/engine/validation.js`).

### 1.1 Suppliers (`suppliers`)
| Engine Field (`src/engine/network.js`) | DB Column (`suppliers`) | Type & Constraints | Description |
|---|---|---|---|
| `id` | `id` | `TEXT`, PK with `org_id` | Unique supplier ID (e.g., `'sup-dindori'`) |
| N/A | `org_id` | `TEXT NOT NULL REFERENCES organizations(id)` | Multi-tenant organization scope |
| N/A | `network_id` | `TEXT NOT NULL REFERENCES networks(id)` | Associated network snapshot |
| `name` | `name` | `TEXT NOT NULL` | Human-readable name |
| `location` | `location` | `JSONB NOT NULL` | `{ "name": text, "lat": num, "lng": num }` |
| `supplyLimit` | `supply_limit` | `NUMERIC NOT NULL CHECK (supply_limit >= 0)` | Maximum supply units (e.g. 1200) |
| `product` | `product` | `TEXT NOT NULL DEFAULT 'General Cargo'` | Category of cargo produced |
| N/A | `created_at` / `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Audit timestamps |

### 1.2 Warehouses (`warehouses`)
| Engine Field (`src/engine/network.js`) | DB Column (`warehouses`) | Type & Constraints | Description |
|---|---|---|---|
| `id` | `id` | `TEXT`, PK with `org_id` | Unique warehouse ID (e.g., `'wh-bhiwandi'`) |
| N/A | `org_id` | `TEXT NOT NULL REFERENCES organizations(id)` | Multi-tenant organization scope |
| N/A | `network_id` | `TEXT NOT NULL REFERENCES networks(id)` | Associated network snapshot |
| `name` | `name` | `TEXT NOT NULL` | Depot name |
| `location` | `location` | `JSONB NOT NULL` | `{ "name": text, "lat": num, "lng": num }` |
| `stock` | `stock` | `NUMERIC NOT NULL CHECK (stock >= 0)` | Current inventory stock units |
| `storageLimit` | `storage_limit` | `NUMERIC NOT NULL CHECK (storage_limit >= 0)` | Maximum depot capacity |
| N/A | Table Check | `CHECK (stock <= storage_limit)` | Prevents overflow |
| N/A | `created_at` / `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Audit timestamps |

### 1.3 Buyers (`buyers`)
| Engine Field (`src/engine/network.js`) | DB Column (`buyers`) | Type & Constraints | Description |
|---|---|---|---|
| `id` | `id` | `TEXT`, PK with `org_id` | Unique buyer ID (e.g., `'buy-thane-med'`) |
| N/A | `org_id` | `TEXT NOT NULL REFERENCES organizations(id)` | Multi-tenant organization scope |
| N/A | `network_id` | `TEXT NOT NULL REFERENCES networks(id)` | Associated network snapshot |
| `name` | `name` | `TEXT NOT NULL` | Destination facility name |
| `location` | `location` | `JSONB NOT NULL` | `{ "name": text, "lat": num, "lng": num }` |
| `demandQty` | `demand_qty` | `NUMERIC NOT NULL CHECK (demand_qty >= 0)` | Demand units needed |
| `deadline` | `deadline` | `NUMERIC NOT NULL CHECK (deadline > 0)` | Delivery window deadline in hours (T0+) |
| `priority` | `priority` | `TEXT NOT NULL CHECK (priority IN ('high','medium','low'))` | Priority weight tier |
| N/A | `created_at` / `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Audit timestamps |

### 1.4 Routes (`routes`)
| Engine Field (`src/engine/network.js`) | DB Column (`routes`) | Type & Constraints | Description |
|---|---|---|---|
| `id` | `id` | `TEXT`, PK with `org_id` | Unique corridor edge ID (e.g., `'r-satpur-igatpuri'`) |
| N/A | `org_id` | `TEXT NOT NULL REFERENCES organizations(id)` | Multi-tenant organization scope |
| N/A | `network_id` | `TEXT NOT NULL REFERENCES networks(id)` | Associated network snapshot |
| `from` | `from_node` | `TEXT NOT NULL` | Source node ID (Supplier or Warehouse) |
| `to` | `to_node` | `TEXT NOT NULL` | Destination node ID (Warehouse or Buyer) |
| `name` | `name` | `TEXT NOT NULL` | Corridor name (e.g., `'Satpur -> Igatpuri (NH 160)'`) |
| `distanceKm` | `distance_km` | `NUMERIC NOT NULL CHECK (distance_km > 0)` | Road length in kilometers |
| `baseTravelTimeH` | `base_travel_time_h` | `NUMERIC NOT NULL CHECK (base_travel_time_h > 0)` | Transit duration under normal conditions |
| `status` | `status` | `TEXT NOT NULL CHECK (status IN ('open','slow','closed'))` | Disruption status (`ROUTE_STATUS`) |
| `speedFactor` | `speed_factor` | `NUMERIC NOT NULL DEFAULT 1.0 CHECK (speed_factor BETWEEN 0.1 AND 2.0)` | Speed impact multiplier |
| `restrictions` | `restrictions` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | `{ "maxVehicleWeightTons": num, "bannedVehicleTypes": [] }` |
| `riskScore` | `risk_score` | `NUMERIC NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1)` | Environmental / incident risk (0.0 to 1.0) |

### 1.5 Vehicles (`vehicles`)
| Engine Field (`src/engine/network.js`) | DB Column (`vehicles`) | Type & Constraints | Description |
|---|---|---|---|
| `id` | `id` | `TEXT`, PK with `org_id` | Vehicle identifier (e.g., `'veh-nashik-1'`) |
| N/A | `org_id` | `TEXT NOT NULL REFERENCES organizations(id)` | Multi-tenant organization scope |
| N/A | `network_id` | `TEXT NOT NULL REFERENCES networks(id)` | Associated network snapshot |
| `type` | `type` | `TEXT NOT NULL` | Canonical class or standard regional vehicle class |
| `capacity` | `capacity` | `NUMERIC NOT NULL CHECK (capacity > 0)` | Maximum cargo units carried per trip |
| `availableFrom` | `available_from` | `TEXT NOT NULL` | Stationed warehouse / depot node ID |
| `availability` | `availability` | `INTEGER NOT NULL DEFAULT 1 CHECK (availability >= 0)` | Available discrete trips remaining |
| `costPerKm` | `cost_per_km` | `NUMERIC NOT NULL CHECK (cost_per_km > 0)` | Operating transport cost (INR/km) |
| `weightTons` | `weight_tons` | `NUMERIC NOT NULL CHECK (weight_tons > 0)` | Gross vehicle weight in metric tons |
| `restrictions` | `restrictions` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | `{ "isRefrigerated": bool, "isDangerousGoodsCertified": bool }` |

---

## 2. Role-Based Access Control (RBAC) Matrix

Three distinct user personas are enforced at the database (PostgreSQL Row-Level Security) and API layers:

| Resource / Action | Planner (`planner`) | Driver (`driver`) | Buyer (`buyer`) | Anonymous / Demo |
|---|---|---|---|---|
| **Network CRUD** (Suppliers, Warehouses, Buyers, Routes, Vehicles) | Read / Write (own org) | Read Only (own org) | Denied | Read Only (`demo-org` only in demo mode) |
| **Problem Simulator** (`disruption_scenarios`) | Read / Write | Read Only (active scenario) | Denied | Read Only (`demo-org`) |
| **Solver Plans** (`plans`) | Generate, View, Publish | View Published Only | View Published Summary | View in local memory / demo |
| **Trips** (`trips`) | Read All (own org) | Read & Status Update on **Own Assigned Vehicle** | Read **Own Buyer Orders** Only | Local / Mock View |
| **User Administration** (`/api/admin-invite`) | Invite Drivers & Buyers | Denied | Denied | Denied |
| **Audit Log** (`audit_log`) | Read Only (own org) | Denied | Denied | Denied |

---

## 3. Serverless API Endpoint Catalog (`/api`)

| Method | Endpoint | Authorized Roles | Description | Integrity & Validation |
|---|---|---|---|---|
| `POST` | `/api/twin-plan` | `planner` | Runs trusted solver on server (`generatePlanComparison`), calculates resilience & 6-point hard constraints. Saves scenario and plans. | Server loads DB network (never trusts client payload). Runs `validateDispatchPlan`. |
| `POST` | `/api/twin-publish` | `planner` | Publishes recovery plan, generates flat `trips` records for drivers & buyers. | Calls `publish_plan()` security-definer RPC; idempotent with unique constraint. |
| `POST` | `/api/admin-invite` | `planner` | Invites driver or buyer into the organization, assigning `vehicle_id` or `buyer_id`. | Service-role execution on server; rate-limited; cannot create planners for other orgs. |
| `GET` | `/api/twin-me/trips` | `driver` | Returns active assigned trips for the authenticated driver's vehicle. | Verified from `profiles.vehicle_id`. |
| `GET` | `/api/twin-me/orders` | `buyer` | Returns consignment order status for the authenticated buyer facility. | Verified from `profiles.buyer_id`. |
| `PATCH` | `/api/trip-status` | `driver` | Updates trip milestone status (`planned -> accepted -> in_transit -> delivered` or `failed`). | Enforces valid status state machine; drivers can only touch their own trips. |
| `GET` | `/api/health` | Public | Returns database reachability (`reachable: true/false`), API version, timestamp. | Leaks zero secrets or internal stack traces. |

### Legacy / Retained Endpoints Status
- `api/weather.js`: **Retained & Active** (Used for corridor rain risk evaluation).
- `api/route.js`: **Retained & Active** (Used for OSRM route coordinate proxy).
- `api/explain.js`: **Retained & Active** (AI natural language explanation generator).
- `api/optimize.js` / `api/optimize-fleet.js`: **Legacy ReRoute** (Moved to legacy maintenance; kept for backwards compatibility).
- `api/recover.js`: **Legacy ReRoute** (Superseded by `/api/twin-plan`).

---

## 4. Phase 0 Baseline Test & Build Verification

- **Node / Vite Build**: Succeeded (`npm run build`, exit code 0).
  - Main bundle size: `643.39 kB` (gzip: `155.31 kB`).
- **Vitest Unit Test Suite**: Succeeded (`npm test`, exit code 0).
  - Test Files: **19 passed (19)**.
  - Total Tests: **113 passed | 3 skipped** (live Supabase credentials skipped in local environment).
