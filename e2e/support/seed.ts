/**
 * The one dataset every spec builds on. Rows are shaped exactly as PostgREST
 * returns them (snake_case, string ids), because the store's mappers read them
 * directly — a camelCase fixture would pass through mapProject and quietly
 * produce NaN where money should be.
 */
export const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
export const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
export const FUND_ID = '33333333-3333-4333-8333-333333333333';
export const USER_ID = '44444444-4444-4444-8444-444444444444';
export const SETTLEMENT_ID = '88888888-8888-4888-8888-888888888888';

export const seed: Record<string, Record<string, unknown>[]> = {
  companies: [
    {
      id: COMPANY_ID,
      name: 'شركة الاختبار',
      description: null,
      logo: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],

  portfolios: [],

  projects: [
    {
      id: PROJECT_ID,
      company_id: COMPANY_ID,
      portfolio_id: null,
      name: 'مشروع الاختبار',
      description: null,
      contract_value: 1000000,
      currency: 'SAR',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      duration_months: 12,
      resource_count: 3,
      status: 'active',
      client_logo: null,
      created_at: '2026-01-01T00:00:00Z',
      percent_complete: 40,
      contract_type: 'lump_sum',
      retention_percent: 5,
      management_reserve: 0,
      tax_percent: 15,
      vat_inclusive: false,
    },
  ],

  // Acknowledged, with a draft settlement against it: that pair is what makes
  // the "تسوية" action appear at all, so the settlement spec needs both.
  project_funds: [
    {
      id: FUND_ID,
      project_id: PROJECT_ID,
      fund_number: 1,
      amount: 50000,
      transfer_date: '2026-02-01',
      status: 'acknowledged',
      notes: null,
      created_by: USER_ID,
      acknowledged_at: '2026-02-02T00:00:00Z',
      acknowledged_by: USER_ID,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-02T00:00:00Z',
    },
  ],

  expenses: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      project_id: PROJECT_ID,
      category: 'materials',
      description: 'مواد أساسية',
      amount: 12000,
      date: '2026-03-01',
      month: 3,
      approval_status: 'approved',
      is_vat_exempt: false,
      fund_id: FUND_ID,
      created_at: '2026-03-01T00:00:00Z',
    },
  ],

  budget_items: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      project_id: PROJECT_ID,
      category: 'materials',
      description: 'بند المواد',
      planned_amount: 400000,
      month: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],

  revenues: [],
  resources: [],
  custodies: [],
  milestones: [],
  change_orders: [],
  risks: [],
  indirect_costs: [],
  commitments: [],
  fund_settlements: [
    {
      id: SETTLEMENT_ID,
      fund_id: FUND_ID,
      project_id: PROJECT_ID,
      total_received: 50000,
      total_spent: 0,
      remaining_cash: 0,
      difference: 0,
      status: 'draft',
      attachments: [],
      created_at: '2026-03-02T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
    },
  ],
  payment_requests: [],
  cash_transfers: [],
  audit_log: [],
  user_roles: [
    { id: '77777777-7777-4777-8777-777777777777', user_id: USER_ID, role: 'admin', scope_type: 'system', scope_id: null },
  ],
  profiles: [
    { id: USER_ID, email: 'e2e@example.com', full_name: 'مستخدم الاختبار' },
  ],
};

export const SESSION = {
  access_token: 'e2e-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'e2e-refresh-token',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e@example.com',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};
