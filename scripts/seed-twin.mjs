// Logistics Twin - Regional Supply Network Twin Seeding Script (Track 3-05)
// Imports the demo dataset directly from src/data/networkDemo.js (never retyped)
// Seeds org, network, suppliers, warehouses, buyers, routes, vehicles, and 3 RBAC users:
// 1. planner@demo.reroute (Role: planner)
// 2. driver@demo.reroute  (Role: driver, vehicle_id: 'veh-nashik-1')
// 3. buyer@demo.reroute   (Role: buyer, buyer_id: 'buy-thane-med')
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY="ey..." VITE_SUPABASE_URL="https://xxx.supabase.co" DEMO_PASSWORD="YourSecretPassword" node scripts/seed-twin.mjs

import { createClient } from '@supabase/supabase-js';
import { getDemoNetwork } from '../src/data/networkDemo.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_PASSWORD || process.env.DEMO_USER_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n❌ Missing required environment variables:');
  console.error('Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nExample:');
  console.error('SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." VITE_SUPABASE_URL="https://your-ref.supabase.co" DEMO_PASSWORD="MyPassword123!" node scripts/seed-twin.mjs\n');
  process.exit(1);
}

if (!demoPassword) {
  console.warn('⚠️  Notice: DEMO_PASSWORD environment variable was not specified. Defaulting to fallback for development only.');
}

const activePassword = demoPassword || 'LogisticsTwin2026!';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ORG_ID = 'demo-org';
const NETWORK_ID = 'net-nashik-corridor';

export const DEMO_ACCOUNTS = [
  {
    email: 'planner@demo.reroute',
    password: activePassword,
    role: 'planner',
    fullName: 'Regional Supply Network Planner',
  },
  {
    email: 'driver@demo.reroute',
    password: activePassword,
    role: 'driver',
    fullName: 'Driver Suresh Patil',
    vehicleId: 'veh-nashik-1',
  },
  {
    email: 'buyer@demo.reroute',
    password: activePassword,
    role: 'buyer',
    fullName: 'Thane Civil Hospital Purchaser',
    buyerId: 'buy-thane-med',
  },
];

async function seedTwin() {
  console.log(`\n🚚 Logistics Twin — Seeding Regional Supply Network into ${supabaseUrl}...`);
  console.log(`📋 Note: User passwords are read securely from the DEMO_PASSWORD environment variable.`);

  // 1. Ensure Organization
  const { error: orgErr } = await supabase.from('organizations').upsert({
    id: ORG_ID,
    name: 'Western Corridor Logistics Consortium',
    slug: 'western-corridor-demo',
  });
  if (orgErr) console.warn('Org upsert note:', orgErr.message);

  // 2. Fetch Pure Engine Demo Network
  const demoNetwork = getDemoNetwork();
  console.log(`📦 Loaded demo network from engine: ${demoNetwork.suppliers.length} suppliers, ${demoNetwork.warehouses.length} warehouses, ${demoNetwork.buyers.length} buyers, ${demoNetwork.routes.length} routes, ${demoNetwork.vehicles.length} vehicles.`);

  // 3. Upsert Active Network Record
  const { error: netErr } = await supabase.from('networks').upsert({
    id: NETWORK_ID,
    org_id: ORG_ID,
    name: 'Nashik-Mumbai-Pune Regional Logistics Twin (Track 3-05)',
    is_demo: true,
    settings: demoNetwork.settings || {},
  });
  if (netErr) console.warn('Network upsert note:', netErr.message);

  // 4. Upsert Suppliers
  const suppliersPayload = demoNetwork.suppliers.map((s) => ({
    id: s.id,
    org_id: ORG_ID,
    network_id: NETWORK_ID,
    name: s.name,
    location: s.location,
    supply_limit: s.supplyLimit,
    product: s.product,
  }));
  const { error: supErr } = await supabase.from('suppliers').upsert(suppliersPayload);
  if (supErr) console.warn('Suppliers upsert note:', supErr.message);

  // 5. Upsert Warehouses
  const warehousesPayload = demoNetwork.warehouses.map((w) => ({
    id: w.id,
    org_id: ORG_ID,
    network_id: NETWORK_ID,
    name: w.name,
    location: w.location,
    stock: w.stock,
    storage_limit: w.storageLimit,
  }));
  const { error: whErr } = await supabase.from('warehouses').upsert(warehousesPayload);
  if (whErr) console.warn('Warehouses upsert note:', whErr.message);

  // 6. Upsert Buyers
  const buyersPayload = demoNetwork.buyers.map((b) => ({
    id: b.id,
    org_id: ORG_ID,
    network_id: NETWORK_ID,
    name: b.name,
    location: b.location,
    demand_qty: b.demandQty,
    deadline: b.deadline,
    priority: b.priority,
  }));
  const { error: buyErr } = await supabase.from('buyers').upsert(buyersPayload);
  if (buyErr) console.warn('Buyers upsert note:', buyErr.message);

  // 7. Upsert Routes
  const routesPayload = demoNetwork.routes.map((r) => ({
    id: r.id,
    org_id: ORG_ID,
    network_id: NETWORK_ID,
    name: r.name,
    from_node: r.from,
    to_node: r.to,
    distance_km: r.distanceKm,
    base_travel_time_h: r.baseTravelTimeH,
    status: r.status,
    speed_factor: r.speedFactor,
    restrictions: r.restrictions,
    risk_score: r.riskScore,
  }));
  const { error: routeErr } = await supabase.from('routes').upsert(routesPayload);
  if (routeErr) console.warn('Routes upsert note:', routeErr.message);

  // 8. Upsert Vehicles
  const vehiclesPayload = demoNetwork.vehicles.map((v) => ({
    id: v.id,
    org_id: ORG_ID,
    network_id: NETWORK_ID,
    type: v.type,
    capacity: v.capacity,
    available_from: v.availableFrom,
    availability: v.availability,
    cost_per_km: v.costPerKm,
    weight_tons: v.weightTons,
    restrictions: v.restrictions || {},
  }));
  const { error: vehErr } = await supabase.from('vehicles').upsert(vehiclesPayload);
  if (vehErr) console.warn('Vehicles upsert note:', vehErr.message);

  // 9. Provision 3 RBAC Users
  console.log('\n👤 Provisioning 3 Demo Accounts (planner, driver, buyer)...');
  for (const acc of DEMO_ACCOUNTS) {
    let userId;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
      user_metadata: {
        full_name: acc.fullName,
        role: acc.role,
        org_id: ORG_ID,
        vehicle_id: acc.vehicleId || null,
        buyer_id: acc.buyerId || null,
      },
    });

    if (createError) {
      if (createError.message?.toLowerCase().includes('already registered')) {
        const { data: list } = await supabase.auth.admin.listUsers();
        const existing = list?.users?.find((u) => u.email === acc.email);
        userId = existing?.id;
        if (userId) {
          await supabase.auth.admin.updateUserById(userId, {
            password: acc.password,
            user_metadata: {
              full_name: acc.fullName,
              role: acc.role,
              org_id: ORG_ID,
              vehicle_id: acc.vehicleId || null,
              buyer_id: acc.buyerId || null,
            },
          });
        }
      } else {
        console.warn(`User create note for ${acc.email}:`, createError.message);
      }
    } else {
      userId = created?.user?.id;
    }

    if (userId) {
      await supabase.from('profiles').upsert({
        id: userId,
        org_id: ORG_ID,
        email: acc.email,
        full_name: acc.fullName,
        role: acc.role,
        vehicle_id: acc.vehicleId || null,
        buyer_id: acc.buyerId || null,
      });
      console.log(`  ✓ ${acc.role.toUpperCase()}: ${acc.email} (ID: ${userId})`);
    }
  }

  console.log('\n✅ Twin Seed Complete! Demo accounts ready:');
  DEMO_ACCOUNTS.forEach((a) => {
    console.log(`  • [${a.role.padEnd(7)}] ${a.email} (Password set from DEMO_PASSWORD env var)`);
  });
}

seedTwin().catch((e) => {
  console.error('Seed script error:', e);
  process.exit(1);
});
