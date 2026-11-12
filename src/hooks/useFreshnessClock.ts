import { useEffect, useReducer } from 'react';
import { AppState } from 'react-native';
// One minute clock for the screen, suspended while the app is not visible.
export function useFreshnessClock() {
  const [, tick] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function sync(active: boolean) {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (active) { tick(); timer = setInterval(tick, 60000); }
    }
    sync(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => sync(state === 'active'));
    return () => { subscription.remove(); if (timer !== null) clearInterval(timer); };
  }, []);
}
