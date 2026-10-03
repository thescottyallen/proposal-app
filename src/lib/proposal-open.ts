/** The first recorded open is the only one that should email the owner. */
export function isFirstOpen(existingOpenCount: number): boolean {
  return existingOpenCount === 0;
}
