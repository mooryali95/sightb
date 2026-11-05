import { errorMessage } from '@/lib/utils';

export interface EachResult<T> {
  done: T[];
  failed: { item: T; message: string }[];
}

/**
 * Runs an action on each item in turn and reports which went through. One
 * after another, not all at once: the database checks each against the state
 * the previous left (a fund's balance, a budget line), and a refusal of one
 * must not stop the rest or be lost among them.
 */
export async function runEach<T>(items: T[], action: (item: T) => Promise<unknown>, onProgress?: (doneCount: number) => void): Promise<EachResult<T>> {
  const result: EachResult<T> = { done: [], failed: [] };
  for (const item of items) {
    try {
      await action(item);
      result.done.push(item);
    } catch (err) {
      result.failed.push({ item, message: errorMessage(err) });
    }
    onProgress?.(result.done.length + result.failed.length);
  }
  return result;
}
