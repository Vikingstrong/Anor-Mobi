import { emptyAccount, packageKeys, type Account, type Packages, type PackageKey } from './account';
import { matchTariffName, tariffs, type TariffId } from './tariffs';
export function tariffView(account: Account): { packages: Packages; historical: boolean; expiresLocal: string | null } {
  const reported = account.tariffName ? matchTariffName(account.tariffName) : null;
  if (account.tariffSelection === 'auto' || account.tariffId === null || reported === account.tariffId || account.tariffName === null) {
    return { packages: account.packages, historical: false, expiresLocal: account.expiresLocal };
  }
  const snapshot = account.tariffSnapshots[account.tariffId];
  return { packages: snapshot?.packages ?? emptyAccount().packages, historical: true, expiresLocal: snapshot?.expiresLocal ?? null };
}

export function visiblePackageKeys(tariffId: TariffId | null): PackageKey[] {
  if (tariffId === null) return [...packageKeys];
  const profile = tariffs[tariffId];
  return packageKeys.filter((key) => profile.limits[key] !== null || (key === 'night' && profile.nightUnlimited));
}
