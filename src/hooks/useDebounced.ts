import { useEffect, useState } from "react";

/// Returns `value` delayed by `ms` — updates only after it stops changing.
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}
