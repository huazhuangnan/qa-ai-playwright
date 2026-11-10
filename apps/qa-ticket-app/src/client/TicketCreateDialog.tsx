import { useState, type FormEvent } from 'react';
import { LoaderCircleIcon, PlusIcon } from 'lucide-react';

import { ApiError, api } from '@/client/api';
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert';
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
  FieldError,
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
import { Textarea } from '@/client/components/ui/textarea';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type TicketPriority,
} from '@/shared/ticket-contract';

interface TicketCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/** Collects the minimum data required to create a ticket. */
export function TicketCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: TicketCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [titleError, setTitleError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setTitleError('');
    setRequestError('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !submitting) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      setTitleError('标题至少 2 个字符');
      return;
    }

    setTitleError('');
    setRequestError('');
    setSubmitting(true);
    try {
      await api.createTicket({
        title: cleanTitle,
        description: description.trim(),
        priority,
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (caught) {
      setRequestError(
        caught instanceof ApiError ? caught.message : '创建工单失败',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新建工单</DialogTitle>
          <DialogDescription>
            记录问题、优先级和可观察的复现信息。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor="ticket-title">标题</FieldLabel>
              <Input
                id="ticket-title"
                value={title}
                aria-invalid={Boolean(titleError)}
                maxLength={80}
                placeholder="例如：登录后工单列表没有刷新"
                onChange={(event) => setTitle(event.target.value)}
              />
              {titleError ? <FieldError>{titleError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="ticket-description">描述</FieldLabel>
              <Textarea
                id="ticket-description"
                value={description}
                maxLength={2000}
                rows={5}
                placeholder="补充入口、操作步骤和实际结果"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ticket-priority">优先级</FieldLabel>
              <Select
                value={priority}
                onValueChange={(value) =>
                  setPriority(value as TicketPriority)
                }
              >
                <SelectTrigger id="ticket-priority" className="w-full">
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
          </FieldGroup>

          {requestError ? (
            <Alert variant="destructive">
              <AlertTitle>创建失败</AlertTitle>
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <LoaderCircleIcon data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              {submitting ? '正在创建' : '创建工单'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
