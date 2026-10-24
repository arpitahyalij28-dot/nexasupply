// Logistics Twin - Twin Repository & Zod Schemas Test Suite
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LocalAdapter,
  SupabaseAdapter,
  createTwinRepository,
  exportNetworkJson,
  importNetworkJson,
} from '../twinRepository.js';
import {
  supplierSchema,
  warehouseSchema,
  buyerSchema,
  routeSchema,
  vehicleSchema,
  networkSchema,
} from '../schemas.js';
import { getDemoNetwork } from '../networkDemo.js';

describe('Zod Validation Schemas (Track 3-05)', () => {
  it('validates a correct warehouse', () => {
    const valid = {
      id: 'wh-test-1',
      name: 'Test Warehouse',
      location: { name: 'Nashik', lat: 20.0, lng: 73.8 },
      stock: 500,
      storageLimit: 1000,
    };
    const res = warehouseSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('rejects warehouse when stock exceeds storageLimit', () => {
    const invalid = {
      id: 'wh-test-1',
      name: 'Overloaded Warehouse',
      location: { name: 'Nashik', lat: 20.0, lng: 73.8 },
      stock: 1200,
      storageLimit: 1000,
    };
    const res = warehouseSchema.safeParse(invalid);
    expect(res.success).toBe(false);
    expect(res.error.issues[0].message).toContain('Current stock cannot exceed warehouse storage limit');
  });

  it('rejects buyer with negative demand quantity or non-positive deadline', () => {
    const invalid = {
      id: 'buy-test-1',
      name: 'Test Buyer',
      location: { name: 'Mumbai', lat: 19.0, lng: 72.8 },
      demandQty: -50,
      deadline: 0,
      priority: 'high',
    };
    const res = buyerSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('validates entire demo network and rejects routes with orphaned endpoints', () => {
    const demo = getDemoNetwork();
    const demoRes = networkSchema.safeParse(demo);
    expect(demoRes.success).toBe(true);

    const brokenNet = {
      ...demo,
      routes: [
        ...demo.routes,
        {
          id: 'r-broken',
          from: 'non-existent-source',
          to: 'wh-satpur',
          distanceKm: 20,
          baseTravelTimeH: 1,
          status: 'open',
          speedFactor: 1,
          restrictions: {},
          riskScore: 0,
        },
      ],
    };
    const brokenRes = networkSchema.safeParse(brokenNet);
    expect(brokenRes.success).toBe(false);
    expect(brokenRes.error.issues[0].message).toContain('All routes must connect existing suppliers, warehouses, or buyers');
  });
});

describe('LocalAdapter Operations', () => {
  let adapter;
  let store = {};

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
    };
    adapter = new LocalAdapter({ profile: { role: 'planner' } });
  });

  it('loads the default demo network when storage is empty', async () => {
    const net = await adapter.loadNetwork();
    expect(net).toBeDefined();
    expect(net.warehouses.length).toBeGreaterThan(0);
    expect(net.suppliers.length).toBeGreaterThan(0);
  });

  it('saves and deletes an entity in the network', async () => {
    const newSupplier = {
      id: 'sup-new-1',
      name: 'New Agro Supplier',
      location: { name: 'Ozar', lat: 20.1, lng: 73.9 },
      supplyLimit: 600,
      product: 'Grapes',
    };

    await adapter.saveEntity('supplier', newSupplier);
    let net = await adapter.loadNetwork();
    expect(net.suppliers.some((s) => s.id === 'sup-new-1')).toBe(true);

    await adapter.deleteEntity('supplier', 'sup-new-1');
    net = await adapter.loadNetwork();
    expect(net.suppliers.some((s) => s.id === 'sup-new-1')).toBe(false);
  });

  it('saves a plan, publishes it into trips, and queries trips for driver', async () => {
    const plan = {
      allocations: [
        {
          vehicleId: 'veh-sat-1',
          buyerId: 'buy-thane-med',
          warehouseId: 'wh-satpur',
          routeId: 'r-satpur-igatpuri',
          allocatedQty: 80,
          etaHours: 3.5,
          cost: 1440,
          onTime: true,
        },
      ],
    };

    const savedPlan = await adapter.savePlan('recovery', plan);
    expect(savedPlan.id).toBeDefined();

    const publishRes = await adapter.publishPlan(savedPlan.id);
    expect(publishRes.success).toBe(true);
    expect(publishRes.trips.length).toBe(1);
    expect(publishRes.trips[0].status).toBe('planned');

    // Query trips as assigned driver
    const driverAdapter = new LocalAdapter({
      profile: { role: 'driver', vehicle_id: 'veh-sat-1' },
    });
    const driverTrips = await driverAdapter.loadTripsForMe();
    expect(driverTrips.length).toBe(1);
    expect(driverTrips[0].vehicle_id).toBe('veh-sat-1');

    // Driver updates trip status: planned -> accepted -> in_transit -> delivered
    const tripId = driverTrips[0].id;
    const accepted = await driverAdapter.updateTripStatus(tripId, 'accepted');
    expect(accepted.status).toBe('accepted');

    const inTransit = await driverAdapter.updateTripStatus(tripId, 'in_transit');
    expect(inTransit.status).toBe('in_transit');

    const delivered = await driverAdapter.updateTripStatus(tripId, 'delivered');
    expect(delivered.status).toBe('delivered');

    // Invalid transition from delivered to accepted should throw
    await expect(driverAdapter.updateTripStatus(tripId, 'accepted')).rejects.toThrow();
  });
});

describe('SupabaseAdapter Mocked Tests', () => {
  it('calls publish_plan and update_trip_status RPCs correctly', async () => {
    const mockRpc = vi.fn().mockImplementation((name, args) => {
      if (name === 'publish_plan') {
        return Promise.resolve({ data: 3, error: null });
      }
      if (name === 'update_trip_status') {
        return Promise.resolve({ data: { id: args.p_trip_id, status: args.p_new_status }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'TRIP-1', plan_id: 'P-1', vehicle_id: 'V-1', status: 'planned' }],
        error: null,
      }),
    });

    const mockClient = {
      rpc: mockRpc,
      from: vi.fn().mockReturnValue({
        select: mockSelect,
      }),
    };

    const supaAdapter = new SupabaseAdapter(mockClient, 'org-test', { id: 'u1' }, { role: 'planner' });
    const publishRes = await supaAdapter.publishPlan('PLAN-123');
    expect(mockRpc).toHaveBeenCalledWith('publish_plan', { p_plan_id: 'PLAN-123' });
    expect(publishRes.success).toBe(true);

    const updateRes = await supaAdapter.updateTripStatus('TRIP-1', 'accepted');
    expect(mockRpc).toHaveBeenCalledWith('update_trip_status', { p_trip_id: 'TRIP-1', p_new_status: 'accepted' });
    expect(updateRes.status).toBe('accepted');
  });
});

describe('Network JSON Import / Export', () => {
  it('exports and re-imports valid network JSON', () => {
    const original = getDemoNetwork();
    const jsonStr = exportNetworkJson(original);
    expect(typeof jsonStr).toBe('string');

    const imported = importNetworkJson(jsonStr);
    expect(imported.warehouses.length).toBe(original.warehouses.length);
    expect(imported.suppliers.length).toBe(original.suppliers.length);
  });

  it('rejects oversized JSON import payload exceeding 500KB', () => {
    const hugeString = ' '.repeat(501 * 1024);
    expect(() => importNetworkJson(hugeString)).toThrow('Network JSON file is too large');
  });

  it('rejects invalid JSON structure', () => {
    expect(() => importNetworkJson('{ bad json')).toThrow('Invalid JSON syntax');
  });
});
