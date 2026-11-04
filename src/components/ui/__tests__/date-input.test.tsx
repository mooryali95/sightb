import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Input } from '../input';
import { Label } from '../label';

function Controlled({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <Label>تاريخ البداية</Label>
      <Input type="date" className="w-40" value={v} onChange={(e) => setV(e.target.value)} />
      <button onClick={() => setV('2026-01-15')}>ضبط</button>
    </div>
  );
}

describe('date input', () => {
  it('reads the date in Arabic while keeping the native value', () => {
    render(<Controlled initial="2026-11-04" />);
    const field = screen.getByLabelText('تاريخ البداية') as HTMLInputElement;
    expect(field.value).toBe('2026-11-04');
    expect(field.type).toBe('date');
    expect(screen.getByText('4 نوفمبر 2026')).toBeInTheDocument();
  });

  it('follows typing and values set from code', () => {
    render(<Controlled />);
    expect(screen.getByText('اختر التاريخ')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('تاريخ البداية'), { target: { value: '2026-03-01' } });
    expect(screen.getByText('1 مارس 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByText('ضبط'));
    expect(screen.getByText('15 يناير 2026')).toBeInTheDocument();
  });

  it('moves width classes to the box so the reading sits over the field', () => {
    render(<Controlled />);
    const field = screen.getByLabelText('تاريخ البداية');
    expect(field.parentElement?.className).toContain('w-40');
    expect(field.className).not.toContain('w-40');
  });
});
