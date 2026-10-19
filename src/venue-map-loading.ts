/** A stalled optional map must never leave venue browsing waiting forever. */
export function loadOptionalMap<T>(work: () => Promise<T>, signal: AbortSignal, milliseconds = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (success: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      if (success) resolve(value as T); else reject(value);
    };
    const aborted = () => finish(false, new Error('Map request cancelled'));
    const timer = setTimeout(() => finish(false, new Error('Map loading timed out')), milliseconds);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    Promise.resolve().then(() => {
      if (signal.aborted) throw new Error('Map request cancelled');
      return work();
    }).then(value => finish(true, value), error => finish(false, error));
  });
}
