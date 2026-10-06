export type ShortlistMutationResult = {
  ids: string[];
  committed: boolean;
  error: unknown | null;
};

/** Keeps the previous snapshot when a remote write fails. */
export async function commitShortlistMutation(
  previousIds: readonly string[],
  persist: () => Promise<readonly string[]>,
): Promise<ShortlistMutationResult> {
  try {
    return { ids: [...await persist()], committed: true, error: null };
  } catch (error) {
    return { ids: [...previousIds], committed: false, error };
  }
}
