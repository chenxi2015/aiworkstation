import { z } from 'zod';

/**
 * Schema for creating a payment order request body
 */
export const createOrderSchema = z.object({
  planId: z.string({ required_error: 'Missing planId in request body' }).min(1, 'planId cannot be empty'),
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;

/**
 * Schema for route parameters containing orderNo
 */
export const orderNoParamSchema = z.object({
  orderNo: z.string({ required_error: 'Missing orderNo route parameter' }).min(1, 'orderNo cannot be empty'),
});

export type OrderNoParam = z.infer<typeof orderNoParamSchema>;
