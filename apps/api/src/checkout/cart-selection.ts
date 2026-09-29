export type CartSelection = { optionId: string; quantity: number };

function validOptionId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validQuantity(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function copySelections(input: readonly CartSelection[]): CartSelection[] {
  if (!Array.isArray(input)) throw new Error('Invalid cart selection');
  const seen = new Set<string>();
  return input.map((item) => {
    if (!item || !validOptionId(item.optionId) || !validQuantity(item.quantity) || seen.has(item.optionId)) {
      throw new Error('Invalid cart selection');
    }
    seen.add(item.optionId);
    return { optionId: item.optionId, quantity: item.quantity };
  });
}

/** Local selection intent only; price, availability and shipping must be re-read by the server. */
export function addSelection(input: readonly CartSelection[], optionId: string, quantity = 1): CartSelection[] {
  const selections = copySelections(input);
  if (!validOptionId(optionId) || !validQuantity(quantity)) throw new Error('Invalid cart selection');
  const existing = selections.find((item) => item.optionId === optionId);
  if (existing) {
    const next = existing.quantity + quantity;
    if (!validQuantity(next)) throw new Error('Invalid cart selection');
    existing.quantity = next;
  } else selections.push({ optionId, quantity });
  return selections;
}

export function changeSelectionQuantity(input: readonly CartSelection[], optionId: string,
  quantity: number): CartSelection[] {
  const selections = copySelections(input);
  if (!validOptionId(optionId) || !validQuantity(quantity)) throw new Error('Invalid cart selection');
  const existing = selections.find((item) => item.optionId === optionId);
  if (!existing) throw new Error('Missing cart selection');
  existing.quantity = quantity;
  return selections;
}

export function removeSelection(input: readonly CartSelection[], optionId: string): CartSelection[] {
  const selections = copySelections(input);
  if (!validOptionId(optionId)) throw new Error('Invalid cart selection');
  return selections.filter((item) => item.optionId !== optionId);
}
