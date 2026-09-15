/**
 * Component tests for two shared building blocks: the stat card every
 * dashboard figure is drawn with, and the form dialog that becomes a
 * bottom sheet on a phone. What must hold: the card colours its value by
 * trend, shows its help only when there is something to say, and drops
 * the subtitle when compact; the dialog picks the sheet or the dialog by
 * viewport, keeps the title and footer in both, and closes from its own
 * large button on the phone.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';
import { ResponsiveFormDialog } from '../ResponsiveFormDialog';

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

describe('StatCard', () => {
  it('colours the value by trend and adds the neutral arrow only for a neutral one', () => {
    const { rerender } = render(<StatCard title="الربح" value="1,000" trend="up" />);
    expect(screen.getByText('1,000').className).toContain('profit-text');
    expect(screen.getByText('1,000').querySelector('svg')).toBeNull();
    rerender(<StatCard title="الربح" value="1,000" trend="down" />);
    expect(screen.getByText('1,000').className).toContain('loss-text');
    rerender(<StatCard title="الربح" value="1,000" trend="neutral" />);
    expect(screen.getByText('1,000').className).not.toMatch(/profit-text|loss-text/);
    expect(screen.getByText('1,000').querySelector('svg')).not.toBeNull();
  });

  it('shows the help button only with a tooltip or details, and opens them', () => {
    const { rerender } = render(<StatCard title="الربح" value="1" />);
    expect(screen.queryByRole('button', { name: 'مزيد من المعلومات' })).not.toBeInTheDocument();
    rerender(<StatCard title="الربح" value="1" tooltip="صافي بعد الضريبة" details={<span>تفصيل</span>} />);
    fireEvent.click(screen.getByRole('button', { name: 'مزيد من المعلومات' }));
    expect(screen.getByText('صافي بعد الضريبة')).toBeInTheDocument();
    expect(screen.getByText('تفصيل')).toBeInTheDocument();
  });

  it('keeps the subtitle in the default and hero variants and drops it when compact, with hero styling on the value', () => {
    const { rerender, container } = render(<StatCard title="الربح" value="1" subtitle="هذا الشهر" variant="hero" trend="up" />);
    expect(screen.getByText('هذا الشهر')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('stat-card-hero');
    expect(screen.getByText('1').className).toContain('stat-value-hero');
    expect(screen.getByText('1').className).not.toContain('profit-text');
    rerender(<StatCard title="الربح" value="1" subtitle="هذا الشهر" variant="compact" />);
    expect(screen.queryByText('هذا الشهر')).not.toBeInTheDocument();
  });
});

describe('ResponsiveFormDialog', () => {
  const onOpenChange = vi.fn();
  const renderDialog = () => render(
    <ResponsiveFormDialog open onOpenChange={onOpenChange} title="نموذج" footer={<button>حفظ</button>}>
      <input placeholder="حقل" />
    </ResponsiveFormDialog>,
  );

  it('renders a centred dialog on the desktop with the title, body and footer', () => {
    mobile.value = false;
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('نموذج');
    expect(screen.getByPlaceholderText('حقل')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إغلاق' })).not.toBeInTheDocument();
  });

  it('renders a bottom sheet on a phone with its own large close button', () => {
    mobile.value = true;
    renderDialog();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('نموذج');
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    mobile.value = false;
  });
});
