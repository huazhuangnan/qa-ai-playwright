import type {
  CommentItem,
  SessionUser,
  TicketDetail,
  TicketListResponse,
  TicketPriority,
  TicketStatus,
} from '../shared/ticket-contract';

/** Error payload returned by the API. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface LoginResponse {
  user: SessionUser;
}

interface UserOption {
  id: number;
  username: string;
  role: 'admin' | 'member';
}

interface TicketQuery {
  q?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  page?: number;
  pageSize?: number;
}

interface CreateTicketInput {
  title: string;
  description?: string;
  priority: TicketPriority;
}

interface UpdateTicketInput {
  version: number;
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: number | null;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = payload?.error as
      | { code?: string; message?: string }
      | undefined;
    throw new ApiError(
      error?.message ?? `请求失败 (${response.status})`,
      response.status,
      error?.code ?? 'REQUEST_FAILED',
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Thin browser client for the example application API. */
export const api = {
  login(username: string, password: string) {
    return request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  me() {
    return request<LoginResponse>('/api/auth/me');
  },

  logout() {
    return request<void>('/api/auth/logout', { method: 'POST' });
  },

  users() {
    return request<{ items: UserOption[] }>('/api/users');
  },

  tickets(query: TicketQuery) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    }
    return request<TicketListResponse>(`/api/tickets?${params}`);
  },

  ticket(id: number) {
    return request<TicketDetail>(`/api/tickets/${id}`);
  },

  createTicket(input: CreateTicketInput) {
    return request<TicketDetail>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateTicket(id: number, input: UpdateTicketInput) {
    return request<TicketDetail>(`/api/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteTicket(id: number) {
    return request<void>(`/api/tickets/${id}`, { method: 'DELETE' });
  },

  addComment(id: number, body: string) {
    return request<CommentItem>(`/api/tickets/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
};
