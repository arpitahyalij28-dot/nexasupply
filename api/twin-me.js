// Logistics Twin - Buyer Consignments & Driver Assigned Trips Consolidated Endpoint
// GET /api/twin-me?resource=orders or /api/twin-me?resource=trips
// Also supports rewrites from /api/twin-me/orders and /api/twin-me/trips.

import {
  setCorsHeaders,
  jsonResponse,
  errorResponse,
  checkRateLimit,
  verifyAuth,
  logApiError,
} from './_utils.js';

/**
 * Handler for Buyer Consignment Orders
 */
export async function ordersHandler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  // 1. Authenticate caller (buyers and planners can query orders)
  const auth = await verifyAuth(req, ['buyer', 'planner']);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error);
  }

  // 2. Rate limit check
  const rate = checkRateLimit(req, auth.user.id);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded. Please wait.');
  }

  try {
    const client = auth.client;
    let query = client
      .from('trips')
      .select('*')
      .eq('org_id', auth.orgId);

    // Least-privilege: Buyers can ONLY view trips matching their assigned buyer_id
    if (auth.role === 'buyer') {
      if (!auth.profile.buyer_id) {
        return jsonResponse(res, 200, {
          success: true,
          orders: [],
          message: 'No buyer depot is currently linked to your buyer profile.',
        });
      }
      query = query.eq('buyer_id', auth.profile.buyer_id);
    }

    query = query.order('updated_at', { ascending: false });

    const { data: orders, error: fetchErr } = await query;
    if (fetchErr) {
      logApiError('twin-me-orders', fetchErr, { orgId: auth.orgId, userId: auth.user.id });
      return errorResponse(res, 500, `Failed to load orders: ${fetchErr.message}`);
    }

    return jsonResponse(res, 200, {
      success: true,
      orders: orders || [],
      count: orders?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('twin-me-orders-fatal', err, { orgId: auth.orgId });
    return errorResponse(res, 500, 'Internal server error loading buyer consignments');
  }
}

/**
 * Handler for Driver Assigned Trips
 */
export async function tripsHandler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed. Use GET.');
  }

  // 1. Authenticate caller (drivers and planners can query trips)
  const auth = await verifyAuth(req, ['driver', 'planner']);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error);
  }

  // 2. Rate limit check
  const rate = checkRateLimit(req, auth.user.id);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded. Please wait.');
  }

  try {
    const client = auth.client;
    let query = client
      .from('trips')
      .select('*')
      .eq('org_id', auth.orgId);

    // Least-privilege: Drivers can ONLY view trips matching their assigned vehicle_id
    if (auth.role === 'driver') {
      if (!auth.profile.vehicle_id) {
        return jsonResponse(res, 200, {
          success: true,
          trips: [],
          message: 'No vehicle is currently linked to your driver profile.',
        });
      }
      query = query.eq('vehicle_id', auth.profile.vehicle_id);
    }

    query = query.order('updated_at', { ascending: false });

    const { data: trips, error: fetchErr } = await query;
    if (fetchErr) {
      logApiError('twin-me-trips', fetchErr, { orgId: auth.orgId, userId: auth.user.id });
      return errorResponse(res, 500, `Failed to load trips: ${fetchErr.message}`);
    }

    return jsonResponse(res, 200, {
      success: true,
      trips: trips || [],
      count: trips?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('twin-me-trips-fatal', err, { orgId: auth.orgId });
    return errorResponse(res, 500, 'Internal server error loading driver trips');
  }
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

  const resource = req.query?.resource || (req.url?.includes('orders') ? 'orders' : req.url?.includes('trips') ? 'trips' : null);

  if (resource === 'orders') {
    return ordersHandler(req, res);
  }
  if (resource === 'trips') {
    return tripsHandler(req, res);
  }

  return errorResponse(res, 400, 'Invalid resource parameter. Specify ?resource=orders or ?resource=trips.');
}
