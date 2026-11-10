/** Rejects targets other than the local example services started by this suite. */
export function localTarget(value: string, expected: string): string {
  const target = new URL(value);
  if (target.href !== `${expected}/`) {
    throw new Error(`Example suite requires ${expected}: ${value}`);
  }
  return expected;
}
