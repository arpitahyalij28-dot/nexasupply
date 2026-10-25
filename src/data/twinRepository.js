// Logistics Twin - Dual-Mode Twin Data Repository (src/data/twinRepository.js)
// Track 3-05: Disruption-Aware Logistics Twin for Regional Supply Networks
// Exposes a unified interface implemented by:
// 1. LocalAdapter (Local storage sandbox, zero config, zero cloud mutation)
// 2. SupabaseAdapter (Cloud Postgres with RLS, security-definer RPCs, and Realtime sync)

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { getDemoNetwork } from './networkDemo.js';
import {
  supplierSchema,
  warehouseSchema,
  buyerSchema,
  routeSchema,
  vehicleSchema,
  networkSchema,
  disruptionScenarioSchema,
  tripStatusUpdateSchema,
} from './schemas.js';

const STORAGE_KEYS = {
  NETWORK: 'logistics_twin_network',
  SCENARIOS: 'logistics_twin_scenarios',
  PLANS: 'logistics_twin_plans',
  TRIPS: 'logistics_twin_trips',
  OFFLINE_QUEUE: 'logistics_twin_offline_queue',
};

// --- Mappers between Engine CamelCase and Database snake_case ---

export function mapDbToNetwork(rows) {
  const { suppliers = [], warehouses = [], buyers = [], routes = [], vehicles = [], settings = null } = rows;

  return {
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      location: s.location || { name: 'Supplier Location', lat: 20.0, lng: 73.8 },
      supplyLimit: Number(s.supply_limit ?? s.supplyLimit ?? 1000),
      product: s.product || 'General Cargo',
      updatedAt: s.updated_at,
    })),
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location || { name: 'Warehouse Location', lat: 19.8, lng: 73.6 },
      stock: Number(w.stock ?? 500),
      storageLimit: Number(w.storage_limit ?? w.storageLimit ?? 1500),
      updatedAt: w.updated_at,
    })),
    buyers: buyers.map((b) => ({
      id: b.id,
      name: b.name,
      location: b.location || { name: 'Buyer Location', lat: 19.2, lng: 73.0 },
      demandQty: Number(b.demand_qty ?? b.demandQty ?? 300),
      deadline: Number(b.deadline ?? 8),
      priority: b.priority || 'medium',
      updatedAt: b.updated_at,
    })),
    routes: routes.map((r) => ({
      id: r.id,
      name: r.name || `${r.from_node || r.from} → ${r.to_node || r.to}`,
      from: r.from_node || r.from,
      to: r.to_node || r.to,
      distanceKm: Number(r.distance_km ?? r.distanceKm ?? 50),
      baseTravelTimeH: Number(r.base_travel_time_h ?? r.baseTravelTimeH ?? 1.5),
      status: r.status || 'open',
      speedFactor: Number(r.speed_factor ?? r.speedFactor ?? 1.0),
      restrictions: r.restrictions || {},
      riskScore: Number(r.risk_score ?? r.riskScore ?? 0.1),
      updatedAt: r.updated_at,
    })),
    vehicles: vehicles.map((v) => ({
      id: v.id,
      type: v.type || 'Medium Truck (8T)',
      capacity: Number(v.capacity ?? 100),
      availableFrom: v.available_from || v.availableFrom,
      availability: Number(v.availability ?? 1),
      costPerKm: Number(v.cost_per_km ?? v.costPerKm ?? 25),
      weightTons: Number(v.weight_tons ?? v.weightTons ?? 8),
      restrictions: v.restrictions || {},
      updatedAt: v.updated_at,
    })),
    settings: settings || getDemoNetwork().settings,
  };
}

export function mapEntityToDbRow(type, entity, orgId = 'demo-org') {
  const normType = type.toLowerCase().replace(/s$/, '');
  const now = new Date().toISOString();

  switch (normType) {
    case 'supplier':
      return {
        id: entity.id,
        org_id: orgId,
        name: entity.name,
        location: entity.location,
        supply_limit: Number(entity.supplyLimit),
        product: entity.product || 'General Cargo',
        updated_at: now,
      };
    case 'warehouse':
      return {
        id: entity.id,
        org_id: orgId,
        name: entity.name,
        location: entity.location,
        stock: Number(entity.stock),
        storage_limit: Number(entity.storageLimit),
        updated_at: now,
      };
    case 'buyer':
      return {
        id: entity.id,
        org_id: orgId,
        name: entity.name,
        location: entity.location,
        demand_qty: Number(entity.demandQty),
        deadline: Number(entity.deadline),
        priority: entity.priority,
        updated_at: now,
      };
    case 'route':
      return {
        id: entity.id,
        org_id: orgId,
        name: entity.name,
        from_node: entity.from,
        to_node: entity.to,
        distance_km: Number(entity.distanceKm),
        base_travel_time_h: Number(entity.baseTravelTimeH),
        status: entity.status || 'open',
        speed_factor: Number(entity.speedFactor ?? 1.0),
        restrictions: entity.restrictions || {},
        risk_score: Number(entity.riskScore ?? 0.0),
        updated_at: now,
      };
    case 'vehicle':
      return {
        id: entity.id,
        org_id: orgId,
        type: entity.type,
        capacity: Number(entity.capacity),
        available_from: entity.availableFrom,
        availability: Number(entity.availability ?? 1),
        cost_per_km: Number(entity.costPerKm),
        weight_tons: Number(entity.weightTons),
        restrictions: entity.restrictions || {},
        updated_at: now,
      };
    default:
      throw new Error(`Unknown entity type for DB mapping: ${type}`);
  }
}

// --- Entity Zod Validation Helper ---

export function validateEntity(type, entity) {
  const normType = type.toLowerCase().replace(/s$/, '');
  let result;
  switch (normType) {
    case 'supplier':
      result = supplierSchema.safeParse(entity);
      break;
    case 'warehouse':
      result = warehouseSchema.safeParse(entity);
      break;
    case 'buyer':
      result = buyerSchema.safeParse(entity);
      break;
    case 'route':
      result = routeSchema.safeParse(entity);
      break;
    case 'vehicle':
      result = vehicleSchema.safeParse(entity);
      break;
    default:
      return { success: true, data: entity };
  }

  if (!result.success) {
    const errorMsg = (result.error.issues || result.error.errors || []).map((e) => e.message).join('; ');
    throw new Error(`Validation failed for ${type}: ${errorMsg}`);
  }
  return result;
}

// --- 1. LOCAL DEMO ADAPTER ---

export class LocalAdapter {
  constructor(options = {}) {
    this.name = 'LocalAdapter';
    this.profile = options.profile || null;
    this.listeners = new Set();
    this._initStorage();
  }

  _initStorage() {
    try {
      if (!localStorage.getItem(STORAGE_KEYS.NETWORK)) {
        localStorage.setItem(STORAGE_KEYS.NETWORK, JSON.stringify(getDemoNetwork()));
      }
      if (!localStorage.getItem(STORAGE_KEYS.SCENARIOS)) {
        localStorage.setItem(STORAGE_KEYS.SCENARIOS, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.PLANS)) {
        localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.TRIPS)) {
        localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify([]));
      }
    } catch {
      // Storage unavailable or mocked
    }
  }

  _notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[LocalAdapter] Listener error:', err);
      }
    }
  }

  async loadNetwork() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.NETWORK);
      if (!raw) return getDemoNetwork();
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.warehouses) && parsed.warehouses.length > 0) {
        return parsed;
      }
      return getDemoNetwork();
    } catch {
      return getDemoNetwork();
    }
  }

  async saveEntity(type, entity) {
    validateEntity(type, entity);
    const network = await this.loadNetwork();
    const pluralKey = type.toLowerCase().endsWith('s') ? type.toLowerCase() : `${type.toLowerCase()}s`;

    if (!Array.isArray(network[pluralKey])) {
      network[pluralKey] = [];
    }

    const existingIndex = network[pluralKey].findIndex((item) => item.id === entity.id);
    const withTimestamp = { ...entity, updatedAt: new Date().toISOString() };

    if (existingIndex >= 0) {
      network[pluralKey][existingIndex] = withTimestamp;
    } else {
      network[pluralKey] = [withTimestamp, ...network[pluralKey]];
    }

    localStorage.setItem(STORAGE_KEYS.NETWORK, JSON.stringify(network));
    this._notify({ type: 'ENTITY_SAVED', payload: { entityType: pluralKey, entity: withTimestamp } });
    return withTimestamp;
  }

  async deleteEntity(type, id) {
    const network = await this.loadNetwork();
    const pluralKey = type.toLowerCase().endsWith('s') ? type.toLowerCase() : `${type.toLowerCase()}s`;

    if (Array.isArray(network[pluralKey])) {
      network[pluralKey] = network[pluralKey].filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEYS.NETWORK, JSON.stringify(network));
      this._notify({ type: 'ENTITY_DELETED', payload: { entityType: pluralKey, id } });
    }
    return true;
  }

  async resetDemoNetwork() {
    const demo = getDemoNetwork();
    localStorage.setItem(STORAGE_KEYS.NETWORK, JSON.stringify(demo));
    this._notify({ type: 'NETWORK_RESET', payload: demo });
    return demo;
  }

  async saveScenario(config) {
    const scenario = {
      id: `SCN-${Date.now()}`,
      name: config.name || 'Simulated Scenario',
      config,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(scenario);
      localStorage.setItem(STORAGE_KEYS.SCENARIOS, JSON.stringify(list));
    } catch {}
    this._notify({ type: 'SCENARIO_SAVED', payload: scenario });
    return scenario;
  }

  async loadScenarios() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async savePlan(type, plan, scenarioId = null) {
    const record = {
      id: `PLAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      planType: type,
      scenarioId,
      plan,
      totals: plan.totals || null,
      resilience: plan.resilience || null,
      validation: plan.validation || null,
      published: false,
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PLANS);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(record);
      localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(list));
    } catch {}
    this._notify({ type: 'PLAN_SAVED', payload: record });
    return record;
  }

  async publishPlan(planId) {
    let plans = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PLANS);
      plans = raw ? JSON.parse(raw) : [];
    } catch {}

    const targetPlan = plans.find((p) => p.id === planId);
    if (!targetPlan) {
      throw new Error(`Plan ${planId} not found to publish`);
    }

    targetPlan.published = true;
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));

    // Flatten allocations into trips
    const allocations = targetPlan.plan?.allocations || [];
    const newTrips = allocations.map((a, idx) => ({
      id: `TRIP-${Date.now()}-${idx + 1}`,
      plan_id: planId,
      planId: planId,
      vehicle_id: a.vehicleId,
      vehicleId: a.vehicleId,
      buyer_id: a.buyerId,
      buyerId: a.buyerId,
      warehouse_id: a.warehouseId,
      warehouseId: a.warehouseId,
      route_id: a.routeId,
      routeId: a.routeId,
      quantity: Number(a.allocatedQty || a.quantity || 0),
      eta_hours: Number(a.etaHours || 0),
      etaHours: Number(a.etaHours || 0),
      cost: Number(a.cost || 0),
      on_time: Boolean(a.onTime),
      onTime: Boolean(a.onTime),
      status: 'planned',
      updated_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    try {
      const rawTrips = localStorage.getItem(STORAGE_KEYS.TRIPS);
      const currentTrips = rawTrips ? JSON.parse(rawTrips) : [];
      // Remove previous trips from this plan if re-publishing
      const filtered = currentTrips.filter((t) => t.plan_id !== planId && t.planId !== planId);
      const updated = [...newTrips, ...filtered];
      localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(updated));
    } catch {}

    this._notify({ type: 'PLAN_PUBLISHED', payload: { planId, trips: newTrips } });
    return { success: true, trips: newTrips };
  }

  async loadTripsForMe() {
    let trips = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TRIPS);
      trips = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }

    const role = this.profile?.role;
    if (role === 'driver' && this.profile?.vehicle_id) {
      return trips.filter((t) => (t.vehicle_id || t.vehicleId) === this.profile.vehicle_id);
    }
    if (role === 'buyer' && this.profile?.buyer_id) {
      return trips.filter((t) => (t.buyer_id || t.buyerId) === this.profile.buyer_id);
    }
    return trips;
  }

  async updateTripStatus(tripId, status) {
    tripStatusUpdateSchema.parse({ tripId, status });

    let trips = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TRIPS);
      trips = raw ? JSON.parse(raw) : [];
    } catch {}

    const trip = trips.find((t) => t.id === tripId);
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const validTransitions = {
      planned: ['accepted', 'failed'],
      accepted: ['in_transit', 'failed'],
      in_transit: ['delivered', 'failed'],
      delivered: [],
      failed: [],
    };

    const allowed = validTransitions[trip.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid status transition from '${trip.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`);
    }

    trip.status = status;
    trip.updated_at = new Date().toISOString();
    trip.updatedAt = trip.updated_at;

    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
    this._notify({ type: 'TRIP_STATUS_UPDATED', payload: trip });
    return trip;
  }

  subscribe(callback) {
    this.listeners.add(callback);

    // Cross-tab synchronization via storage event
    const storageHandler = (e) => {
      if (e.key?.startsWith('logistics_twin_')) {
        callback({ type: 'STORAGE_SYNC', key: e.key });
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      this.listeners.delete(callback);
      window.removeEventListener('storage', storageHandler);
    };
  }
}

// --- 2. SUPABASE CLOUD ADAPTER ---

export class SupabaseAdapter {
  constructor(client, orgId, user, profile) {
    this.name = 'SupabaseAdapter';
    this.client = client;
    this.orgId = orgId || 'demo-org';
    this.user = user;
    this.profile = profile;
    this.pollingInterval = null;
    this.realtimeChannel = null;
  }

  async loadNetwork() {
    const [supRes, whRes, buyRes, routeRes, vehRes] = await Promise.all([
      this.client.from('suppliers').select('*').eq('org_id', this.orgId),
      this.client.from('warehouses').select('*').eq('org_id', this.orgId),
      this.client.from('buyers').select('*').eq('org_id', this.orgId),
      this.client.from('routes').select('*').eq('org_id', this.orgId),
      this.client.from('vehicles').select('*').eq('org_id', this.orgId),
    ]);

    // Check for errors
    const err = supRes.error || whRes.error || buyRes.error || routeRes.error || vehRes.error;
    if (err) {
      console.warn('[SupabaseAdapter] Load network error:', err.message);
      throw new Error(`Failed to load network from cloud: ${err.message}`);
    }

    // If org has zero warehouses yet, fallback to seed demo network
    if (!whRes.data || whRes.data.length === 0) {
      return getDemoNetwork();
    }

    return mapDbToNetwork({
      suppliers: supRes.data || [],
      warehouses: whRes.data || [],
      buyers: buyRes.data || [],
      routes: routeRes.data || [],
      vehicles: vehRes.data || [],
    });
  }

  async saveEntity(type, entity) {
    validateEntity(type, entity);
    const tableName = type.toLowerCase().endsWith('s') ? type.toLowerCase() : `${type.toLowerCase()}s`;
    const row = mapEntityToDbRow(type, entity, this.orgId);

    const { data, error } = await this.client
      .from(tableName)
      .upsert(row, { onConflict: 'id,org_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Cloud save failed for ${type}: ${error.message}`);
    }
    return data;
  }

  async deleteEntity(type, id) {
    const tableName = type.toLowerCase().endsWith('s') ? type.toLowerCase() : `${type.toLowerCase()}s`;
    const { error } = await this.client
      .from(tableName)
      .delete()
      .eq('id', id)
      .eq('org_id', this.orgId);

    if (error) {
      throw new Error(`Cloud delete failed for ${type}: ${error.message}`);
    }
    return true;
  }

  async resetDemoNetwork() {
    const { data, error } = await this.client.rpc('reset_demo_network');
    if (error) {
      throw new Error(`Reset demo network failed: ${error.message}`);
    }
    return this.loadNetwork();
  }

  async saveScenario(config) {
    const row = {
      org_id: this.orgId,
      name: config.name || 'Simulated Scenario',
      config,
      is_active: true,
      created_by: this.user?.id || null,
    };

    const { data, error } = await this.client
      .from('disruption_scenarios')
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`Save scenario failed: ${error.message}`);
    }
    return data;
  }

  async loadScenarios() {
    const { data, error } = await this.client
      .from('disruption_scenarios')
      .select('*')
      .eq('org_id', this.orgId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Load scenarios failed: ${error.message}`);
    }
    return data || [];
  }

  async savePlan(type, plan, scenarioId = null) {
    const row = {
      org_id: this.orgId,
      scenario_id: scenarioId,
      plan_type: type,
      plan,
      totals: plan.totals || null,
      resilience: plan.resilience || null,
      validation: plan.validation || null,
      published: false,
      created_by: this.user?.id || null,
    };

    const { data, error } = await this.client
      .from('plans')
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`Save plan failed: ${error.message}`);
    }
    return data;
  }

  async publishPlan(planId) {
    const { data, error } = await this.client.rpc('publish_plan', {
      p_plan_id: planId,
    });

    if (error) {
      throw new Error(`Publish plan failed: ${error.message}`);
    }

    const trips = await this.loadTripsForMe();
    return { success: true, count: data, trips };
  }

  async loadTripsForMe() {
    let query = this.client
      .from('trips')
      .select('*')
      .eq('org_id', this.orgId)
      .order('updated_at', { ascending: false });

    const role = this.profile?.role;
    if (role === 'driver' && this.profile?.vehicle_id) {
      query = query.eq('vehicle_id', this.profile.vehicle_id);
    } else if (role === 'buyer' && this.profile?.buyer_id) {
      query = query.eq('buyer_id', this.profile.buyer_id);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Load trips failed: ${error.message}`);
    }

    return (data || []).map((t) => ({
      id: t.id,
      plan_id: t.plan_id,
      planId: t.plan_id,
      vehicle_id: t.vehicle_id,
      vehicleId: t.vehicle_id,
      buyer_id: t.buyer_id,
      buyerId: t.buyer_id,
      warehouse_id: t.warehouse_id,
      warehouseId: t.warehouse_id,
      route_id: t.route_id,
      routeId: t.route_id,
      quantity: Number(t.quantity || 0),
      eta_hours: Number(t.eta_hours || 0),
      etaHours: Number(t.eta_hours || 0),
      cost: Number(t.cost || 0),
      on_time: Boolean(t.on_time),
      onTime: Boolean(t.on_time),
      status: t.status,
      updated_at: t.updated_at,
      updatedAt: t.updated_at,
    }));
  }

  async updateTripStatus(tripId, status) {
    tripStatusUpdateSchema.parse({ tripId, status });

    const { data, error } = await this.client.rpc('update_trip_status', {
      p_trip_id: tripId,
      p_new_status: status,
    });

    if (error) {
      throw new Error(`Update trip status failed: ${error.message}`);
    }
    return data;
  }

  subscribe(callback) {
    let isSubscribed = false;

    // Start 15-second polling fallback
    const startPolling = () => {
      if (this.pollingInterval) return;
      this.pollingInterval = setInterval(() => {
        callback({ type: 'POLL_SYNC', timestamp: Date.now() });
      }, 15000);
    };

    try {
      this.realtimeChannel = this.client
        .channel(`twin-org-${this.orgId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', filter: `org_id=eq.${this.orgId}` },
          (payload) => {
            callback({ type: 'REALTIME_CHANGE', payload });
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[SupabaseAdapter] Realtime channel issue, activating fallback polling');
            startPolling();
          }
        });
    } catch (err) {
      console.warn('[SupabaseAdapter] Failed to initialize Realtime:', err);
      startPolling();
    }

    return () => {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      if (this.realtimeChannel) {
        this.client.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
      }
    };
  }
}

// --- 3. REPOSITORY FACTORY ---

export function createTwinRepository(options = {}) {
  const { user, profile, forceLocal = false, client } = options;

  const activeClient = client || (isSupabaseConfigured ? supabase : null);

  // If visitor is in demo mode or Supabase is not configured, always return LocalAdapter
  if (forceLocal || !user || !profile || profile.isDemo || !activeClient) {
    return new LocalAdapter(options);
  }

  const orgId = profile.org_id || profile.orgId || 'demo-org';
  return new SupabaseAdapter(activeClient, orgId, user, profile);
}

// --- 4. EXPORT / IMPORT HELPERS (Validated with Zod) ---

export function exportNetworkJson(network) {
  return JSON.stringify(network, null, 2);
}

export function importNetworkJson(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new Error('Import payload must be a JSON string');
  }
  // Enforce max size (500 KB)
  if (jsonString.length > 500 * 1024) {
    throw new Error('Network JSON file is too large (max 500KB allowed)');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Invalid JSON syntax: ${err.message}`);
  }

  const result = networkSchema.safeParse(parsed);
  if (!result.success) {
    const errorMessages = (result.error.issues || result.error.errors || []).map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Network validation failed: ${errorMessages}`);
  }

  return result.data;
}
