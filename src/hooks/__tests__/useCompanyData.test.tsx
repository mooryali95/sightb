/**
 * The company loader walks the company's projects, so it must not start
 * before the project list has arrived. A company opened by its link started
 * both at once: the loader found no projects, loaded nothing, and the page
 * showed every project with no spend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useStore, type AppState } from '@/store/useStore';
import { useCompanyData } from '../useAppData';

vi.mock('../useAuth', () => ({ useAuth: () => ({ user: { id: 'u' }, loading: false }) }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useCompanyData', () => {
  const loadCompanyData = vi.fn(async () => {});
  beforeEach(() => {
    loadCompanyData.mockClear();
    useStore.setState({ loadCompanyData, _lastLoadedAt: undefined } as Partial<AppState>);
  });

  it('waits for the project list, then loads the company once', async () => {
    renderHook(() => useCompanyData('c1'), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(loadCompanyData).not.toHaveBeenCalled();

    act(() => useStore.setState({ _lastLoadedAt: Date.now() } as Partial<AppState>));
    await waitFor(() => expect(loadCompanyData).toHaveBeenCalledWith('c1'));
    expect(loadCompanyData).toHaveBeenCalledTimes(1);
  });
});
