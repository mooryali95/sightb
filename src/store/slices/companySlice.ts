import { StateCreator } from 'zustand';
import { db } from '@/services/db';
import { Company } from '@/types/project';
import { getUserId, logDeletion, mapCompany, upsertById } from '../helpers';
import type { AppState } from '../useStore';

/**
 * An edit to a company. A `null` description or logo clears it; `undefined`
 * leaves it as it is, so an emptied field has to travel as `null`.
 */
export type CompanyUpdate = Omit<Partial<Company>, 'description' | 'logo'> & {
  description?: string | null;
  logo?: string | null;
};

function withoutNulls(c: CompanyUpdate): Partial<Company> {
  return {
    ...c,
    description: c.description === null ? undefined : c.description,
    logo: c.logo === null ? undefined : c.logo,
  };
}

export interface CompanySlice {
  companies: Company[];
  addCompany: (c: Omit<Company, 'id' | 'createdAt'>) => Promise<string>;
  updateCompany: (id: string, c: CompanyUpdate) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  archiveCompany: (id: string) => Promise<void>;
  unarchiveCompany: (id: string) => Promise<void>;
}

export const createCompanySlice: StateCreator<AppState, [], [], CompanySlice> = (set, get) => ({
  companies: [],

  addCompany: async (c) => {
    const userId = await getUserId();
    const { data, error } = await db.from('companies').insert({
      user_id: userId, name: c.name, description: c.description || null, logo: c.logo || null, status: 'active',
    }).select().single();
    if (error) throw error;
    const mapped = mapCompany(data);
    set((s) => ({ companies: upsertById(s.companies, mapped) }));
    return mapped.id;
  },

  updateCompany: async (id, c) => {
    const updates: Record<string, unknown> = {};
    if (c.name !== undefined) updates.name = c.name;
    if (c.description !== undefined) updates.description = c.description;
    if (c.logo !== undefined) updates.logo = c.logo;
    if (c.status !== undefined) updates.status = c.status;
    const { error } = await db.from('companies').update(updates).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, ...withoutNulls(c) } : x)) }));
  },

  deleteCompany: async (id) => {
    const compProjects = get().projects.filter(p => p.companyId === id);
    for (const project of compProjects) {
      await get().deleteProject(project.id);
    }
    await db.from('portfolios').delete().eq('company_id', id);
    await db.from('indirect_costs').delete().eq('company_id', id);
    await db.from('custodies').delete().eq('company_id', id);
    const { error } = await db.from('companies').delete().eq('id', id);
    if (error) throw error;
    set((s) => ({
      companies: s.companies.filter((x) => x.id !== id),
      portfolios: s.portfolios.filter((x) => x.companyId !== id),
      projects: s.projects.filter((x) => x.companyId !== id),
      indirectCosts: s.indirectCosts.filter((x) => x.companyId !== id),
      custodies: s.custodies.filter((x) => x.companyId !== id),
    }));
  },

  archiveCompany: async (id) => {
    const { error } = await db.from('companies').update({ status: 'archived' }).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, status: 'archived' as const } : x)) }));
  },

  unarchiveCompany: async (id) => {
    const { error } = await db.from('companies').update({ status: 'active' }).eq('id', id);
    if (error) throw error;
    set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, status: 'active' as const } : x)) }));
  },
});
