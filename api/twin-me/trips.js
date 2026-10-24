// Logistics Twin - Driver Assigned Trips Endpoint
// GET /api/twin-me/trips
// Returns trips assigned to the authenticated driver's vehicle (or all org trips for planner).

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
