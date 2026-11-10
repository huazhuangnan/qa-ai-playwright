import { serveStatic } from '@hono/node-server/serve-static';
import {
  and,
  count,
  desc,
  eq,
  like,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ZodError } from 'zod';

import {
  canTransition,
  commentCreateSchema,
  loginSchema,
  ticketCreateSchema,
  ticketQuerySchema,
  ticketUpdateSchema,
  type AuditItem,
  type CommentItem,
  type SessionUser,
  type TicketDetail,
  type TicketListItem,
} from '../shared/ticket-contract.ts';
import { verifyPassword } from './auth/password.ts';
import { apiDocsHtml } from './api-docs.ts';
import openapi from './openapi.json' with { type: 'json' };
import {
  hashSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  storeSession,
} from './auth/session.ts';
import type { AppDatabase, DatabaseContext } from './db/client.ts';
import {
  auditLogs,
  comments,
  sessions,
  tickets,
  users,
} from './db/schema.ts';

interface AppVariables {
  database: DatabaseContext;
  user: SessionUser;
  sessionTokenHash: string;
}

type AppEnv = { Variables: AppVariables };

export interface CreateAppOptions {
  database: DatabaseContext;
  staticRoot?: string;
}

function errorResponse(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  status: 400 | 401 | 403 | 404 | 409 | 500,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}

function validationMessage(error: ZodError): string {
  return error.issues[0]?.message ?? '请求参数无效';
}

function toSessionUser(row: {
  id: number;
  username: string;
  role: SessionUser['role'];
}): SessionUser {
  return { id: row.id, username: row.username, role: row.role };
}

function toTicketListItem(row: {
  id: number;
  title: string;
  description: string;
  status: TicketListItem['status'];
  priority: TicketListItem['priority'];
  assigneeId: number | null;
  assigneeName: string | null;
  createdById: number;
  createdByName: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): TicketListItem {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ticketSelect(db: AppDatabase) {
  const assignee = alias(users, 'assignee');
  const creator = alias(users, 'creator');
  return db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      priority: tickets.priority,
      assigneeId: tickets.assigneeId,
      assigneeName: assignee.username,
      createdById: tickets.createdById,
      createdByName: creator.username,
      version: tickets.version,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .innerJoin(creator, eq(creator.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId));
}

function getTicketDetail(
  db: AppDatabase,
  ticketId: number,
): TicketDetail | null {
  const row = ticketSelect(db).where(eq(tickets.id, ticketId)).get();
  if (!row) {
    return null;
  }

  const commentRows = db
    .select({
      id: comments.id,
      body: comments.body,
      authorId: comments.authorId,
      authorName: users.username,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.ticketId, ticketId))
    .orderBy(comments.createdAt, comments.id)
    .all();

  const auditRows = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: users.username,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorId))
    .where(eq(auditLogs.ticketId, ticketId))
    .orderBy(auditLogs.createdAt, auditLogs.id)
    .all();

  return {
    ...toTicketListItem(row),
    comments: commentRows.map(
      (comment): CommentItem => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      }),
    ),
    audit: auditRows.map(
      (entry): AuditItem => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      }),
    ),
  };
}

function recordAudit(
  db: AppDatabase,
  ticketId: number,
  actorId: number,
  action: string,
  metadata: Record<string, unknown> = {},
): void {
  db.insert(auditLogs)
    .values({
      ticketId,
      actorId,
      action,
      metadata: JSON.stringify(metadata),
      createdAt: new Date(),
    })
    .run();
}

function userExists(db: AppDatabase, userId: number): boolean {
  return Boolean(
    db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get(),
  );
}

function canManageTicket(
  user: SessionUser,
  createdById: number,
): boolean {
  return user.role === 'admin' || user.id === createdById;
}

/**
 * Builds the Hono app with explicit database ownership so tests can isolate
 * every suite and close SQLite afterward.
 */
export function createApp(options: CreateAppOptions): Hono<AppEnv> {
  const { database, staticRoot } = options;
  const { db } = database;
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('database', database);
    await next();
  });

  const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
      return errorResponse(c, 401, 'UNAUTHORIZED', '请先登录');
    }

    const tokenHash = hashSessionToken(token);
    const row = db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, tokenHash))
      .get();

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) {
        db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
      }
      deleteCookie(c, SESSION_COOKIE, sessionCookieOptions());
      return errorResponse(c, 401, 'UNAUTHORIZED', '会话已失效');
    }

    c.set('user', toSessionUser(row));
    c.set('sessionTokenHash', tokenHash);
    await next();
  };

  app.get('/openapi.json', (c) => c.json(openapi));
  app.get('/api-docs', (c) => c.html(apiDocsHtml));
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.post('/api/auth/login', async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        'VALIDATION_ERROR',
        validationMessage(parsed.error),
      );
    }

    const account = db
      .select()
      .from(users)
      .where(eq(users.username, parsed.data.username))
      .get();
    if (
      !account ||
      !verifyPassword(parsed.data.password, account.passwordHash)
    ) {
      return errorResponse(c, 401, 'INVALID_CREDENTIALS', '用户名或密码错误');
    }

    const session = storeSession(db, account.id);
    setCookie(
      c,
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    return c.json({ user: toSessionUser(account) });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      db.delete(sessions)
        .where(eq(sessions.tokenHash, hashSessionToken(token)))
        .run();
    }
    deleteCookie(c, SESSION_COOKIE, sessionCookieOptions());
    return c.body(null, 204);
  });

  app.get('/api/auth/me', requireAuth, (c) =>
    c.json({ user: c.var.user }),
  );

  app.get('/api/users', requireAuth, (c) => {
    const items = db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
      })
      .from(users)
      .orderBy(users.username)
      .all()
      .map(toSessionUser);
    return c.json({ items });
  });

  app.get('/api/tickets', requireAuth, (c) => {
    const parsed = ticketQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        'VALIDATION_ERROR',
        validationMessage(parsed.error),
      );
    }

    const { q, status, priority, page, pageSize } = parsed.data;
    const conditions = [];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          like(tickets.title, pattern),
          like(tickets.description, pattern),
        ),
      );
    }
    if (status) {
      conditions.push(eq(tickets.status, status));
    }
    if (priority) {
      conditions.push(eq(tickets.priority, priority));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = ticketSelect(db)
      .where(where)
      .orderBy(desc(tickets.updatedAt), desc(tickets.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const total =
      db.select({ value: count() }).from(tickets).where(where).get()?.value ??
      0;

    return c.json({
      items: rows.map(toTicketListItem),
      page,
      pageSize,
      total,
    });
  });

  app.post('/api/tickets', requireAuth, async (c) => {
    const parsed = ticketCreateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        'VALIDATION_ERROR',
        validationMessage(parsed.error),
      );
    }

    const user = c.var.user;
    const input = parsed.data;
    if (user.role !== 'admin' && input.assigneeId !== undefined) {
      return errorResponse(c, 403, 'FORBIDDEN', '只有管理员可以分配负责人');
    }
    if (
      input.assigneeId !== undefined &&
      input.assigneeId !== null &&
      !userExists(db, input.assigneeId)
    ) {
      return errorResponse(c, 400, 'INVALID_ASSIGNEE', '负责人不存在');
    }

    const now = new Date();
    const result = db
      .insert(tickets)
      .values({
        title: input.title,
        description: input.description,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        createdById: user.id,
        status: 'open',
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const ticketId = Number(result.lastInsertRowid);
    recordAudit(db, ticketId, user.id, 'ticket.created', {
      title: input.title,
    });
    return c.json(getTicketDetail(db, ticketId), 201);
  });

  app.get('/api/tickets/:id', requireAuth, (c) => {
    const ticketId = Number(c.req.param('id'));
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
    }
    const detail = getTicketDetail(db, ticketId);
    return detail
      ? c.json(detail)
      : errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
  });

  app.patch('/api/tickets/:id', requireAuth, async (c) => {
    const ticketId = Number(c.req.param('id'));
    const current = db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();
    if (!current) {
      return errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
    }

    const user = c.var.user;
    if (!canManageTicket(user, current.createdById)) {
      return errorResponse(c, 403, 'FORBIDDEN', '不能修改他人的工单');
    }

    const parsed = ticketUpdateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        'VALIDATION_ERROR',
        validationMessage(parsed.error),
      );
    }

    const input = parsed.data;
    if (
      user.role !== 'admin' &&
      Object.prototype.hasOwnProperty.call(input, 'assigneeId')
    ) {
      return errorResponse(c, 403, 'FORBIDDEN', '只有管理员可以分配负责人');
    }
    if (
      input.assigneeId !== undefined &&
      input.assigneeId !== null &&
      !userExists(db, input.assigneeId)
    ) {
      return errorResponse(c, 400, 'INVALID_ASSIGNEE', '负责人不存在');
    }
    if (
      input.status !== undefined &&
      !canTransition(current.status, input.status)
    ) {
      return errorResponse(
        c,
        409,
        'INVALID_TRANSITION',
        '不允许的状态流转',
      );
    }
    if (input.version !== current.version) {
      return errorResponse(c, 409, 'VERSION_CONFLICT', '工单已被其他人更新');
    }

    const now = new Date();
    const result = db
      .update(tickets)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined
          ? { assigneeId: input.assigneeId }
          : {}),
        updatedAt: now,
        version: sql`${tickets.version} + 1`,
      })
      .where(
        and(eq(tickets.id, ticketId), eq(tickets.version, input.version)),
      )
      .run();

    if (result.changes === 0) {
      return errorResponse(c, 409, 'VERSION_CONFLICT', '工单已被其他人更新');
    }

    recordAudit(db, ticketId, user.id, 'ticket.updated', {
      fields: Object.keys(input).filter((key) => key !== 'version'),
      fromStatus: current.status,
      toStatus: input.status ?? current.status,
    });
    return c.json(getTicketDetail(db, ticketId));
  });

  app.delete('/api/tickets/:id', requireAuth, (c) => {
    const ticketId = Number(c.req.param('id'));
    const current = db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();
    if (!current) {
      return errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
    }
    if (!canManageTicket(c.var.user, current.createdById)) {
      return errorResponse(c, 403, 'FORBIDDEN', '不能删除他人的工单');
    }

    recordAudit(db, ticketId, c.var.user.id, 'ticket.deleted');
    db.delete(tickets).where(eq(tickets.id, ticketId)).run();
    return c.body(null, 204);
  });

  app.get('/api/tickets/:id/comments', requireAuth, (c) => {
    const ticketId = Number(c.req.param('id'));
    if (!getTicketDetail(db, ticketId)) {
      return errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
    }
    const items = db
      .select({
        id: comments.id,
        body: comments.body,
        authorId: comments.authorId,
        authorName: users.username,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.ticketId, ticketId))
      .orderBy(comments.createdAt, comments.id)
      .all()
      .map(
        (comment): CommentItem => ({
          ...comment,
          createdAt: comment.createdAt.toISOString(),
        }),
      );
    return c.json({ items });
  });

  app.post('/api/tickets/:id/comments', requireAuth, async (c) => {
    const ticketId = Number(c.req.param('id'));
    const ticket = db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();
    if (!ticket) {
      return errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
    }

    const parsed = commentCreateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return errorResponse(
        c,
        400,
        'VALIDATION_ERROR',
        validationMessage(parsed.error),
      );
    }

    const now = new Date();
    const result = db
      .insert(comments)
      .values({
        ticketId,
        authorId: c.var.user.id,
        body: parsed.data.body,
        createdAt: now,
      })
      .run();
    recordAudit(db, ticketId, c.var.user.id, 'comment.created');
    return c.json(
      {
        id: Number(result.lastInsertRowid),
        body: parsed.data.body,
        authorId: c.var.user.id,
        authorName: c.var.user.username,
        createdAt: now.toISOString(),
      } satisfies CommentItem,
      201,
    );
  });

  app.get('/api/tickets/:id/audit', requireAuth, (c) => {
    const ticketId = Number(c.req.param('id'));
    if (!getTicketDetail(db, ticketId)) {
      return errorResponse(c, 404, 'NOT_FOUND', '工单不存在');
    }
    const items = db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: users.username,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.actorId))
      .where(eq(auditLogs.ticketId, ticketId))
      .orderBy(auditLogs.createdAt, auditLogs.id)
      .all()
      .map(
        (entry): AuditItem => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        }),
      );
    return c.json({ items });
  });

  if (staticRoot) {
    app.use('*', serveStatic({ root: staticRoot }));
    app.get('*', serveStatic({ root: staticRoot, path: 'index.html' }));
  }

  app.notFound((c) =>
    errorResponse(c, 404, 'NOT_FOUND', '请求的资源不存在'),
  );
  app.onError((error, c) => {
    console.error(error);
    return errorResponse(c, 500, 'INTERNAL_ERROR', '服务暂时不可用');
  });

  return app;
}
