import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { AccountController } from '../application/AccountController';
import { backgroundSms } from '../services/backgroundSms';
import { telephony } from '../services/telephony';
import { accountStorage } from '../storage/accountStorage';

export function useAccount() {
  const [controller] = useState(() => new AccountController(telephony, accountStorage, Date.now, backgroundSms));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    void controller.setForeground(AppState.currentState === 'active');
    void controller.init();
    const subscription = AppState.addEventListener('change', (next) => { void controller.setForeground(next === 'active'); });
    return () => { subscription.remove(); controller.dispose(); };
  }, [controller]);
  return { state, controller, nativeAvailable: telephony.available };
}
