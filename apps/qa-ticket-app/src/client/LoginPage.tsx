import { useState, type FormEvent } from 'react';
import { CircleAlertIcon, LoaderCircleIcon, LogInIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert';
import { Button } from '@/client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card';
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/client/components/ui/field';
import { Input } from '@/client/components/ui/input';
import { api, ApiError } from '@/client/api';
import type { SessionUser } from '@/shared/ticket-contract';

interface LoginPageProps {
  onLogin: (user: SessionUser) => void;
}

/** Renders the unauthenticated entry point for the demo. */
export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await api.login(username.trim(), password);
      onLogin(response.user);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : '登录失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--muted),transparent_45%)]" />
      <div className="relative z-10 grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="flex max-w-xl flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <LogInIcon data-icon="inline-start" />
            </div>
            <p className="text-sm font-medium tracking-[0.2em] text-muted-foreground uppercase">
              QA Ticket
            </p>
          </div>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            把真实业务链路
            <br />
            变成可验证的质量证据
          </h1>
          <p className="max-w-lg text-base leading-7 text-muted-foreground">
            示例覆盖登录、权限、状态流转、查询、评论和审计。
            Playwright 测试通过界面与 API 验证同一套业务规则。
          </p>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">角色权限</div>
            <div className="rounded-lg border bg-card p-4">并发版本</div>
            <div className="rounded-lg border bg-card p-4">完整证据</div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>登录 QA Ticket</CardTitle>
            <CardDescription>使用演示账号进入工单工作台。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={submit}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="username">用户名</FieldLabel>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
              </FieldGroup>

              {error ? (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>无法登录</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <LoaderCircleIcon data-icon="inline-start" />
                ) : (
                  <LogInIcon data-icon="inline-start" />
                )}
                {submitting ? '正在登录' : '登录'}
              </Button>
            </form>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              演示账号：admin / alice / bob。密码均为 demo1234。
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
