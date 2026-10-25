// Logistics Twin - Optimization Endpoint (Single Truck & Fleet-Wide Combinatorial Assignment)
// POST /api/optimize (single truck or fleet)
// POST /api/optimize-fleet (rewritten to /api/optimize?mode=fleet)
// Validates payload with zod, executes pure matching engine, returns ranked candidate backhauls or Hungarian assignments.

import { z } from 'zod';
import { setCorsHeaders, jsonResponse, errorResponse, parseBody, checkRateLimit } from './_utils.js';
import { evaluateShipments, optimizeFleet } from '../src/engine/index.js';

const SingleOptimizeSchema = z.object({
  truck: z.object({
    id: z.string(),
  }).passthrough(),
  shipments: z.array(
    z.object({
      id: z.string(),
    }).passthrough()
  ).min(1, 'At least one candidate shipment is required'),
  settings: z.object({}).passthrough().optional(),
});

const OptimizeFleetSchema = z.object({
  trucks: z.array(
    z.object({
      id: z.string(),
    }).passthrough()
  ).min(1, 'At least one truck is required'),
  shipments: z.array(
    z.object({
      id: z.string(),
    }).passthrough()
  ).min(1, 'At least one shipment is required'),
  settings: z.object({}).passthrough().optional(),
});

export async function singleOptimizeHandler(req, res) {
  const body = parseBody(req);
  const parseResult = SingleOptimizeSchema.safeParse(body);

  if (!parseResult.success) {
    return errorResponse(res, 400, 'Invalid request payload', parseResult.error.format());
  }

  try {
    const { truck, shipments, settings } = parseResult.data;
    const evaluated = evaluateShipments(truck, shipments, settings || {});

    return jsonResponse(res, 200, {
      success: true,
      solver: 'Weighted Multi-Criteria Scoring',
      truckId: truck.id,
      evaluatedCount: evaluated.length,
      feasibleCount: evaluated.filter((e) => e.isFeasible).length,
      recommendedId: evaluated.metadata?.recommendedId || null,
      latencyMs: evaluated.metadata?.latencyMs || 0,
      results: evaluated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('API optimize error:', err);
    return errorResponse(res, 500, `Optimization failed: ${err.message}`);
  }
}

export async function optimizeFleetHandler(req, res) {
  const body = parseBody(req);
  const parseResult = OptimizeFleetSchema.safeParse(body);

  if (!parseResult.success) {
    return errorResponse(res, 400, 'Invalid request payload', parseResult.error.format());
  }

  try {
    const { trucks, shipments, settings } = parseResult.data;
    const result = optimizeFleet(trucks, shipments, settings || {});

    return jsonResponse(res, 200, {
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('API optimize-fleet error:', err);
    return errorResponse(res, 500, `Fleet optimization failed: ${err.message}`);
  }
}

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed. Use POST.');
  }

  const rateCheck = checkRateLimit(req);
  if (!rateCheck.allowed) {
    return errorResponse(res, 429, 'Rate limit exceeded.');
  }

  const body = parseBody(req);
  const isFleet = req.query?.mode === 'fleet' || (body && Array.isArray(body.trucks));

  if (isFleet) {
    return optimizeFleetHandler(req, res);
  }

  return singleOptimizeHandler(req, res);
}
