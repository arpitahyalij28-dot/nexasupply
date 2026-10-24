// Logistics Twin - Driver Trip Status Update Endpoint
// PATCH /api/trip-status
// Validates driver ownership, verifies valid milestone progression, executes
// update_trip_status security-definer RPC, and writes audit_log.
// Only accessible to users with the 'driver' role.

import { z } from 'zod';
import {
  setCorsHeaders,
  jsonResponse,
  errorResponse,
  checkRateLimit,
  parseBody,
  verifyAuth,
  logApiError,
} from './_utils.js';

const statusUpdateSchema = z.object({
  tripId: z.string().min(1, 'tripId is required'),
  status: z.enum(['planned', 'accepted', 'in_transit', 'delivered', 'failed'], {
    errorMap: () => ({
      message: "Status must be one of: 'planned', 'accepted', 'in_transit', 'delivered', 'failed'",
    }),
  }),
});

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'PATCH') {
    return errorResponse(res, 405, 'Method not allowed. Use PATCH.');
  }

  // 1. Authenticate caller and enforce driver role
  const auth = await verifyAuth(req, ['driver']);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error);
  }

  // 2. Rate limit check
  const rate = checkRateLimit(req, auth.user.id);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded for trip status updates. Please wait.');
  }

  // 3. Validate request payload
  const body = parseBody(req);
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join('; ');
    return errorResponse(res, 400, `Invalid status payload: ${errorMsg}`);
  }

  const { tripId, status: newStatus } = parsed.data;

  try {
    const client = auth.client;

    // 4. Fetch trip and verify ownership: driver can only mutate their own assigned vehicle trips
    const { data: trip, error: fetchErr } = await client
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .eq('org_id', auth.orgId)
      .maybeSingle();

    if (fetchErr || !trip) {
      return errorResponse(res, 404, `Trip '${tripId}' not found in your organization.`);
    }

    if (trip.vehicle_id !== auth.profile.vehicle_id) {
      return errorResponse(
        res,
        403,
        `Forbidden: This trip is assigned to vehicle '${trip.vehicle_id}', but your driver profile is assigned to '${auth.profile.vehicle_id}'.`
      );
    }

    // 5. State machine transition check
    const validTransitions = {
      planned: ['accepted', 'failed'],
      accepted: ['in_transit', 'failed'],
      in_transit: ['delivered', 'failed'],
      delivered: [],
      failed: [],
    };

    const allowed = validTransitions[trip.status] || [];
    if (!allowed.includes(newStatus)) {
      return errorResponse(
        res,
        400,
        `Invalid status transition from '${trip.status}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    // 6. Invoke update_trip_status RPC
    const { data: updatedTrip, error: rpcErr } = await client.rpc('update_trip_status', {
      p_trip_id: tripId,
      p_new_status: newStatus,
    });

    if (rpcErr) {
      logApiError('update-trip-status-rpc', rpcErr, { tripId, newStatus });
      return errorResponse(res, 500, `Database failed to transition status: ${rpcErr.message}`);
    }

    // 7. Record audit log
    await client.from('audit_log').insert({
      org_id: auth.orgId,
      user_id: auth.user.id,
      action: 'UPDATE_TRIP_STATUS',
      entity: 'trips',
      entity_id: tripId,
      details: {
        vehicleId: trip.vehicle_id,
        previousStatus: trip.status,
        newStatus,
        updatedAt: new Date().toISOString(),
      },
    });

    return jsonResponse(res, 200, {
      success: true,
      trip: updatedTrip || { id: tripId, status: newStatus },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('update-trip-status', err, { tripId, newStatus, orgId: auth.orgId });
    return errorResponse(res, 500, 'Server encountered an unexpected error updating trip status.');
  }
}
