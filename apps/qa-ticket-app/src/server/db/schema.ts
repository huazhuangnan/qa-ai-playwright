import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type {
  TicketPriority,
  TicketStatus,
  UserRole,
} from '../../shared/ticket-contract.ts';

/** Application accounts used for demo authentication and ownership checks. */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Server-side sessions. Only a hash of the browser token is persisted. */
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('sessions_user_id_idx').on(table.userId)],
);

/** Main ticket record and optimistic concurrency version. */
export const tickets = sqliteTable('tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<TicketStatus>().notNull().default('open'),
  priority: text('priority').$type<TicketPriority>().notNull().default('medium'),
  assigneeId: integer('assignee_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdById: integer('created_by_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Plain-text comments rendered by React without raw HTML. */
export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Structured ticket activity history for audit-driven tests. */
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  actorId: integer('actor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const schema = {
  users,
  sessions,
  tickets,
  comments,
  auditLogs,
};
