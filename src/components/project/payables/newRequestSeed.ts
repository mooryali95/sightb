/**
 * What the new-request dialog opens with.
 *
 * This sits in its own module rather than beside the dialog because a file
 * that exports both a component and a plain function loses fast refresh —
 * `react-refresh/only-export-components` reports it, and the warning budget in
 * `quality.yml` only ever falls.
 */
import type { PaymentPriority, PaymentRequestType } from '@/types/project';

export interface NewRequestSeed {
  resourceId: string;
  requestType: PaymentRequestType;
  selectedReimbursementIds: string[];
  description: string;
  priority: PaymentPriority;
}

/** An ordinary "new request": nothing pre-filled. */
export const blankRequestSeed = (): NewRequestSeed => ({
  resourceId: '',
  requestType: 'reimbursement',
  selectedReimbursementIds: [],
  description: '',
  priority: 'normal',
});
