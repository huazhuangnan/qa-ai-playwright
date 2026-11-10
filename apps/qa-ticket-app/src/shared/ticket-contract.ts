import { z } from 'zod';

/** Supported ticket workflow states. */
export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;

/** Supported ticket priorities. */
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

/** Supported application roles. */
export const USER_ROLES = ['admin', 'member'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type UserRole = (typeof USER_ROLES)[number];

/** Human-readable labels used by the React UI. */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

const transitions: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: ['open'],
};

/**
 * Checks whether a workflow transition is valid.
 *
 * Keeping the same status is allowed so edits that resend the current value do
 * not fail during unrelated updates.
 */
export function canTransition(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return from === to || transitions[from].includes(to);
}

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(40),
  password: z.string().min(1, '请输入密码').max(120),
});

export const ticketCreateSchema = z.object({
  title: z.string().trim().min(2, '标题至少 2 个字符').max(80),
  description: z.string().trim().max(2000).default(''),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const ticketUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigneeId: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assigneeId !== undefined,
    { message: '至少提供一个更新字段' },
  );

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1, '评论不能为空').max(1000),
});

export const ticketQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export interface SessionUser {
  id: number;
  username: string;
  role: UserRole;
}

export interface TicketListItem {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: number | null;
  assigneeName: string | null;
  createdById: number;
  createdByName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends TicketListItem {
  comments: CommentItem[];
  audit: AuditItem[];
}

export interface CommentItem {
  id: number;
  body: string;
  authorId: number;
  authorName: string;
  createdAt: string;
}

export interface AuditItem {
  id: number;
  action: string;
  actorName: string;
  metadata: string;
  createdAt: string;
}

export interface TicketListResponse {
  items: TicketListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type CreateTicketInput = z.input<typeof ticketCreateSchema>;
export type UpdateTicketInput = z.input<typeof ticketUpdateSchema>;
export type TicketQuery = z.input<typeof ticketQuerySchema>;
