/**
 * The first five things a new workspace needs, read from its data, so a step
 * ticks itself the moment it is done anywhere in the product. In the order
 * money moves: a company holds projects, a project gets a budget, then spend
 * and income are recorded against it.
 */
export interface StartStep {
  key: 'company' | 'project' | 'budget' | 'expense' | 'revenue';
  title: string;
  hint: string;
  done: boolean;
  link: string;
}

export function gettingStartedSteps(d: {
  companies: number;
  projectIds: string[];
  budgetItems: number;
  expenses: number;
  revenues: number;
}): StartStep[] {
  const first = d.projectIds[0];
  const inProject = (tab: string) => (first ? `/project/${first}?group=finance&tab=${tab}` : '/project/new');
  return [
    { key: 'company', title: 'أضف شركة', hint: 'الشركة تجمع المشاريع ومالها العام.', done: d.companies > 0, link: '/companies/new' },
    { key: 'project', title: 'أنشئ مشروعاً', hint: 'بقيمة العقد ومدته، ليُقاس عليه الصرف والإنجاز.', done: d.projectIds.length > 0, link: '/project/new' },
    { key: 'budget', title: 'ضع موازنة المشروع', hint: 'بنود الموازنة هي ما يُقارن به كل مصروف.', done: d.budgetItems > 0, link: inProject('budget') },
    { key: 'expense', title: 'سجّل أول مصروف', hint: 'من الجوال لحظة الصرف، مع صورة الفاتورة.', done: d.expenses > 0, link: inProject('expenses') },
    { key: 'revenue', title: 'سجّل أول إيراد', hint: 'المفوتر والمحصّل يكملان صورة الربح.', done: d.revenues > 0, link: inProject('revenue') },
  ];
}
