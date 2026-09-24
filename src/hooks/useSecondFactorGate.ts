import { useEffect, useState } from 'react';
import { secondFactorStatus } from '@/services/secondFactorService';

/** Users whose current session the server has already said is through. */
const passed = new Set<string>();

/**
 * Whether the signed-in session still owes its second factor. The page is
 * shown meanwhile: the database refuses data to such a session once
 * enforcement is on, so this only sends the person to finish the code rather
 * than leaving them before empty pages. An answer that cannot be had counts
 * as through, for the same reason.
 */
export function useSecondFactorGate(userId: string | undefined): 'ok' | 'needs-code' {
  const [state, setState] = useState<'ok' | 'needs-code'>('ok');
  useEffect(() => {
    if (!userId || passed.has(userId)) return;
    let live = true;
    secondFactorStatus().then((status) => {
      if (!live) return;
      if (status && status.required && !status.verified) setState('needs-code');
      else passed.add(userId);
    });
    return () => { live = false; };
  }, [userId]);
  return state;
}

/** For tests, and for sign-out: the next session is asked again. */
export function forgetSecondFactorPasses() {
  passed.clear();
}
