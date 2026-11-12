export type Subscription = {
  subscriptionId: number;
  slotIndex: number;
  displayName: string;
  carrierName: string;
  operatorName: string;
  isDefaultVoice: boolean;
};
export type AutoSimResult = { kind: 'selected'; subscriptionId: number; reason: 'anor' | 'default' | 'only' } | { kind: 'unavailable' };
function isAnor(sim: Subscription): boolean {
  // Prefer carrier-provided names over the user-editable SIM label. Older
  // preview builds supply only displayName; use it when carrier names are absent.
  const names = [sim.carrierName, sim.operatorName].filter((name) => name.trim().length > 0);
  if (names.length === 0) names.push(sim.displayName);
  return names.some((name) => /(?:^|[^\p{L}\p{N}])(?:anor|анор)(?=$|[^\p{L}\p{N}])/iu.test(name));
}
export function selectAutoSim(sims: Subscription[], previousId: number | null): AutoSimResult {
  const anor = sims.filter(isAnor);
  const preferred = anor.find((sim) => sim.isDefaultVoice) ?? anor.find((sim) => sim.subscriptionId === previousId)
    ?? [...anor].sort((a, b) => a.slotIndex - b.slotIndex || a.subscriptionId - b.subscriptionId)[0];
  if (preferred) return { kind: 'selected', subscriptionId: preferred.subscriptionId, reason: 'anor' };
  const defaultSim = sims.find((sim) => sim.isDefaultVoice);
  if (defaultSim) return { kind: 'selected', subscriptionId: defaultSim.subscriptionId, reason: 'default' };
  if (sims.length === 1 && sims[0]) return { kind: 'selected', subscriptionId: sims[0].subscriptionId, reason: 'only' };
  return { kind: 'unavailable' };
}
