import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '@/services/db';
import { useAuth } from './useAuth';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // Show warning 2 min before
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30s

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export function useSessionTimeout() {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setInterval>>();

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) setShowWarning(false);
  }, [showWarning]);

  useEffect(() => {
    if (!user) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, handleActivity, { passive: true })
    );

    const checkIdle = setInterval(async () => {
      const idle = Date.now() - lastActivityRef.current;

      if (idle >= IDLE_TIMEOUT_MS) {
        clearInterval(checkIdle);
        setShowWarning(false);
        await db.signOut();
        window.location.href = '/login';
      } else if (idle >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
        const remaining = Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000);
        setRemainingSeconds(remaining);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, CHECK_INTERVAL_MS);

    // More frequent update for countdown when warning is shown
    warningTimerRef.current = setInterval(() => {
      if (showWarning) {
        const idle = Date.now() - lastActivityRef.current;
        const remaining = Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
        setRemainingSeconds(remaining);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, handleActivity)
      );
      clearInterval(checkIdle);
      if (warningTimerRef.current) clearInterval(warningTimerRef.current);
    };
  }, [user, showWarning]);

  return { showWarning, remainingSeconds, resetActivity };
}
