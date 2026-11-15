import { useEffect, useState } from 'react';
import type { OpsClient } from '../api/types';

/**
 * "The analysis machine is offline" when no worker has sent a heartbeat lately. Checked
 * when the page opens and whenever `recheck` changes (a job update), never on a timer.
 */
export function OfflineNotice({ ops, recheck }: { ops: OpsClient; recheck?: unknown }) {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    ops.workerOnline().then(
      (yes) => current && setOnline(yes),
      () => current && setOnline(null),
    );
    return () => {
      current = false;
    };
  }, [ops, recheck]);
  if (online !== false) return null;
  return (
    <p className="alert-quiet" role="status">
      The analysis machine is offline. Your song will be analysed when it's back.
    </p>
  );
}
