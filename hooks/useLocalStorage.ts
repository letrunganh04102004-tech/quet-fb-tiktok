
import { useState } from 'react';

// Fix: Correctly handle functional updates to prevent stale state issues in loops.
// The previous implementation closed over a stale `storedValue`, causing sequential
// updates to overwrite each other. This new implementation correctly passes the
// updater function to React's state setter, ensuring each update is based on the
// most recent state.
function useLocalStorage<T,>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // This is the core of the fix. We wrap our logic inside the functional
      // update form of setStoredValue. This guarantees that `prevStoredValue`
      // is always the most up-to-date state from React, resolving the race condition.
      setStoredValue(prevStoredValue => {
        const valueToStore = value instanceof Function ? value(prevStoredValue) : value;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        return valueToStore;
      });
    } catch (error) {
      console.error(error);
    }
  };
  
  return [storedValue, setValue];
}

export default useLocalStorage;
