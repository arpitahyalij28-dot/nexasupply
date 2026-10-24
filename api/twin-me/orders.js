// Logistics Twin - Buyer Consignment Orders Endpoint
// GET /api/twin-me/orders
// Returns trips/consignments destined for the authenticated buyer depot.

import {
  setCorsHeaders,
  jsonResponse,
  errorResponse,
  checkRateLimit,
  verifyAuth,
  logApiError,
} from '../_utils.js';

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

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
