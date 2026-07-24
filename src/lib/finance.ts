// Backward-compatible barrel. The domain is split into focused modules
// under `src/lib/finance/*`. Existing imports from '@/lib/finance' keep working.
export * from './finance/index';
