import { eq } from 'drizzle-orm';

import type { TicketPriority, TicketStatus } from '../shared/ticket-contract.ts';
import { hashPassword, verifyPassword } from './auth/password.ts';
import type { DatabaseContext } from './db/client.ts';
import {
  auditLogs,
  comments,
  tickets,
  users,
} from './db/schema.ts';

export interface SeedSummary {
  createdTickets: number;
  users: {
    admin: number;
    alice: number;
    bob: number;
  };
}

const demoUsers = [
  { username: 'admin', role: 'admin' as const },
  { username: 'alice', role: 'member' as const },
  { username: 'bob', role: 'member' as const },
] as const;

const statuses: TicketStatus[] = [
  ...Array<TicketStatus>(10).fill('open'),
  ...Array<TicketStatus>(8).fill('in_progress'),
  ...Array<TicketStatus>(6).fill('resolved'),
  ...Array<TicketStatus>(6).fill('closed'),
];

const priorities: TicketPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
];

/**
 * Seeds deterministic demo accounts and representative ticket data.
 *
 * Existing users are preserved. Tickets are created only when the database has
 * no ticket rows, which keeps repeated developer runs idempotent.
 */
export function seedDatabase(database: DatabaseContext): SeedSummary {
  const { db, sqlite } = database;
  const now = new Date();

  for (const account of demoUsers) {
    const existing = db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.username, account.username))
      .get();
    if (!existing) {
      db.insert(users)
        .values({
          username: account.username,
          passwordHash: hashPassword('demo1234'),
          role: account.role,
          createdAt: now,
        })
        .run();
    } else if (!verifyPassword('demo1234', existing.passwordHash)) {
      db.update(users)
        .set({ passwordHash: hashPassword('demo1234') })
        .where(eq(users.id, existing.id))
        .run();
    }
  }

  const accountRows = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .all();
  const userIds = new Map(accountRows.map((row) => [row.username, row.id]));
  const admin = userIds.get('admin');
  const alice = userIds.get('alice');
  const bob = userIds.get('bob');
  if (!admin || !alice || !bob) {
    throw new Error('Demo users were not created');
  }

  const ticketCount =
    db.select({ id: tickets.id }).from(tickets).limit(1).get() !== undefined;
  if (ticketCount) {
    return {
      createdTickets: 0,
      users: { admin, alice, bob },
    };
  }

  const creators = [alice, bob, alice, bob, admin];
  const assignees = [alice, bob, null];
  let createdTickets = 0;

  sqlite.transaction(() => {
    statuses.forEach((status, index) => {
      const createdAt = new Date(now.getTime() - index * 3_600_000);
      const updatedAt = new Date(createdAt.getTime() + index * 60_000);
      const title = `示例工单 ${String(index + 1).padStart(2, '0')} · ${
        status === 'open'
          ? '待分诊'
          : status === 'in_progress'
            ? '处理中'
            : status === 'resolved'
              ? '待验证'
              : '已闭环'
      }`;
      const description =
        index % 5 === 0
          ? '用户反馈页面保存后没有及时刷新，需要检查查询缓存。'
          : `用于验证筛选、分页和角色权限的示例数据。批次 ${index + 1}。`;
      const result = db
        .insert(tickets)
        .values({
          title,
          description,
          status,
          priority: priorities[index % priorities.length] ?? 'medium',
          assigneeId: assignees[index % assignees.length] ?? null,
          createdById: creators[index % creators.length] ?? alice,
          version: 1,
          createdAt,
          updatedAt,
        })
        .run();
      const ticketId = Number(result.lastInsertRowid);
      createdTickets += 1;

      db.insert(auditLogs)
        .values({
          ticketId,
          actorId: creators[index % creators.length] ?? alice,
          action: 'ticket.created',
          metadata: JSON.stringify({ source: 'seed' }),
          createdAt,
        })
        .run();

      if (index % 4 === 0) {
        db.insert(comments)
          .values({
            ticketId,
            authorId: index % 8 === 0 ? admin : alice,
            body: '已收到，正在补充复现信息。',
            createdAt: new Date(createdAt.getTime() + 30_000),
          })
          .run();
      }
    });
  })();

  return {
    createdTickets,
    users: { admin, alice, bob },
  };
}
