// Logistics Twin - Trusted Plan Publishing Endpoint
// POST /api/twin-publish
// Validates plan integrity before publishing, calls publish_plan RPC to flatten
// allocations into trips, checks idempotency (409 on duplicate publish), and writes audit_log.
// Only accessible to users with the 'planner' role.

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
import { validateDispatchPlan } from '../src/engine/validation.js';
import { getDemoNetwork } from '../src/data/networkDemo.js';
import { mapDbToNetwork } from '../src/data/twinRepository.js';

const requestSchema = z.object({
  planId: z.string().min(1, 'planId is required'),
});

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  // 1. Authenticate caller and enforce planner role
  const auth = await verifyAuth(req, ['planner']);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error);
  }

  // 2. Rate limit
  const rate = checkRateLimit(req, auth.user.id);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded for publishing. Please wait.');
  }

  // 3. Validate body
  const body = parseBody(req);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join('; ');
    return errorResponse(res, 400, `Invalid request: ${errorMsg}`);
  }

  const { planId } = parsed.data;

  try {
    const client = auth.client;

    // 4. Fetch the plan record from DB ensuring it belongs to the planner's org
    const { data: planRecord, error: planErr } = await client
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('org_id', auth.orgId)
      .maybeSingle();

    if (planErr || !planRecord) {
      return errorResponse(res, 404, `Plan '${planId}' not found in your organization.`);
    }

    // 5. Idempotency Check: Refuse duplicate publishing
    if (planRecord.published) {
      return errorResponse(res, 409, `Plan '${planId}' is already published.`);
    }

    // 6. Integrity check: Validate plan against network before publishing
    const [supRes, whRes, buyRes, routeRes, vehRes] = await Promise.all([
      client.from('suppliers').select('*').eq('org_id', auth.orgId),
      client.from('warehouses').select('*').eq('org_id', auth.orgId),
      client.from('buyers').select('*').eq('org_id', auth.orgId),
      client.from('routes').select('*').eq('org_id', auth.orgId),
      client.from('vehicles').select('*').eq('org_id', auth.orgId),
    ]);

    const network =
      !whRes.data || whRes.data.length === 0
        ? getDemoNetwork()
        : mapDbToNetwork({
            suppliers: supRes.data || [],
            warehouses: whRes.data || [],
            buyers: buyRes.data || [],
            routes: routeRes.data || [],
            vehicles: vehRes.data || [],
          });

    const validation = validateDispatchPlan(planRecord.plan, network);
    if (!validation.isValid) {
      return errorResponse(res, 400, 'Cannot publish plan: integrity checks failed', {
        violations: validation.violations,
      });
    }

    // 7. Invoke security-definer RPC publish_plan
    const { data: tripCount, error: rpcErr } = await client.rpc('publish_plan', {
      p_plan_id: planId,
    });

    if (rpcErr) {
      logApiError('twin-publish-rpc', rpcErr, { planId, orgId: auth.orgId });
      return errorResponse(res, 500, `Failed to execute plan publishing: ${rpcErr.message}`);
    }

    // 8. Record audit log
    await client.from('audit_log').insert({
      org_id: auth.orgId,
      user_id: auth.user.id,
      action: 'PUBLISH_PLAN',
      entity: 'plans',
      entity_id: planId,
      details: {
        planType: planRecord.plan_type,
        tripsGenerated: tripCount,
        publishedAt: new Date().toISOString(),
      },
    });

    return jsonResponse(res, 200, {
      success: true,
      planId,
      tripsPublished: tripCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('twin-publish', err, { planId, orgId: auth.orgId });
    return errorResponse(res, 500, 'Internal server error while publishing plan');
  }
}
