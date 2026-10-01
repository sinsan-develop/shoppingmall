export async function confirmSavedDraft<T>(
  response: Pick<Response, 'json'>,
  reload: () => Promise<void>,
  accept: (draft: T) => void,
): Promise<'response' | 'reloaded' | 'unverified'> {
  try {
    accept(await response.json() as T);
    return 'response';
  } catch {
    try {
      await reload();
      return 'reloaded';
    } catch {
      return 'unverified';
    }
  }
}
