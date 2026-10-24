// Logistics Twin - Zod Validation Schemas (src/data/schemas.js)
// Mirrors pure engine shapes and database CHECK constraints exactly.

import { z } from 'zod';

export const locationSchema = z.object({
  name: z.string().default('Corridor Hub'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const supplierSchema = z.object({
  id: z.string().min(1, 'Supplier ID is required'),
  name: z.string().min(1, 'Supplier name is required'),
  location: locationSchema,
  supplyLimit: z.number().min(0, 'Supply limit cannot be negative'),
  product: z.string().default('General Cargo'),
});

export const warehouseSchema = z
  .object({
    id: z.string().min(1, 'Warehouse ID is required'),
    name: z.string().min(1, 'Warehouse name is required'),
    location: locationSchema,
    stock: z.number().min(0, 'Stock cannot be negative'),
    storageLimit: z.number().min(0, 'Storage limit cannot be negative'),
  })
  .refine((data) => data.stock <= data.storageLimit, {
    message: 'Current stock cannot exceed warehouse storage limit',
    path: ['stock'],
  });

export const buyerSchema = z.object({
  id: z.string().min(1, 'Buyer ID is required'),
  name: z.string().min(1, 'Buyer name is required'),
  location: locationSchema,
  demandQty: z.number().min(0, 'Demand quantity cannot be negative'),
  deadline: z.number().positive('Delivery deadline must be greater than 0 hours'),
  priority: z.enum(['high', 'medium', 'low'], {
    errorMap: () => ({ message: "Priority must be 'high', 'medium', or 'low'" }),
  }),
});

export const routeSchema = z.object({
  id: z.string().min(1, 'Route ID is required'),
  name: z.string().optional(),
  from: z.string().min(1, 'Route requires a valid source node'),
  to: z.string().min(1, 'Route requires a valid destination node'),
  distanceKm: z.number().positive('Distance must be greater than 0 km'),
  baseTravelTimeH: z.number().positive('Base travel time must be greater than 0 hours'),
  status: z.enum(['open', 'slow', 'closed']).default('open'),
  speedFactor: z.number().min(0.1).max(2.0).default(1.0),
  restrictions: z
    .object({
      maxVehicleWeightTons: z.number().nullable().optional(),
      bannedVehicleTypes: z.array(z.string()).optional(),
    })
    .default({}),
  riskScore: z.number().min(0.0).max(1.0).default(0.0),
});

export const vehicleSchema = z.object({
  id: z.string().min(1, 'Vehicle ID is required'),
  type: z.string().min(1, 'Vehicle type is required'),
  capacity: z.number().positive('Capacity must be greater than 0 units'),
  availableFrom: z.string().min(1, 'Stationed depot (availableFrom) is required'),
  availability: z.number().min(0, 'Availability trips cannot be negative').default(1),
  costPerKm: z.number().positive('Cost per kilometer must be greater than 0'),
  weightTons: z.number().positive('Weight in tons must be greater than 0'),
  restrictions: z.record(z.any()).default({}),
});

export const networkSchema = z
  .object({
    suppliers: z.array(supplierSchema).default([]),
    warehouses: z.array(warehouseSchema).default([]),
    buyers: z.array(buyerSchema).default([]),
    routes: z.array(routeSchema).default([]),
    vehicles: z.array(vehicleSchema).default([]),
    settings: z.record(z.any()).optional(),
  })
  .refine(
    (net) => {
      const nodeIds = new Set([
        ...net.suppliers.map((s) => s.id),
        ...net.warehouses.map((w) => w.id),
        ...net.buyers.map((b) => b.id),
      ]);

      // Every route endpoint must exist in the node set
      for (const r of net.routes) {
        if (!nodeIds.has(r.from) || !nodeIds.has(r.to)) {
          return false;
        }
      }
      return true;
    },
    { message: 'All routes must connect existing suppliers, warehouses, or buyers.' }
  );

export const disruptionScenarioSchema = z.object({
  name: z.string().min(1).default('Active Disruption Scenario'),
  config: z.record(z.any()),
  isActive: z.boolean().default(false),
});

export const tripStatusUpdateSchema = z.object({
  tripId: z.string().min(1),
  status: z.enum(['planned', 'accepted', 'in_transit', 'delivered', 'failed']),
});
