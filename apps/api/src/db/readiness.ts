export async function hasAccountSchema(
  query: () => Promise<{ rows: Array<{ ready: boolean }> }>,
): Promise<boolean> {
  try {
    return (await query()).rows[0]?.ready === true;
  } catch {
    return false;
  }
}
