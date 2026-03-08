

## Plan: Permission Refinement, Page Redesign, and Export Verification

### 1. Restrict Delete to Admin Only

**Problem**: Currently, DELETE RLS policies allow editors (`can_edit`) to delete companies, projects, and portfolios. The user wants only admins to delete.

**Database Migration**: Update DELETE policies for `companies`, `projects`, `portfolios` to use `has_role(auth.uid(), 'admin')` instead of `can_edit(...)`.

```sql
-- Drop existing DELETE policies and recreate with admin-only
DROP POLICY "Editors can delete companies" ON companies;
CREATE POLICY "Admins can delete companies" ON companies FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY "Editors can delete projects" ON projects;  
CREATE POLICY "Admins can delete projects" ON projects FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY "Editors can delete portfolios" ON portfolios;
CREATE POLICY "Admins can delete portfolios" ON portfolios FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

**UI Changes**:
- **Dashboard.tsx**: Wrap company delete button and archive button with `{isAdmin && ...}`
- **ProjectDetail.tsx**: Wrap delete button with `{isAdmin && ...}`, keep status change for editors
- **PortfolioDetail.tsx**: Add delete button visible only to admins
- **CompanyDetail.tsx**: Add delete/archive buttons visible only to admins

### 2. Redesign Detail Pages with Distinct Visual Identity

Each page will have a unique visual header/identity:

**CompanyDetail** (`Building2` icon theme):
- Gradient header banner with `Building2` icon, company name prominent
- Badge showing active/archived status
- Color accent: Blue/Primary
- Add edit dialog for company name/description (admin only)
- Add delete/archive buttons (admin only)

**PortfolioDetail** (`FolderKanban` icon theme):
- Gradient header with `FolderKanban` icon
- Show parent company breadcrumb prominently
- Color accent: Purple/Violet
- Add edit dialog for portfolio name/description/targets
- Add delete button (admin only)

**ProjectDetail** (`Briefcase` icon theme):
- Gradient header with project icon
- Show company > portfolio breadcrumb
- Color accent: Emerald/Green
- Keep existing edit capabilities for budget/resources
- Delete restricted to admin

Each header will follow this pattern:
```text
┌─────────────────────────────────────────┐
│  [Icon]  Entity Name        [Actions]   │
│  Breadcrumb · Metadata      [Delete]    │
│  Status Badge                           │
└─────────────────────────────────────────┘
```

### 3. Verify and Enhance Export

- Review `exportToExcel` and `exportToPDF` in `src/lib/export.ts` to ensure they work correctly
- Add export buttons to CompanyDetail and PortfolioDetail (already present, verify functionality)
- Ensure PDF report includes all sections (budget, expenses, revenues, change orders)

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/migrations/new` | Update DELETE RLS policies to admin-only |
| `src/pages/Dashboard.tsx` | Guard delete/archive with `isAdmin` |
| `src/pages/ProjectDetail.tsx` | Guard delete with `isAdmin`, redesign header |
| `src/pages/PortfolioDetail.tsx` | Add delete (admin), edit dialog, redesign header |
| `src/pages/CompanyDetail.tsx` | Add delete/edit (admin), redesign header |

### Estimated Scope
- 1 migration file
- 4 page files modified with visual redesign + permission guards

