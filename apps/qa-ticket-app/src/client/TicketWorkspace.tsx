import { useEffect, useState } from 'react';
import {
  CircleAlertIcon,
  FilterXIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  TicketIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api } from '@/client/api';
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/client/components/ui/empty';
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/client/components/ui/field';
import { Input } from '@/client/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select';
import { Separator } from '@/client/components/ui/separator';
import { Skeleton } from '@/client/components/ui/skeleton';
import { TicketCreateDialog } from '@/client/TicketCreateDialog';
import { TicketDetailDialog } from '@/client/TicketDetailDialog';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type SessionUser,
  type TicketListItem,
  type TicketListResponse,
  type TicketPriority,
  type TicketStatus,
} from '@/shared/ticket-contract';

interface TicketWorkspaceProps {
  user: SessionUser;
  onLogout: () => void;
}

interface UserOption {
  id: number;
  username: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusVariant(status: TicketStatus) {
  if (status === 'in_progress') {
    return 'default' as const;
  }
  if (status === 'closed') {
    return 'ghost' as const;
  }
  return 'secondary' as const;
}

function priorityVariant(priority: TicketPriority) {
  if (priority === 'urgent') {
    return 'destructive' as const;
  }
  if (priority === 'high') {
    return 'default' as const;
  }
  return 'outline' as const;
}

function TicketCard({
  ticket,
  onOpen,
}: {
  ticket: TicketListItem;
  onOpen: () => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(ticket.status)}>
            {TICKET_STATUS_LABELS[ticket.status]}
          </Badge>
          <Badge variant={priorityVariant(ticket.priority)}>
            {TICKET_PRIORITY_LABELS[ticket.priority]}
          </Badge>
          <span className="text-xs text-muted-foreground">#{ticket.id}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>
              <h2 className="truncate text-base">{ticket.title}</h2>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {ticket.description || '暂无描述'}
            </CardDescription>
          </div>
          <Button
            aria-label={`查看 ${ticket.title}`}
            variant="outline"
            size="sm"
            onClick={onOpen}
          >
            查看
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>负责人：{ticket.assigneeName ?? '未分配'}</span>
        <span>创建人：{ticket.createdByName}</span>
        <span>更新：{formatDate(ticket.updatedAt)}</span>
      </CardContent>
    </Card>
  );
}

function LoadingList() {
  return (
    <div className="flex flex-col gap-3" aria-label="加载工单列表">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-xl border p-5">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Displays the signed-in ticket list and its primary workflows. */
export function TicketWorkspace({ user, onLogout }: TicketWorkspaceProps) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | TicketStatus>('all');
  const [priority, setPriority] = useState<'all' | TicketPriority>('all');
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<TicketListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    api
      .users()
      .then((payload) => setUsers(payload.items))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const next = await api.tickets({
          q: q.trim(),
          status: status === 'all' ? undefined : status,
          priority: priority === 'all' ? undefined : priority,
          page,
          pageSize: 8,
        });
        if (!controller.signal.aborted) {
          setResponse(next);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : '加载工单列表失败',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, q ? 250 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q, status, priority, page, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);
  const clearFilters = () => {
    setQ('');
    setStatus('all');
    setPriority('all');
    setPage(1);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      toast.error('退出请求未完成，本地会话已清除');
    } finally {
      onLogout();
    }
  };

  const openTicket = (id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const totalPages = response
    ? Math.max(1, Math.ceil(response.total / response.pageSize))
    : 1;
  const urgentVisible =
    response?.items.filter((ticket) => ticket.priority === 'urgent').length ??
    0;
  const mineVisible =
    response?.items.filter((ticket) => ticket.createdById === user.id).length ??
    0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <TicketIcon />
            </div>
            <div>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                QA Ticket
              </p>
              <p className="font-semibold">工单工作台</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.username}</p>
              <p className="text-xs text-muted-foreground">
                {user.role === 'admin' ? '管理员' : '普通成员'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOutIcon data-icon="inline-start" />
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">当前视图</CardTitle>
              <CardDescription>筛选条件只影响工单列表。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">匹配工单</span>
                <span className="font-semibold">{response?.total ?? 0}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">当前页紧急</span>
                <span className="font-semibold">{urgentVisible}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">当前页我创建</span>
                <span className="font-semibold">{mineVisible}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">验证范围</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <span>角色权限</span>
              <span>状态流转</span>
              <span>评论与审计</span>
              <span>查询与分页</span>
            </CardContent>
          </Card>
        </aside>

        <section className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                工单工作台
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                搜索、筛选并把工单推进到可验收状态。
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              新建工单
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4">
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => event.preventDefault()}
              >
                <FieldGroup className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-end">
                  <Field>
                    <FieldLabel htmlFor="ticket-search">搜索工单</FieldLabel>
                    <div className="flex items-center gap-2">
                      <SearchIcon className="text-muted-foreground" />
                      <Input
                        id="ticket-search"
                        value={q}
                        placeholder="搜索标题或描述"
                        onChange={(event) => {
                          setPage(1);
                          setQ(event.target.value);
                        }}
                      />
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="status-filter">状态</FieldLabel>
                    <Select
                      value={status}
                      onValueChange={(value) => {
                        setPage(1);
                        setStatus(value as 'all' | TicketStatus);
                      }}
                    >
                      <SelectTrigger id="status-filter" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">全部状态</SelectItem>
                          {TICKET_STATUSES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {TICKET_STATUS_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="priority-filter">优先级</FieldLabel>
                    <Select
                      value={priority}
                      onValueChange={(value) => {
                        setPage(1);
                        setPriority(value as 'all' | TicketPriority);
                      }}
                    >
                      <SelectTrigger id="priority-filter" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">全部优先级</SelectItem>
                          {TICKET_PRIORITIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {TICKET_PRIORITY_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    <FilterXIcon data-icon="inline-start" />
                    清除筛选
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          {loading ? (
            <LoadingList />
          ) : error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>工单列表加载失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
              <Button
                className="mt-2 self-start"
                size="sm"
                variant="outline"
                onClick={refresh}
              >
                重试
              </Button>
            </Alert>
          ) : response?.items.length ? (
            <div className="flex flex-col gap-3">
              {response.items.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onOpen={() => openTicket(ticket.id)}
                />
              ))}
            </div>
          ) : (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TicketIcon />
                </EmptyMedia>
                <EmptyTitle>没有匹配的工单</EmptyTitle>
                <EmptyDescription>
                  调整筛选条件，或创建一条新的测试工单。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={clearFilters}>
                  清除筛选
                </Button>
              </EmptyContent>
            </Empty>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              第 {response?.page ?? page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </section>
      </main>

      <TicketCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setPage(1);
          refresh();
          toast.success('工单已创建');
        }}
      />
      <TicketDetailDialog
        ticketId={selectedId}
        open={detailOpen}
        user={user}
        users={users}
        onOpenChange={setDetailOpen}
        onChanged={refresh}
      />
    </div>
  );
}
