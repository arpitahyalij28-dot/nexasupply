// Logistics Twin - Trusted Serverless Plan Solver & Publisher Endpoint
// POST /api/twin-plan -> solves & saves comparison plans
// POST /api/twin-publish -> publishes plan to active trips table via RPC
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
import { generatePlanComparison } from '../src/engine/planner.js';
import { validateDispatchPlan } from '../src/engine/validation.js';
import { calculateResilienceScore } from '../src/engine/resilience.js';
import { getDemoNetwork } from '../src/data/networkDemo.js';
import { mapDbToNetwork } from '../src/data/twinRepository.js';

const planRequestSchema = z.object({
  scenarioConfig: z.record(z.any()).default({}),
});

const publishRequestSchema = z.object({
  planId: z.string().min(1, 'planId is required'),
});

export async function planHandler(req, res) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  // 1. Authenticate caller and enforce planner role
  const auth = await verifyAuth(req, ['planner']);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error);
  }

  // 2. Rate limit check (keyed to user ID)
  const rate = checkRateLimit(req, auth.user.id);
  if (!rate.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded for planning solver. Please wait.');
  }

  // 3. Validate request payload
  const body = parseBody(req);
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = (parsed.error.issues || parsed.error.errors || []).map((e) => e.message).join('; ');
    return errorResponse(res, 400, `Invalid request payload: ${errorMsg}`);
  }

  const { scenarioConfig } = parsed.data;

  try {
    const client = auth.client;

    // 4. Load authoritative network from DB for this org (never trust client network)
    const [supRes, whRes, buyRes, routeRes, vehRes] = await Promise.all([
      client.from('suppliers').select('*').eq('org_id', auth.orgId),
      client.from('warehouses').select('*').eq('org_id', auth.orgId),
      client.from('buyers').select('*').eq('org_id', auth.orgId),
      client.from('routes').select('*').eq('org_id', auth.orgId),
      client.from('vehicles').select('*').eq('org_id', auth.orgId),
    ]);

    let network;
    if (!whRes.data || whRes.data.length === 0) {
      network = getDemoNetwork();
    } else {
      network = mapDbToNetwork({
        suppliers: supRes.data || [],
        warehouses: whRes.data || [],
        buyers: buyRes.data || [],
        routes: routeRes.data || [],
        vehicles: vehRes.data || [],
      });
    }

    // 5. Execute pure engine planning comparison
    const comparison = generatePlanComparison(network, scenarioConfig);
    const normalPlan = comparison.plans.normal;
    const disruptedPlan = comparison.plans.disruptionBasic;
    const recoveryPlan = comparison.plans.recovery;

    // 6. Validate generated dispatch plans
    const normalValidation = validateDispatchPlan(normalPlan, network);
    const recoveryValidation = validateDispatchPlan(recoveryPlan, network);

    // 7. Calculate resilience score
    const resilience = calculateResilienceScore(
      recoveryPlan,
      network,
      disruptedPlan
    );

    // 8. Persist scenario into disruption_scenarios table
    const { data: scenarioRecord } = await client
      .from('disruption_scenarios')
      .insert({
        org_id: auth.orgId,
        name: scenarioConfig.name || 'Simulated Disruption Scenario',
        config: scenarioConfig,
        is_active: true,
        created_by: auth.user.id,
      })
      .select()
      .single();

    const scenarioId = scenarioRecord?.id || null;

    // 9. Persist the 3 plans (normal, disruption_basic, recovery)
    const planRecords = [
      {
        org_id: auth.orgId,
        scenario_id: scenarioId,
        plan_type: 'normal',
        plan: normalPlan,
        totals: normalPlan.totals,
        validation: normalValidation,
        published: false,
        created_by: auth.user.id,
      },
      {
        org_id: auth.orgId,
        scenario_id: scenarioId,
        plan_type: 'disruption_basic',
        plan: disruptedPlan,
        totals: disruptedPlan.totals,
        published: false,
        created_by: auth.user.id,
      },
      {
        org_id: auth.orgId,
        scenario_id: scenarioId,
        plan_type: 'recovery',
        plan: recoveryPlan,
        totals: recoveryPlan.totals,
        resilience,
        validation: recoveryValidation,
        published: false,
        created_by: auth.user.id,
      },
    ];

    const { data: savedPlans } = await client
      .from('plans')
      .insert(planRecords)
      .select();

    const recoveryPlanId = savedPlans?.find((p) => p.plan_type === 'recovery')?.id || null;

    return jsonResponse(res, 200, {
      success: true,
      comparison: {
        ...comparison,
        normalPlan,
        disruptedPlan,
        recoveryPlan,
        resilience,
        validation: {
          normal: normalValidation,
          recovery: recoveryValidation,
        },
      },
      scenarioId,
      recoveryPlanId,
      plansSaved: savedPlans?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logApiError('twin-plan', err, { orgId: auth.orgId, userId: auth.user.id });
    return errorResponse(res, 500, 'Planning computation encountered an internal failure');
  }
}

export async function publishHandler(req, res) {
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
  const parsed = publishRequestSchema.safeParse(body);
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

export default async function handler(req, res) {
  const isPublish =
    req.url?.includes('publish') ||
    req.query?.action === 'publish' ||
    req.body?.action === 'publish' ||
    (req.body && req.body.planId && !req.body.scenarioConfig);

  if (isPublish) {
    return publishHandler(req, res);
  }
  return planHandler(req, res);
}
