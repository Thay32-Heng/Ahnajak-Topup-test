/**
 * Database client — Express+MySQL API wrapper.
 * All operations route through the MySQL-powered Express API.
 */
import api from '@/lib/api';

export const db = {
  from: (table: string) => {
    const TABLE_ENDPOINTS: Record<string, { list: string; item: (id: string) => string }> = {
      games:                   { list: '/games', item: (id) => `/games/${id}` },
      packages:                { list: '/games/packages/all', item: (id) => `/games/0/packages/${id}` },
      special_packages:        { list: '/games/special-packages/all', item: (id) => `/games/0/special-packages/${id}` },
      site_settings:           { list: '/settings', item: (id) => `/settings/${id}` },
      topup_orders:            { list: '/orders', item: (id) => `/orders/${id}` },
      preorder_orders:         { list: '/preorders/orders', item: (id) => `/preorders/orders/${id}` },
      preorder_games:          { list: '/preorders/games', item: (id) => `/preorders/games/${id}` },
      preorder_packages:       { list: '/preorders/packages', item: (id) => `/preorders/packages/${id}` },
      events:                  { list: '/events', item: (id) => `/events/${id}` },
      coupons:                 { list: '/coupons', item: (id) => `/coupons/${id}` },
      point_exchange_configs:  { list: '/points/configs/all', item: (id) => `/points/configs/${id}` },
      point_transactions:      { list: '/points/transactions', item: (id) => `/points/transactions/${id}` },
      wallet_transactions:     { list: '/wallet', item: (id) => `/wallet/${id}` },
      payment_gateways:        { list: '/payments', item: (id) => `/payments/${id}` },
      payment_gateways_public: { list: '/payments', item: (id) => `/payments/${id}` },
      payment_qr_settings:      { list: '/payments/qr-settings', item: (id) => `/payments/qr-settings/${id}` },
      api_configurations:      { list: '/admin/api-configs', item: (id) => `/admin/api-configs/${id}` },
      game_verification_configs: { list: '/admin/game-verification', item: (id) => `/admin/game-verification/${id}` },
      g2bulk_products:         { list: '/admin/g2bulk-products', item: (id) => `/admin/g2bulk-products/${id}` },
      user_roles:              { list: '/auth/session', item: (id) => `/auth/session` },
      profiles:                { list: '/auth/session', item: (id) => `/auth/session` },
      users:                   { list: '/auth/session', item: (id) => `/auth/session` },
    };

    let _filters: { col: string; val: any; op: string }[] = [];
    let _order: { col: string; ascending: boolean } | null = null;
    let _limit: number | null = null;
    let _insertData: any = null;
    let _updateData: any = null;
    let _isDelete = false;
    let _single = false;
    let _maybeSingle = false;

    const ep = TABLE_ENDPOINTS[table];

    async function execute(): Promise<{ data: any; error: any }> {
      if (_insertData) {
        if (table === 'site_settings' && _insertData.key) {
          const result = await api.put(`/settings/${_insertData.key}`, { value: _insertData.value });
          return result;
        }
        return await api.post(ep.list, _insertData);
      }

      if (_updateData) {
        const idFilter = _filters.find(f => f.col === 'id');
        if (idFilter) return await api.put(ep.item(idFilter.val), _updateData);
        return await api.put(ep.list, _updateData);
      }

      if (_isDelete) {
        const idFilter = _filters.find(f => f.col === 'id' && f.op === 'eq');
        if (idFilter) return await api.del(ep.item(idFilter.val));
        return await api.del(ep.list);
      }

      if (table === 'site_settings') {
        const result = await api.get('/settings');
        if (result.error) return result;
        const rows = Object.entries(result.data || {}).map(([key, value]) => ({ key, value }));
        if (_single || _maybeSingle) return { data: rows[0] || null, error: null };
        return { data: rows, error: null };
      }

      if (table === 'payment_gateways_public') {
        const slugFilter = _filters.find(f => f.col === 'slug');
        if (slugFilter) {
          const result = await api.get(`/payments/public/${slugFilter.val}`);
          if (result.data) {
            const d = _maybeSingle || _single ? result : { data: [result.data], error: null };
            return d;
          }
          return _maybeSingle ? { data: null, error: null } : { data: [], error: null };
        }
        return _maybeSingle ? { data: null, error: null } : { data: [], error: null };
      }

      if (table === 'user_roles') {
        const userIdFilter = _filters.find(f => f.col === 'user_id');
        const roleFilter = _filters.find(f => f.col === 'role');
        if (userIdFilter && roleFilter) {
          const sessionResult = await api.get('/auth/session');
          if (sessionResult.error) return _maybeSingle ? { data: null, error: null } : { data: [], error: null };
          const isAdmin = sessionResult.data?.isAdmin && roleFilter.val === 'admin';
          return _maybeSingle || _single
            ? { data: isAdmin ? { role: roleFilter.val } : null, error: null }
            : { data: isAdmin ? [{ role: roleFilter.val }] : [], error: null };
        }
      }

      let result = await api.get(ep.list);
      if (result.error) return result;
      let rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);

      for (const f of _filters) {
        if (f.op === 'in') rows = rows.filter((r: any) => Array.isArray(f.val) && f.val.includes(r[f.col]));
        else if (f.op === 'neq') rows = rows.filter((r: any) => r[f.col] !== f.val);
        else if (f.op === 'gte') rows = rows.filter((r: any) => r[f.col] >= f.val);
        else if (f.op === 'ilike') {
          const raw = String(f.val);
          const hasLeadingWildcard = raw.startsWith('%');
          const hasTrailingWildcard = raw.endsWith('%');
          const pattern = raw.replace(/%/g, '').toLowerCase();
          rows = rows.filter((r: any) => {
            const val = String(r[f.col] || '').toLowerCase();
            if (hasLeadingWildcard && hasTrailingWildcard) return val.includes(pattern);
            if (hasLeadingWildcard) return val.endsWith(pattern);
            if (hasTrailingWildcard) return val.startsWith(pattern);
            return val === pattern;
          });
        } else rows = rows.filter((r: any) => r[f.col] === f.val);
      }

      if (_order) {
        rows = [...rows].sort((a: any, b: any) => {
          const cmp = a[_order!.col] > b[_order!.col] ? 1 : -1;
          return _order!.ascending ? cmp : -cmp;
        });
      }

      if (_limit !== null) rows = rows.slice(0, _limit);
      if (_single) return rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: { message: 'No rows found' } };
      if (_maybeSingle) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    }

    const self: any = {
      select: (cols?: string) => self,
      insert: (data: any) => { _insertData = data; return self; },
      update: (data: any) => { _updateData = data; return self; },
      delete: () => { _isDelete = true; return self; },
      upsert: (data: any, opts?: any) => { _insertData = data; return self; },
      eq: (col: string, val: any) => { _filters.push({ col, val, op: 'eq' }); return self; },
      neq: (col: string, val: any) => { _filters.push({ col, val, op: 'neq' }); return self; },
      not: (col: string, op: string, val: any) => { _filters.push({ col, val, op: 'neq' }); return self; },
      in: (col: string, vals: any[]) => { _filters.push({ col, val: vals, op: 'in' }); return self; },
      gte: (col: string, val: any) => { _filters.push({ col, val, op: 'gte' }); return self; },
      ilike: (col: string, val: string) => { _filters.push({ col, val, op: 'ilike' }); return self; },
      range: (from: number, to: number) => { _limit = to - from + 1; return self; },
      order: (col: string, opts?: { ascending?: boolean }) => { _order = { col, ascending: opts?.ascending ?? true }; return self; },
      limit: (n: number) => { _limit = n; return self; },
      single: () => { _single = true; return execute(); },
      maybeSingle: () => { _maybeSingle = true; return execute(); },
      then: (resolve: any, reject?: any) => execute().then(resolve, reject),
    };
    return self;
  },

  auth: api.auth,

  functions: {
    invoke: (name: string, options?: { body?: any }) => {
      const FUNCTION_PATH_MAP: Record<string, string> = {
        'get-ikhode-public-config': '/payments/public/ikhode-bakong',
        'process-topup': '/process-topup',
        'verify-game-id': '/verify-game-id',
        'g2bulk-api': '/g2bulk-api',
        'ahnajak-khqr': '/ahnajak-khqr',
        'khqrcc-payment': '/payments/khqrcc-payment',
        'ikhode-payment': '/ikhode-payment',
        'update-prices': '/update-prices',
      };
      const path = FUNCTION_PATH_MAP[name] || '/' + name;
      return api.post(path, options?.body);
    },
  },

  rpc: (name: string, params?: any) => {
    if (name === 'apply_coupon') return api.post('/coupons/apply', params);
    if (name === 'exchange_points_for_coupon') return api.post('/points/exchange', params);
    return api.post(`/rpc/${name}`, params);
  },

  storage: api.storage,
  channel: api.channel,
  removeChannel: () => {},
  _api: api,
};
