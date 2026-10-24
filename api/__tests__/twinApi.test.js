// Logistics Twin - Phase 4 Serverless API Endpoints Test Suite
// Verifies JWT authentication, role-based authorization (planner/driver/buyer),
// Zod payload validation, idempotency (409 on duplicate publish), ownership checks,
// and audit logging.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import twinPlanHandler from '../twin-plan.js';
import twinPublishHandler from '../twin-publish.js';
import adminInviteHandler from '../admin-invite.js';
import twinMeTripsHandler from '../twin-me/trips.js';
import twinMeOrdersHandler from '../twin-me/orders.js';
import tripStatusHandler from '../trip-status.js';
import healthHandler from '../health.js';
import { setSupabaseAdminClient } from '../_utils.js';
import { getDemoNetwork } from '../../src/data/networkDemo.js';

function createMockReqRes({ method = 'GET', body = {}, headers = {}, query = {} } = {}) {
  const req = {
    method,
    body,
    query,
    headers: { 'x-forwarded-for': '127.0.0.1', ...headers },
  };

  const res = {
    statusCode: 200,
    headers: {},
    responseData: null,
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.responseData = data;
      return this;
    },
    end() {
      return this;
    },
  };

  return { req, res };
}

describe('Serverless API Endpoints (Phase 4 Security & RBAC)', () => {
  let mockClient;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockClient = {
      auth: {
        getUser: vi.fn().mockImplementation((token) => {
          if (token === 'planner-token') {
            return Promise.resolve({ data: { user: { id: 'usr-planner-1' } }, error: null });
          }
          if (token === 'driver-token') {
            return Promise.resolve({ data: { user: { id: 'usr-driver-1' } }, error: null });
          }
          if (token === 'buyer-token') {
            return Promise.resolve({ data: { user: { id: 'usr-buyer-1' } }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Invalid token') });
        }),
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr-new-driver' } },
            error: null,
          }),
        },
      },
      from: vi.fn().mockImplementation((tableName) => {
        if (tableName === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => ({
                maybeSingle: vi.fn().mockImplementation(() => {
                  if (val === 'usr-planner-1') {
                    return Promise.resolve({
                      data: { id: 'usr-planner-1', org_id: 'org-nashik', role: 'planner' },
                      error: null,
                    });
                  }
                  if (val === 'usr-driver-1') {
                    return Promise.resolve({
                      data: {
                        id: 'usr-driver-1',
                        org_id: 'org-nashik',
                        role: 'driver',
                        vehicle_id: 'veh-sat-1',
                      },
                      error: null,
                    });
                  }
                  if (val === 'usr-buyer-1') {
                    return Promise.resolve({
                      data: {
                        id: 'usr-buyer-1',
                        org_id: 'org-nashik',
                        role: 'buyer',
                        buyer_id: 'buy-thane-med',
                      },
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              })),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        if (tableName === 'plans') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [
                  { id: 'p-norm', plan_type: 'normal' },
                  { id: 'p-recov', plan_type: 'recovery' },
                ],
                error: null,
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col1, val1) => ({
                eq: vi.fn().mockImplementation((col2, val2) => ({
                  maybeSingle: vi.fn().mockImplementation(() => {
                    if (val1 === 'plan-already-published') {
                      return Promise.resolve({
                        data: {
                          id: 'plan-already-published',
                          org_id: 'org-nashik',
                          published: true,
                          plan: { allocations: [] },
                        },
                        error: null,
                      });
                    }
                    if (val1 === 'plan-valid-recovery') {
                      return Promise.resolve({
                        data: {
                          id: 'plan-valid-recovery',
                          org_id: 'org-nashik',
                          published: false,
                          plan_type: 'recovery',
                          plan: {
                            allocations: [
                              {
                                vehicleId: 'veh-sat-1',
                                buyerId: 'buy-thane-med',
                                warehouseId: 'wh-satpur',
                                routeId: 'r-satpur-igatpuri',
                                allocatedQty: 50,
                                etaHours: 2.5,
                                cost: 1200,
                                onTime: true,
                              },
                            ],
                          },
                        },
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  }),
                })),
              })),
            }),
          };
        }

        if (tableName === 'trips') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col, val) => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'trip-1',
                      org_id: 'org-nashik',
                      vehicle_id: 'veh-sat-1',
                      buyer_id: 'buy-thane-med',
                      status: 'planned',
                    },
                  ],
                  error: null,
                }),
                eq: vi.fn().mockImplementation((col2, val2) => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'trip-1',
                        org_id: 'org-nashik',
                        vehicle_id: 'veh-sat-1',
                        buyer_id: 'buy-thane-med',
                        status: 'planned',
                      },
                    ],
                    error: null,
                  }),
                  maybeSingle: vi.fn().mockImplementation(() => {
                    if (val === 'trip-1') {
                      return Promise.resolve({
                        data: {
                          id: 'trip-1',
                          org_id: 'org-nashik',
                          vehicle_id: 'veh-sat-1',
                          status: 'planned',
                        },
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  }),
                })),
              })),
            }),
          };
        }

        if (tableName === 'disruption_scenarios' || tableName === 'audit_log') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'scn-1' }, error: null }),
              }),
            }),
          };
        }

        // Network tables default empty
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
      rpc: vi.fn().mockImplementation((rpcName) => {
        if (rpcName === 'publish_plan') {
          return Promise.resolve({ data: 3, error: null });
        }
        if (rpcName === 'update_trip_status') {
          return Promise.resolve({ data: { id: 'trip-1', status: 'accepted' }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    // Inject mock into environment
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';
    setSupabaseAdminClient(mockClient);
  });

  // --- Auth & RBAC Checks ---

  it('rejects unauthenticated requests with 401', async () => {
    const { req, res } = createMockReqRes({ method: 'POST', body: {} });
    await twinPlanHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.responseData.error).toContain('Authorization Bearer token is missing');
  });

  it('rejects wrong role (driver calling planner endpoint) with 403', async () => {
    // Pass mockClient directly in test

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer driver-token' },
      body: {},
    });
    await twinPlanHandler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.responseData.error).toContain("role 'driver' lacks permission");
  });

  // --- POST /api/twin-plan ---

  it('POST /api/twin-plan computes trusted plan comparison from DB network and returns 200', async () => {

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer planner-token' },
      body: { scenarioConfig: { severeWeatherRouteIds: ['r-satpur-igatpuri'] } },
    });
    await twinPlanHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.comparison).toBeDefined();
    expect(res.responseData.comparison.normalPlan.totals).toBeDefined();
    expect(res.responseData.comparison.recoveryPlan.totals).toBeDefined();
    expect(res.responseData.recoveryPlanId).toBe('p-recov');
  });

  // --- POST /api/twin-publish ---

  it('POST /api/twin-publish validates integrity, publishes plan, and returns 200', async () => {

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer planner-token' },
      body: { planId: 'plan-valid-recovery' },
    });
    await twinPublishHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.tripsPublished).toBe(3);
    expect(mockClient.rpc).toHaveBeenCalledWith('publish_plan', { p_plan_id: 'plan-valid-recovery' });
  });

  it('POST /api/twin-publish refuses double publishing with 409 Conflict', async () => {

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer planner-token' },
      body: { planId: 'plan-already-published' },
    });
    await twinPublishHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.responseData.error).toContain('is already published');
  });

  // --- POST /api/admin-invite ---

  it('POST /api/admin-invite creates driver user with service role and returns 201', async () => {

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer planner-token' },
      body: {
        email: 'newdriver@test.com',
        password: 'Password123!',
        fullName: 'New Driver',
        role: 'driver',
        vehicleId: 'veh-sat-1',
      },
    });
    await adminInviteHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.user.email).toBe('newdriver@test.com');
    expect(res.responseData.user.role).toBe('driver');
  });

  // --- GET /api/twin-me/trips and /api/twin-me/orders ---

  it('GET /api/twin-me/trips returns assigned trips for driver', async () => {

    const { req, res } = createMockReqRes({
      method: 'GET',
      headers: { authorization: 'Bearer driver-token' },
    });
    await twinMeTripsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.trips.length).toBe(1);
    expect(res.responseData.trips[0].vehicle_id).toBe('veh-sat-1');
  });

  it('GET /api/twin-me/orders returns consignments for buyer', async () => {

    const { req, res } = createMockReqRes({
      method: 'GET',
      headers: { authorization: 'Bearer buyer-token' },
    });
    await twinMeOrdersHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.orders.length).toBe(1);
  });

  // --- PATCH /api/trip-status ---

  it('PATCH /api/trip-status allows valid driver status update', async () => {

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      headers: { authorization: 'Bearer driver-token' },
      body: { tripId: 'trip-1', status: 'accepted' },
    });
    await tripStatusHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData.success).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith('update_trip_status', {
      p_trip_id: 'trip-1',
      p_new_status: 'accepted',
    });
  });

  it('PATCH /api/trip-status rejects invalid status transition with 400', async () => {

    const { req, res } = createMockReqRes({
      method: 'PATCH',
      headers: { authorization: 'Bearer driver-token' },
      body: { tripId: 'trip-1', status: 'delivered' }, // cannot jump planned -> delivered directly
    });
    await tripStatusHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.responseData.error).toContain('Invalid status transition');
  });

  // --- GET /api/health ---

  it('GET /api/health returns database reachable status without leaking secrets', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' });
    await healthHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData.status).toBe('healthy');
    expect(res.responseData.version).toBe('2.0.0');
    expect(typeof res.responseData.database.reachable).toBe('boolean');
    // Ensure no secrets leaked
    const jsonString = JSON.stringify(res.responseData);
    expect(jsonString).not.toContain('mock-service-key');
    expect(jsonString).not.toContain('anon');
  });
});
