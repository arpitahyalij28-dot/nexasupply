-- ==============================================================================
-- Logistics Twin — Regional Supply Network Twin Database Schema & RLS
-- Migration: 20261025000000_logistics_twin_schema.sql
-- Track 3-05: Disruption-Aware Logistics Twin for Regional Supply Networks
-- Idempotent, re-runnable, strict Row-Level Security, multi-tenant isolation.
-- ==============================================================================

-- 1. BASE ORGANIZATIONS & PROFILES TABLES
CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'buyer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure 'demo-org' exists
INSERT INTO public.organizations (id, name, slug)
VALUES ('demo-org', 'Western Corridor Logistics Consortium', 'western-corridor-demo')
ON CONFLICT (id) DO NOTHING;

-- Extend profiles columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS buyer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vehicle_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Update profiles role check constraint to include 'planner', 'driver', 'buyer'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('planner', 'driver', 'buyer', 'dispatcher', 'shipper', 'admin'));

-- Update preferred language check
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_language_check
    CHECK (preferred_language IN ('en', 'hi', 'mr'));

-- 2. HELPER FUNCTIONS (Security Definer with clean search_path)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Alias for backwards compatibility
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.current_org_id();
$$;

-- 3. SIGNUP TRIGGER (Defaults to LEAST privileged role: 'buyer')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        org_id,
        email,
        full_name,
        role,
        buyer_id,
        vehicle_id,
        preferred_language,
        created_at
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'org_id', 'demo-org'),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        -- Default to least-privileged role 'buyer'
        COALESCE(NEW.raw_user_meta_data->>'role', 'buyer'),
        NEW.raw_user_meta_data->>'buyer_id',
        NEW.raw_user_meta_data->>'vehicle_id',
        COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en'),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        preferred_language = COALESCE(EXCLUDED.preferred_language, profiles.preferred_language);
    RETURN NEW;
END;
$$;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. SUPPLY NETWORK CORE TABLES (Mirrors src/engine/network.js exactly)

-- Networks (One active regional network per org)
CREATE TABLE IF NOT EXISTS public.networks (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT false,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Suppliers (Tier 1 Production Sources)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    network_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location JSONB NOT NULL,
    supply_limit NUMERIC NOT NULL CHECK (supply_limit >= 0),
    product TEXT NOT NULL DEFAULT 'General Cargo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Warehouses (Tier 2 Buffer Depots)
CREATE TABLE IF NOT EXISTS public.warehouses (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    network_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location JSONB NOT NULL,
    stock NUMERIC NOT NULL CHECK (stock >= 0),
    storage_limit NUMERIC NOT NULL CHECK (storage_limit >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id),
    CONSTRAINT warehouse_stock_storage_limit_check CHECK (stock <= storage_limit)
);

-- Buyers (Tier 3 Demand Points)
CREATE TABLE IF NOT EXISTS public.buyers (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    network_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location JSONB NOT NULL,
    demand_qty NUMERIC NOT NULL CHECK (demand_qty >= 0),
    deadline NUMERIC NOT NULL CHECK (deadline > 0),
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Routes (Corridor Edges between Nodes)
CREATE TABLE IF NOT EXISTS public.routes (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    network_id TEXT NOT NULL,
    name TEXT NOT NULL,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    distance_km NUMERIC NOT NULL CHECK (distance_km > 0),
    base_travel_time_h NUMERIC NOT NULL CHECK (base_travel_time_h > 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'slow', 'closed')),
    speed_factor NUMERIC NOT NULL DEFAULT 1.0 CHECK (speed_factor BETWEEN 0.1 AND 2.0),
    restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_score NUMERIC NOT NULL DEFAULT 0.0 CHECK (risk_score BETWEEN 0.0 AND 1.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Vehicles (Regional Fleet Stations)
CREATE TABLE IF NOT EXISTS public.vehicles (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    network_id TEXT NOT NULL,
    type TEXT NOT NULL,
    capacity NUMERIC NOT NULL CHECK (capacity > 0),
    available_from TEXT NOT NULL,
    availability INTEGER NOT NULL DEFAULT 1 CHECK (availability >= 0),
    cost_per_km NUMERIC NOT NULL CHECK (cost_per_km > 0),
    weight_tons NUMERIC NOT NULL CHECK (weight_tons > 0),
    restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Disruption Scenarios
CREATE TABLE IF NOT EXISTS public.disruption_scenarios (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    network_id TEXT NOT NULL,
    name TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Plans (Solver outputs: normal, disruption_basic, recovery)
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    scenario_id TEXT,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('normal', 'disruption_basic', 'recovery')),
    plan JSONB NOT NULL,
    totals JSONB NOT NULL,
    resilience JSONB,
    validation JSONB,
    published BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (org_id, id)
);

-- Trips (Flattened published plan allocations for Drivers and Buyers)
CREATE TABLE IF NOT EXISTS public.trips (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    eta_hours NUMERIC NOT NULL CHECK (eta_hours >= 0),
    cost NUMERIC NOT NULL CHECK (cost >= 0),
    on_time BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'accepted', 'in_transit', 'delivered', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_trip_plan_allocation UNIQUE (plan_id, vehicle_id, buyer_id, route_id)
);

-- Audit Log (Append-only)
CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    org_id TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. INDEXES ON FOREIGN KEYS AND QUERY COLUMNS
CREATE INDEX IF NOT EXISTS idx_networks_org ON public.networks(org_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_net ON public.suppliers(org_id, network_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_org_net ON public.warehouses(org_id, network_id);
CREATE INDEX IF NOT EXISTS idx_buyers_org_net ON public.buyers(org_id, network_id);
CREATE INDEX IF NOT EXISTS idx_routes_org_net ON public.routes(org_id, network_id);
CREATE INDEX IF NOT EXISTS idx_routes_nodes ON public.routes(from_node, to_node);
CREATE INDEX IF NOT EXISTS idx_vehicles_org_net ON public.vehicles(org_id, network_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_org ON public.disruption_scenarios(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_plans_org_scenario ON public.plans(org_id, scenario_id, published);
CREATE INDEX IF NOT EXISTS idx_trips_org_plan ON public.trips(org_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON public.trips(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_buyer ON public.trips(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON public.audit_log(org_id, created_at DESC);

-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disruption_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Profiles Security (User cannot change own role or org_id)
DROP POLICY IF EXISTS "Users can update own details but not role" ON public.profiles;
CREATE POLICY "Users can update own details but not role" ON public.profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        AND org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Planners can update org profiles" ON public.profiles;
CREATE POLICY "Planners can update org profiles" ON public.profiles
    FOR UPDATE
    USING (
        org_id = public.current_org_id()
        AND public.current_user_role() IN ('planner', 'admin')
    )
    WITH CHECK (
        org_id = public.current_org_id()
        AND public.current_user_role() IN ('planner', 'admin')
    );

DROP POLICY IF EXISTS "Planners and drivers can view org profiles" ON public.profiles;
CREATE POLICY "Planners and drivers can view org profiles" ON public.profiles
    FOR SELECT
    USING (
        id = auth.uid()
        OR (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin', 'driver'))
    );

-- --- NETWORKS POLICIES ---
DROP POLICY IF EXISTS "Planner full networks" ON public.networks;
CREATE POLICY "Planner full networks" ON public.networks
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver read networks" ON public.networks;
CREATE POLICY "Driver read networks" ON public.networks
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() = 'driver');

DROP POLICY IF EXISTS "Public read demo networks" ON public.networks;
CREATE POLICY "Public read demo networks" ON public.networks
    FOR SELECT
    USING (org_id = 'demo-org');

-- --- ENTITIES (Suppliers, Warehouses, Buyers, Routes, Vehicles) ---
-- Suppliers
DROP POLICY IF EXISTS "Planner full suppliers" ON public.suppliers;
CREATE POLICY "Planner full suppliers" ON public.suppliers
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver read suppliers" ON public.suppliers;
CREATE POLICY "Driver read suppliers" ON public.suppliers
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() = 'driver');

DROP POLICY IF EXISTS "Public read demo suppliers" ON public.suppliers;
CREATE POLICY "Public read demo suppliers" ON public.suppliers
    FOR SELECT USING (org_id = 'demo-org');

-- Warehouses
DROP POLICY IF EXISTS "Planner full warehouses" ON public.warehouses;
CREATE POLICY "Planner full warehouses" ON public.warehouses
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver read warehouses" ON public.warehouses;
CREATE POLICY "Driver read warehouses" ON public.warehouses
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() = 'driver');

DROP POLICY IF EXISTS "Public read demo warehouses" ON public.warehouses;
CREATE POLICY "Public read demo warehouses" ON public.warehouses
    FOR SELECT USING (org_id = 'demo-org');

-- Buyers
DROP POLICY IF EXISTS "Planner full buyers" ON public.buyers;
CREATE POLICY "Planner full buyers" ON public.buyers
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Buyer read own buyer row" ON public.buyers;
CREATE POLICY "Buyer read own buyer row" ON public.buyers
    FOR SELECT
    USING (
        org_id = public.current_org_id()
        AND id = (SELECT buyer_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Driver read buyers" ON public.buyers;
CREATE POLICY "Driver read buyers" ON public.buyers
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() = 'driver');

DROP POLICY IF EXISTS "Public read demo buyers" ON public.buyers;
CREATE POLICY "Public read demo buyers" ON public.buyers
    FOR SELECT USING (org_id = 'demo-org');

-- Routes
DROP POLICY IF EXISTS "Planner full routes" ON public.routes;
CREATE POLICY "Planner full routes" ON public.routes
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver read routes" ON public.routes;
CREATE POLICY "Driver read routes" ON public.routes
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() = 'driver');

DROP POLICY IF EXISTS "Public read demo routes" ON public.routes;
CREATE POLICY "Public read demo routes" ON public.routes
    FOR SELECT USING (org_id = 'demo-org');

-- Vehicles
DROP POLICY IF EXISTS "Planner full vehicles" ON public.vehicles;
CREATE POLICY "Planner full vehicles" ON public.vehicles
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver read vehicles" ON public.vehicles;
CREATE POLICY "Driver read vehicles" ON public.vehicles
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() = 'driver');

DROP POLICY IF EXISTS "Public read demo vehicles" ON public.vehicles;
CREATE POLICY "Public read demo vehicles" ON public.vehicles
    FOR SELECT USING (org_id = 'demo-org');

-- --- DISRUPTION SCENARIOS ---
DROP POLICY IF EXISTS "Planner full scenarios" ON public.disruption_scenarios;
CREATE POLICY "Planner full scenarios" ON public.disruption_scenarios
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver read active scenario" ON public.disruption_scenarios;
CREATE POLICY "Driver read active scenario" ON public.disruption_scenarios
    FOR SELECT
    USING (org_id = public.current_org_id() AND is_active = true);

DROP POLICY IF EXISTS "Public read demo scenarios" ON public.disruption_scenarios;
CREATE POLICY "Public read demo scenarios" ON public.disruption_scenarios
    FOR SELECT USING (org_id = 'demo-org');

-- --- PLANS ---
DROP POLICY IF EXISTS "Planner full plans" ON public.plans;
CREATE POLICY "Planner full plans" ON public.plans
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver and Buyer read published plans" ON public.plans;
CREATE POLICY "Driver and Buyer read published plans" ON public.plans
    FOR SELECT
    USING (org_id = public.current_org_id() AND published = true);

DROP POLICY IF EXISTS "Public read demo published plans" ON public.plans;
CREATE POLICY "Public read demo published plans" ON public.plans
    FOR SELECT USING (org_id = 'demo-org' AND published = true);

-- --- TRIPS ---
DROP POLICY IF EXISTS "Planner full trips" ON public.trips;
CREATE POLICY "Planner full trips" ON public.trips
    FOR ALL
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'))
    WITH CHECK (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

DROP POLICY IF EXISTS "Driver select own vehicle trips" ON public.trips;
CREATE POLICY "Driver select own vehicle trips" ON public.trips
    FOR SELECT
    USING (
        org_id = public.current_org_id()
        AND vehicle_id = (SELECT vehicle_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Buyer select own orders" ON public.trips;
CREATE POLICY "Buyer select own orders" ON public.trips
    FOR SELECT
    USING (
        org_id = public.current_org_id()
        AND buyer_id = (SELECT buyer_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Public read demo trips" ON public.trips;
CREATE POLICY "Public read demo trips" ON public.trips
    FOR SELECT USING (org_id = 'demo-org');

-- --- AUDIT LOG ---
DROP POLICY IF EXISTS "Planner read audit log" ON public.audit_log;
CREATE POLICY "Planner read audit log" ON public.audit_log
    FOR SELECT
    USING (org_id = public.current_org_id() AND public.current_user_role() IN ('planner', 'admin'));

-- 7. SECURITY DEFINER RPCs

-- 7.1 Publish Plan RPC
CREATE OR REPLACE FUNCTION public.publish_plan(p_plan_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan RECORD;
    v_caller_role TEXT;
    v_caller_org TEXT;
    v_alloc JSONB;
    v_trips_created INT := 0;
BEGIN
    v_caller_role := public.current_user_role();
    v_caller_org := public.current_org_id();

    IF v_caller_role NOT IN ('planner', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only planners can publish plans';
    END IF;

    SELECT * INTO v_plan
    FROM public.plans
    WHERE id = p_plan_id AND org_id = v_caller_org;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan % not found in organization %', p_plan_id, v_caller_org;
    END IF;

    -- Mark plan as published
    UPDATE public.plans
    SET published = true
    WHERE id = p_plan_id AND org_id = v_caller_org;

    -- Flatten allocations into trips
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_plan.plan->'allocations')
    LOOP
        INSERT INTO public.trips (
            id,
            org_id,
            plan_id,
            vehicle_id,
            buyer_id,
            warehouse_id,
            route_id,
            quantity,
            eta_hours,
            cost,
            on_time,
            status,
            updated_at
        ) VALUES (
            'TRIP-' || p_plan_id || '-' || COALESCE(v_alloc->>'id', gen_random_uuid()::text),
            v_caller_org,
            p_plan_id,
            v_alloc->>'vehicleId',
            v_alloc->>'buyerId',
            v_alloc->>'warehouseId',
            COALESCE((v_alloc->'path')->>0, 'direct'),
            COALESCE((v_alloc->>'quantity')::numeric, 1),
            COALESCE((v_alloc->>'etaH')::numeric, (v_alloc->>'travelTimeH')::numeric, 1.0),
            COALESCE((v_alloc->>'cost')::numeric, 0),
            COALESCE((v_alloc->>'isOnTime')::boolean, true),
            'planned',
            NOW()
        )
        ON CONFLICT (plan_id, vehicle_id, buyer_id, route_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            eta_hours = EXCLUDED.eta_hours,
            cost = EXCLUDED.cost,
            on_time = EXCLUDED.on_time,
            updated_at = NOW();

        v_trips_created := v_trips_created + 1;
    END LOOP;

    -- Write to audit log
    INSERT INTO public.audit_log (org_id, user_id, action, entity, entity_id, details)
    VALUES (
        v_caller_org,
        auth.uid(),
        'PUBLISH_PLAN',
        'plans',
        p_plan_id,
        jsonb_build_object('trips_created', v_trips_created, 'plan_type', v_plan.plan_type)
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'trips_created', v_trips_created
    );
END;
$$;

-- 7.2 Update Trip Status RPC (Driver or Planner Milestone Update)
CREATE OR REPLACE FUNCTION public.update_trip_status(p_trip_id TEXT, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trip RECORD;
    v_caller_role TEXT;
    v_caller_org TEXT;
    v_caller_vehicle TEXT;
BEGIN
    v_caller_role := public.current_user_role();
    v_caller_org := public.current_org_id();

    IF p_status NOT IN ('planned', 'accepted', 'in_transit', 'delivered', 'failed') THEN
        RAISE EXCEPTION 'Invalid trip status: %', p_status;
    END IF;

    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id AND org_id = v_caller_org;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip % not found in organization %', p_trip_id, v_caller_org;
    END IF;

    -- If driver, verify they own this vehicle
    IF v_caller_role = 'driver' THEN
        SELECT vehicle_id INTO v_caller_vehicle
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_caller_vehicle IS NULL OR v_caller_vehicle <> v_trip.vehicle_id THEN
            RAISE EXCEPTION 'Unauthorized: Driver cannot update trips for vehicle %', v_trip.vehicle_id;
        END IF;

        -- Valid transitions for driver:
        -- planned -> accepted -> in_transit -> delivered (or failed at any point)
        IF p_status = 'accepted' AND v_trip.status <> 'planned' THEN
            RAISE EXCEPTION 'Cannot accept trip in % status', v_trip.status;
        ELSIF p_status = 'in_transit' AND v_trip.status NOT IN ('accepted', 'planned') THEN
            RAISE EXCEPTION 'Cannot start transit for trip in % status', v_trip.status;
        ELSIF p_status = 'delivered' AND v_trip.status <> 'in_transit' THEN
            RAISE EXCEPTION 'Cannot deliver trip before in_transit';
        END IF;
    ELSIF v_caller_role NOT IN ('planner', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized role: %', v_caller_role;
    END IF;

    UPDATE public.trips
    SET status = p_status, updated_at = NOW()
    WHERE id = p_trip_id AND org_id = v_caller_org;

    -- Write to audit log
    INSERT INTO public.audit_log (org_id, user_id, action, entity, entity_id, details)
    VALUES (
        v_caller_org,
        auth.uid(),
        'UPDATE_TRIP_STATUS',
        'trips',
        p_trip_id,
        jsonb_build_object('old_status', v_trip.status, 'new_status', p_status, 'vehicle_id', v_trip.vehicle_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'trip_id', p_trip_id,
        'old_status', v_trip.status,
        'new_status', p_status
    );
END;
$$;

-- 7.3 Reset Demo Network RPC (Planner Only)
CREATE OR REPLACE FUNCTION public.reset_demo_network()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_org TEXT;
BEGIN
    v_caller_role := public.current_user_role();
    v_caller_org := public.current_org_id();

    IF v_caller_role NOT IN ('planner', 'admin') AND v_caller_org <> 'demo-org' THEN
        RAISE EXCEPTION 'Unauthorized: Only planners can reset the network';
    END IF;

    -- Clean dynamic plans, scenarios, and trips for this org
    DELETE FROM public.trips WHERE org_id = v_caller_org;
    DELETE FROM public.plans WHERE org_id = v_caller_org;
    DELETE FROM public.disruption_scenarios WHERE org_id = v_caller_org;

    -- Reset route status to 'open'
    UPDATE public.routes SET status = 'open', speed_factor = 1.0 WHERE org_id = v_caller_org;

    -- Write to audit log
    INSERT INTO public.audit_log (org_id, user_id, action, entity, entity_id, details)
    VALUES (
        v_caller_org,
        auth.uid(),
        'RESET_NETWORK',
        'networks',
        'all',
        jsonb_build_object('timestamp', NOW())
    );

    RETURN jsonb_build_object('success', true, 'message', 'Network reset to initial baseline.');
END;
$$;
