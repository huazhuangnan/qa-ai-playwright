import { useEffect, useState } from 'react';

import { api } from '@/client/api';
import { LoginPage } from '@/client/LoginPage';
import { TicketWorkspace } from '@/client/TicketWorkspace';
import { Toaster } from '@/client/components/ui/sonner';
import type { SessionUser } from '@/shared/ticket-contract';

/** Restores the cookie session before choosing the application view. */
export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((payload) => setUser(payload.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {loading ? (
        <main className="grid min-h-screen place-items-center bg-background">
          <p className="text-sm text-muted-foreground">正在恢复会话…</p>
        </main>
      ) : user ? (
        <TicketWorkspace user={user} onLogout={() => setUser(null)} />
      ) : (
        <LoginPage onLogin={setUser} />
      )}
      <Toaster richColors position="top-right" />
    </>
  );
}
