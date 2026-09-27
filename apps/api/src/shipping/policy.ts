export type PostalRange = { start: string; end: string };
export type ShippingPolicy = {
  feeWon: number;
  freeThresholdWon: number;
  cutoffTime: string | null;
  blockedPostalRanges: PostalRange[];
};
export type PolicyLocks = Partial<Record<'feeWon' | 'freeThresholdWon' | 'cutoffTime', boolean>>;

export const defaultShippingPolicy: ShippingPolicy = {
  feeWon: 3000,
  freeThresholdWon: 50000,
  cutoffTime: null,
  blockedPostalRanges: [],
};

function money(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000;
}

export function validateShippingPolicy(input: unknown): ShippingPolicy {
  if (!input || typeof input !== 'object') throw new Error('Invalid shipping policy');
  const value = input as Record<string, unknown>;
  if (!money(value.feeWon) || !money(value.freeThresholdWon) ||
      !(value.cutoffTime === null || (typeof value.cutoffTime === 'string' &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value.cutoffTime))) ||
      !Array.isArray(value.blockedPostalRanges) || value.blockedPostalRanges.length > 100) {
    throw new Error('Invalid shipping policy');
  }
  const ranges = value.blockedPostalRanges.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid shipping policy');
    const range = raw as Record<string, unknown>;
    if (typeof range.start !== 'string' || typeof range.end !== 'string' ||
        !/^\d{5}$/.test(range.start) || !/^\d{5}$/.test(range.end) || range.start > range.end) {
      throw new Error('Invalid shipping policy');
    }
    return { start: range.start, end: range.end };
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index].start <= ranges[index - 1].end) throw new Error('Invalid shipping policy');
  }
  return { feeWon: value.feeWon, freeThresholdWon: value.freeThresholdWon,
    cutoffTime: value.cutoffTime, blockedPostalRanges: ranges } as ShippingPolicy;
}

/** An explicit operator lock wins; the operator's blocked areas can only be expanded by a seller. */
export function resolveShippingPolicy(adminInput: unknown, sellerInput: unknown | null,
  locksInput: unknown): ShippingPolicy {
  const admin = validateShippingPolicy(adminInput);
  const seller = sellerInput === null ? null : validateShippingPolicy(sellerInput);
  if (!locksInput || typeof locksInput !== 'object' || Array.isArray(locksInput)) {
    throw new Error('Invalid policy locks');
  }
  const locks = locksInput as Record<string, unknown>;
  if (Object.entries(locks).some(([key, value]) =>
    !['feeWon', 'freeThresholdWon', 'cutoffTime'].includes(key) || typeof value !== 'boolean')) {
    throw new Error('Invalid policy locks');
  }
  const combined = [...admin.blockedPostalRanges, ...(seller?.blockedPostalRanges ?? [])]
    .sort((a, b) => a.start.localeCompare(b.start));
  const blockedPostalRanges: PostalRange[] = [];
  for (const range of combined) {
    const previous = blockedPostalRanges.at(-1);
    if (previous && Number(range.start) <= Number(previous.end) + 1) {
      previous.end = range.end > previous.end ? range.end : previous.end;
    } else blockedPostalRanges.push({ ...range });
  }
  return {
    feeWon: seller && !locks.feeWon ? seller.feeWon : admin.feeWon,
    freeThresholdWon: seller && !locks.freeThresholdWon ? seller.freeThresholdWon : admin.freeThresholdWon,
    cutoffTime: seller && !locks.cutoffTime ? seller.cutoffTime : admin.cutoffTime,
    blockedPostalRanges,
  };
}
