/**
 * api.ts — Frontend data layer for Express+MySQL API
 *
 * All database operations go through the Express API server (port 3010,
 * proxied by Vite via /api → localhost:3010). JWT tokens stored in
 * localStorage are auto-attached to every request.
 *
 * Returns { data, error } to match the db JS client pattern,
 * minimizing changes in call sites across ~44 frontend files.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// ── Token management ────────────────────────────────────────────────────
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Core fetch wrapper ───────────────────────────────────────────────────
async function request<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any,
  isFormData?: boolean
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let bodyContent: BodyInit | undefined;
  if (isFormData && body instanceof FormData) {
    bodyContent = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyContent = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: bodyContent });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!res.ok) {
      const errorBody = isJson ? await res.json() : await res.text();
      const raw = typeof errorBody === 'string' ? errorBody : (errorBody.error || errorBody.message || `HTTP ${res.status}`);
      const message = typeof raw === 'string' ? raw : (typeof raw?.message === 'string' ? raw.message : JSON.stringify(raw));
      return { data: null, error: { message, code: String(res.status) } };
    }

    if (isJson) {
      const json = await res.json();
      return { data: json as T, error: null };
    }

    return { data: null, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error' } };
  }
}

// ── File upload ─────────────────────────────────────────────────────────
async function uploadFile(file: File): Promise<{ data: { path: string; url: string } | null; error: any }> {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE}/upload`, { method: 'POST', headers, body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      return { data: null, error: { message: err.error || 'Upload failed' } };
    }
    const json = await res.json();
    return { data: json, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message } };
  }
}

async function deleteUpload(path: string): Promise<{ data: null; error: any }> {
  return request('DELETE', '/upload', { path });
}

function getUploadUrl(filePath: string): string {
  return filePath.startsWith('/') ? filePath : `/uploads/site-assets/${filePath}`;
}

// ── Auth ────────────────────────────────────────────────────────────────
type AuthChangeHandler = (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED', user: any) => void;

let authListeners: AuthChangeHandler[] = [];

function notifyAuthListeners(event: 'SIGNED_IN' | 'SIGNED_OUT', user?: any) {
  authListeners.forEach(cb => cb(event, user));
}

const api = {
  // ── Basic CRUD ───────────────────────────────────────────────────────
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),

  // ── Uploads ────────────────────────────────────────────────────────
  upload: uploadFile,
  deleteUpload,
  getUploadUrl,

  // ── Edge function invoke ──────────────────────────────────────────
  invoke: async <T = any>(funcName: string, options?: { body?: any }): Promise<{ data: T | null; error: any }> => {
    return request<T>('POST', `/${funcName}`, options?.body);
  },

  // ── Auth ───────────────────────────────────────────────────────────
  auth: {
    signInWithTelegram: async (userData: any) => {
      const result = await request('POST', '/auth/telegram', userData);
      if (result.data?.session?.access_token) {
        setToken(result.data.session.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(result.data.user));
        notifyAuthListeners('SIGNED_IN', result.data.user);
      }
      return result;
    },

    signInWithTelegramOidc: async (payload: { id_token: string }) => {
      const result = await request('POST', '/auth/telegram-oidc', payload);
      if (result.data?.session?.access_token) {
        setToken(result.data.session.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(result.data.user));
        notifyAuthListeners('SIGNED_IN', result.data.user);
      }
      return result;
    },

    signIn: async (email: string, password: string) => {
      const result = await request('POST', '/auth/signin', { email, password });
      if (result.data?.session?.access_token) {
        setToken(result.data.session.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(result.data.user));
        notifyAuthListeners('SIGNED_IN', result.data.user);
      }
      return result;
    },

    signOut: async () => {
      await request('POST', '/auth/signout');
      clearToken();
      notifyAuthListeners('SIGNED_OUT', null);
    },

    getSession: async () => {
      const token = getToken();
      if (!token) return { data: { session: null, user: null }, error: null };

      const result = await request('GET', '/auth/session');
      if (result.error) {
        // Token expired/invalid — clear it
        if (result.error.code === '401') {
          clearToken();
          return { data: { session: null, user: null }, error: null };
        }
        return { data: { session: null, user: null }, error: result.error };
      }
      const user = result.data?.user || (result.data ? {
        id: (result.data as any).user_id || (result.data as any).id,
        email: (result.data as any).email,
        display_name: (result.data as any).display_name,
      } : null) || JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      return {
        data: {
          session: { access_token: token, user },
          user,
        },
        error: null,
      };
    },

    onAuthStateChange: (callback: AuthChangeHandler) => {
      authListeners.push(callback);
      // Return a subscription-like object with unsubscribe()
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners = authListeners.filter(cb => cb !== callback);
            },
          },
        },
        error: null,
      };
    },

    // Compatibility: get user from stored data
    getUser: () => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
  },

  // ── Realtime (replaced with polling) ────────────────────────────────
  channel: (name: string) => {
    const listeners: { event: string; filter: any; callback: (payload: any) => void }[] = [];
    const knownOrders = new Map<string, { status: string; updated_at?: string; data: any }>();
    let isFirstPoll = true;

    const channelObj = {
      on: (event: string, filter: any, callback: (payload: any) => void) => {
        listeners.push({ event, filter, callback });
        return channelObj;
      },
      subscribe: (statusCallback?: (status: string) => void) => {
        let subscribed = false;
        // Poll every 5 seconds
        const interval = setInterval(async () => {
          try {
            // Check if any listener targets a specific order ID
            let singleOrderId: string | null = null;
            let isPreorder = false;
            for (const l of listeners) {
              if (l.filter?.table === 'preorder_orders') isPreorder = true;
              if (l.filter?.filter) {
                const match = String(l.filter.filter).match(/id=eq\.(.+)/);
                if (match) {
                  singleOrderId = match[1];
                }
              }
            }

            const path = singleOrderId 
              ? (isPreorder ? `/preorders/orders/${singleOrderId}` : `/orders/${singleOrderId}`)
              : (isPreorder ? '/preorders/orders' : '/orders');

            const { data, error } = await request('GET', path);
            if (!error && data) {
              const rows = Array.isArray(data) ? data : [data];
              
              if (!subscribed) {
                statusCallback?.('SUBSCRIBED');
                subscribed = true;
              }

              if (isFirstPoll) {
                // Initialize known orders on first poll
                for (const row of rows) {
                  if (row && row.id) {
                    knownOrders.set(row.id, { status: row.status, updated_at: row.updated_at, data: row });
                  }
                }
                isFirstPoll = false;
                return;
              }

              // Compare
              for (const row of rows) {
                if (!row || !row.id) continue;
                const known = knownOrders.get(row.id);
                if (!known) {
                  // New order (INSERT)
                  knownOrders.set(row.id, { status: row.status, updated_at: row.updated_at, data: row });
                  for (const listener of listeners) {
                    const lEvent = listener.filter?.event;
                    if (lEvent === 'INSERT' || lEvent === '*' || !lEvent) {
                      listener.callback({ eventType: 'INSERT', new: row });
                    }
                  }
                } else if (known.status !== row.status || known.updated_at !== row.updated_at) {
                  // Updated order (UPDATE)
                  const oldData = known.data;
                  knownOrders.set(row.id, { status: row.status, updated_at: row.updated_at, data: row });
                  for (const listener of listeners) {
                    const lEvent = listener.filter?.event;
                    if (lEvent === 'UPDATE' || lEvent === '*' || !lEvent) {
                      listener.callback({ eventType: 'UPDATE', new: row, old: oldData });
                    }
                  }
                }
              }
              statusCallback?.('SUBSCRIBED');
            }
          } catch (e) {
            console.error('Realtime poll mock error:', e);
          }
        }, 5000);

        return {
          unsubscribe: () => clearInterval(interval),
        };
      },
    };
    return channelObj;
  },
  removeChannel: () => {},

  // ── Storage compatibility (redirects to upload) ─────────────────────
  storage: {
    from: (_bucket: string) => ({
      upload: async (filePath: string, file: File) => {
        const result = await uploadFile(file);
        if (result.error) return { error: result.error, data: null };
        return { error: null, data: { path: result.data?.path || filePath } };
      },
      getPublicUrl: (filePath: string) => {
        return { data: { publicUrl: getUploadUrl(filePath) } };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) {
          await deleteUpload(p);
        }
        return { error: null };
      },
    }),
  },
};

// ── Subscribe pattern (for admin realtime widget) ─────────────────────
api.subscribe = api.channel;
api.removeChannel = (name?: string) => {};

export default api;