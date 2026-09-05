import { z } from 'zod';

/**
 * Schema for creating a new video download task
 */
export const CreateVideoTaskSchema = z.object({
  url: z.string().min(1, '流地址不能为空'),
  pageTitle: z.string().optional().default('video'),
  pageUrl: z.string().optional(),
});

export type CreateVideoTaskInput = z.infer<typeof CreateVideoTaskSchema>;

/**
 * Schema for cancelling an active video download task
 */
export const CancelVideoTaskSchema = z.object({
  id: z.string().min(1, '任务 ID 不能为空'),
});

export type CancelVideoTaskInput = z.infer<typeof CancelVideoTaskSchema>;

/**
 * Schema for revealing a completed video task file in OS file explorer
 */
export const RevealVideoTaskSchema = z.object({
  id: z.string().optional(),
  filename: z.string().optional(),
  outputPath: z.string().optional(),
}).refine((data) => data.id || data.filename || data.outputPath, {
  message: 'id、filename 或 outputPath 至少提供一个',
});

export type RevealVideoTaskInput = z.infer<typeof RevealVideoTaskSchema>;

/**
 * Schema for individual bookmark items
 */
export const BookmarkItemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional().default(''),
  url: z.string().min(1, '书签 URL 不能为空'),
  description: z.string().optional().default(''),
  keywords: z.string().optional().default(''),
  folderPath: z.string().optional().default(''),
  parentTitle: z.string().optional().default(''),
  dateAdded: z.number().optional(),
  source: z.string().optional().default('bookmark_sync'),
});

/**
 * Schema for content & bookmark collection payload (supports batch or single entry)
 */
export const CollectPayloadSchema = z.union([
  // Batch payload
  z.object({
    items: z.array(BookmarkItemSchema).min(1, '书签列表不能为空'),
    count: z.number().optional(),
    type: z.string().optional(),
    createdAt: z.number().optional(),
  }),
  // Single link or article payload
  z.object({
    title: z.string().optional().default(''),
    url: z.string().min(1, 'URL 不能为空'),
    content: z.string().optional(),
    type: z.string().optional(),
    siteMeta: z.record(z.string(), z.any()).optional(),
    createdAt: z.number().optional(),
  }),
]);

export type CollectPayloadInput = z.infer<typeof CollectPayloadSchema>;
