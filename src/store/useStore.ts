import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Company, Portfolio, Project, BudgetItem, Expense, Revenue,
  type ExpenseCategory,
} from '@/types/project';

function uid() {
  return crypto.randomUUID();
}

interface AppState {
  companies: Company[];
  portfolios: Portfolio[];
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: Expense[];
  revenues: Revenue[];

  // Company
  addCompany: (c: Omit<Company, 'id' | 'createdAt'>) => string;
  updateCompany: (id: string, c: Partial<Company>) => void;
  deleteCompany: (id: string) => void;

  // Portfolio
  addPortfolio: (p: Omit<Portfolio, 'id' | 'createdAt'>) => string;
  updatePortfolio: (id: string, p: Partial<Portfolio>) => void;
  deletePortfolio: (id: string) => void;

  // Project
  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => string;
  updateProject: (id: string, p: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Budget
  addBudgetItem: (b: Omit<BudgetItem, 'id'>) => string;
  updateBudgetItem: (id: string, b: Partial<BudgetItem>) => void;
  deleteBudgetItem: (id: string) => void;

  // Expenses
  addExpense: (e: Omit<Expense, 'id'>) => string;
  updateExpense: (id: string, e: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  // Revenue
  addRevenue: (r: Omit<Revenue, 'id'>) => string;
  deleteRevenue: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      companies: [],
      portfolios: [],
      projects: [],
      budgetItems: [],
      expenses: [],
      revenues: [],

      addCompany: (c) => {
        const id = uid();
        set((s) => ({ companies: [...s.companies, { ...c, id, createdAt: new Date().toISOString() }] }));
        return id;
      },
      updateCompany: (id, c) =>
        set((s) => ({ companies: s.companies.map((x) => (x.id === id ? { ...x, ...c } : x)) })),
      deleteCompany: (id) =>
        set((s) => ({
          companies: s.companies.filter((x) => x.id !== id),
          portfolios: s.portfolios.filter((x) => x.companyId !== id),
          projects: s.projects.filter((x) => x.companyId !== id),
        })),

      addPortfolio: (p) => {
        const id = uid();
        set((s) => ({ portfolios: [...s.portfolios, { ...p, id, createdAt: new Date().toISOString() }] }));
        return id;
      },
      updatePortfolio: (id, p) =>
        set((s) => ({ portfolios: s.portfolios.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      deletePortfolio: (id) =>
        set((s) => ({
          portfolios: s.portfolios.filter((x) => x.id !== id),
          projects: s.projects.map((x) => (x.portfolioId === id ? { ...x, portfolioId: undefined } : x)),
        })),

      addProject: (p) => {
        const id = uid();
        const project = {
          ...p,
          id,
          portfolioId: p.portfolioId === 'none' ? undefined : p.portfolioId,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ projects: [...s.projects, project] }));
        return id;
      },
      updateProject: (id, p) =>
        set((s) => ({ projects: s.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((x) => x.id !== id),
          budgetItems: s.budgetItems.filter((x) => x.projectId !== id),
          expenses: s.expenses.filter((x) => x.projectId !== id),
          revenues: s.revenues.filter((x) => x.projectId !== id),
        })),

      addBudgetItem: (b) => {
        const id = uid();
        set((s) => ({ budgetItems: [...s.budgetItems, { ...b, id }] }));
        return id;
      },
      updateBudgetItem: (id, b) =>
        set((s) => ({ budgetItems: s.budgetItems.map((x) => (x.id === id ? { ...x, ...b } : x)) })),
      deleteBudgetItem: (id) =>
        set((s) => ({ budgetItems: s.budgetItems.filter((x) => x.id !== id) })),

      addExpense: (e) => {
        const id = uid();
        set((s) => ({ expenses: [...s.expenses, { ...e, id }] }));
        return id;
      },
      updateExpense: (id, e) =>
        set((s) => ({ expenses: s.expenses.map((x) => (x.id === id ? { ...x, ...e } : x)) })),
      deleteExpense: (id) =>
        set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) })),

      addRevenue: (r) => {
        const id = uid();
        set((s) => ({ revenues: [...s.revenues, { ...r, id }] }));
        return id;
      },
      deleteRevenue: (id) =>
        set((s) => ({ revenues: s.revenues.filter((x) => x.id !== id) })),
    }),
    { name: 'basserh-portfolio-manager' }
  )
);
