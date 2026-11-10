import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRightIcon,
  CheckIcon,
  Clock3Icon,
  LoaderCircleIcon,
  MessageSquareIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api } from '@/client/api';
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog';
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
import { Textarea } from '@/client/components/ui/textarea';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  canTransition,
  type SessionUser,
  type TicketDetail,
  type TicketPriority,
  type TicketStatus,
} from '@/shared/ticket-contract';

interface UserOption {
  id: number;
  username: string;
}

interface TicketDetailDialogProps {
  ticketId: number | null;
  open: boolean;
  user: SessionUser;
  users: UserOption[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

/** Formats an API timestamp for the compact detail view. */
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusBadge(status: TicketStatus) {
  return TICKET_STATUS_LABELS[status];
}

/** Displays editable ticket details, comments, audit history and actions. */
export function TicketDetailDialog({
  ticketId,
  open,
  user,
  users,
  onOpenChange,
  onChanged,
}: TicketDetailDialogProps) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assigneeId, setAssigneeId] = useState('none');
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadTicket = async (id: number, signal?: AbortSignal) => {
    const next = await api.ticket(id);
    if (signal?.aborted) {
      return;
    }
    setTicket(next);
    setTitle(next.title);
    setDescription(next.description);
    setPriority(next.priority);
    setAssigneeId(next.assigneeId ? String(next.assigneeId) : 'none');
  };

  useEffect(() => {
    if (!open || !ticketId) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setEditing(false);
    api
      .ticket(ticketId)
      .then((next) => {
        if (!controller.signal.aborted) {
          setTicket(next);
          setTitle(next.title);
          setDescription(next.description);
          setPriority(next.priority);
          setAssigneeId(next.assigneeId ? String(next.assigneeId) : 'none');
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof ApiError ? caught.message : '加载工单失败',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [open, ticketId]);

  const refresh = async () => {
    if (ticketId) {
      await loadTicket(ticketId);
      onChanged();
    }
  };

  const update = async (
    values: Omit<Parameters<typeof api.updateTicket>[1], 'version'>,
  ) => {
    if (!ticket) {
      return;
    }
    try {
      const next = await api.updateTicket(ticket.id, {
        ...values,
        version: ticket.version,
      });
      setTicket(next);
      setTitle(next.title);
      setDescription(next.description);
      setPriority(next.priority);
      setAssigneeId(next.assigneeId ? String(next.assigneeId) : 'none');
      onChanged();
      toast.success('工单已更新');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : '更新工单失败';
      toast.error(message);
      if (caught instanceof ApiError && caught.status === 409) {
        await refresh();
      }
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket || title.trim().length < 2) {
      toast.error('标题至少 2 个字符');
      return;
    }
    setSaving(true);
    try {
      await update({
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(user.role === 'admin'
          ? {
              assigneeId:
                assigneeId === 'none' ? null : Number(assigneeId),
            }
          : {}),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: TicketStatus) => {
    if (!ticket) {
      return;
    }
    await update({ status });
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket || !comment.trim()) {
      return;
    }
    setCommenting(true);
    try {
      await api.addComment(ticket.id, comment.trim());
      setComment('');
      await refresh();
      toast.success('评论已添加');
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : '提交评论失败',
      );
    } finally {
      setCommenting(false);
    }
  };

  const remove = async () => {
    if (!ticket) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteTicket(ticket.id);
      toast.success('工单已删除');
      setConfirmDelete(false);
      onOpenChange(false);
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : '删除工单失败',
      );
    } finally {
      setDeleting(false);
    }
  };

  const canManage =
    Boolean(ticket) &&
    (user.role === 'admin' || ticket?.createdById === user.id);
  const nextStatuses = ticket
    ? TICKET_STATUSES.filter(
        (status) =>
          status !== ticket.status && canTransition(ticket.status, status),
      )
    : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {ticket ? ticket.title : '工单详情'}
            </DialogTitle>
            <DialogDescription>
              {ticket
                ? `#${ticket.id} · 创建人 ${ticket.createdByName}`
                : '正在读取工单信息'}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col gap-3" aria-label="加载工单详情">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>无法加载详情</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : ticket ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{statusBadge(ticket.status)}</Badge>
                <Badge variant="outline">
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  负责人：{ticket.assigneeName ?? '未分配'}
                </span>
                <span className="text-sm text-muted-foreground">
                  更新于 {formatDate(ticket.updatedAt)}
                </span>
              </div>

              {editing ? (
                <form className="flex flex-col gap-4" onSubmit={save}>
                  <FieldGroup className="gap-4">
                    <Field>
                      <FieldLabel htmlFor="detail-title">标题</FieldLabel>
                      <Input
                        id="detail-title"
                        value={title}
                        maxLength={80}
                        onChange={(event) => setTitle(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="detail-description">描述</FieldLabel>
                      <Textarea
                        id="detail-description"
                        value={description}
                        rows={5}
                        onChange={(event) =>
                          setDescription(event.target.value)
                        }
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="detail-priority">优先级</FieldLabel>
                        <Select
                          value={priority}
                          onValueChange={(value) =>
                            setPriority(value as TicketPriority)
                          }
                        >
                          <SelectTrigger
                            id="detail-priority"
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {TICKET_PRIORITIES.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {TICKET_PRIORITY_LABELS[value]}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      {user.role === 'admin' ? (
                        <Field>
                          <FieldLabel htmlFor="detail-assignee">
                            负责人
                          </FieldLabel>
                          <Select
                            value={assigneeId}
                            onValueChange={setAssigneeId}
                          >
                            <SelectTrigger
                              id="detail-assignee"
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="none">未分配</SelectItem>
                                {users.map((option) => (
                                  <SelectItem
                                    key={option.id}
                                    value={String(option.id)}
                                  >
                                    {option.username}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : null}
                    </div>
                  </FieldGroup>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => setEditing(false)}
                    >
                      取消
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <LoaderCircleIcon data-icon="inline-start" />
                      ) : (
                        <CheckIcon data-icon="inline-start" />
                      )}
                      保存修改
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {ticket.description || '暂无描述'}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setEditing(true)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        编辑工单
                      </Button>
                      {nextStatuses.map((status) => (
                        <Button
                          key={status}
                          variant="secondary"
                          onClick={() => changeStatus(status)}
                        >
                          <ArrowRightIcon data-icon="inline-end" />
                          {TICKET_STATUS_LABELS[status]}
                        </Button>
                      ))}
                      <Button
                        variant="destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        删除工单
                      </Button>
                    </div>
                  ) : null}
                </>
              )}

              <Separator />
              <section className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquareIcon />
                  评论
                </h3>
                <div className="flex flex-col gap-3">
                  {ticket.comments.length ? (
                    ticket.comments.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border bg-card p-3"
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{item.authorName}</span>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">
                          {item.body}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      暂无评论。
                    </p>
                  )}
                </div>
                <form className="flex flex-col gap-3" onSubmit={addComment}>
                  <Field>
                    <FieldLabel htmlFor="new-comment">添加评论</FieldLabel>
                    <Textarea
                      id="new-comment"
                      value={comment}
                      rows={3}
                      maxLength={1000}
                      placeholder="补充复现步骤或验证结果"
                      onChange={(event) => setComment(event.target.value)}
                    />
                  </Field>
                  <Button
                    className="self-start"
                    type="submit"
                    disabled={commenting || !comment.trim()}
                  >
                    {commenting ? (
                      <LoaderCircleIcon data-icon="inline-start" />
                    ) : (
                      <MessageSquareIcon data-icon="inline-start" />
                    )}
                    提交评论
                  </Button>
                </form>
              </section>

              <Separator />
              <section className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Clock3Icon />
                  审计记录
                </h3>
                <div className="flex flex-col gap-2">
                  {ticket.audit.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground"
                    >
                      <span>
                        {item.actorName} · {item.action}
                      </span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除工单</DialogTitle>
            <DialogDescription>
              删除后评论和审计记录也会一起移除。此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={remove}>
              {deleting ? <LoaderCircleIcon data-icon="inline-start" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
