import 'server-only'

import { z } from 'zod'

import { ItemStatus } from '@/shared/model/domain'

export const PAGE_SIZE = 50

/**
 * The cursor arrives as two flat query params rather than one encoded blob:
 * it is readable in a URL, and a reviewer poking at the API with curl can see
 * exactly what pagination is keyed on.
 */
export const queueQuerySchema = z
  .object({
    status: z.enum(ItemStatus).optional(),
    cursorCreatedAt: z.string().datetime({ offset: true }).optional(),
    cursorId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  })
  // Half a cursor is a malformed request, not an empty first page — silently
  // ignoring it would quietly restart pagination from the top.
  .refine((v) => Boolean(v.cursorCreatedAt) === Boolean(v.cursorId), {
    message: 'cursorCreatedAt and cursorId must be provided together',
  })

export type QueueQuery = z.infer<typeof queueQuerySchema>
