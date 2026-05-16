const ERROR_MAP: [RegExp, string][] = [
  [/user rejected|rejected by user|user denied|cancelled by user/i, 'Transaction cancelled'],
  [/EOrderNotExpired/i, 'Order has not expired yet — cancel is only available after expiry'],
  [/EOrderExpired/i, 'Order has already expired'],
  [/insufficient.*balance|balance.*insufficient/i, 'Insufficient balance in your wallet'],
  [/no .* coins? in wallet|no .* owned/i, 'No matching coins found in your wallet'],
  [/failed to fetch|networkerror|network error/i, 'Network error — check your connection and try again'],
  [/timeout/i, 'Request timed out — please try again'],
  [/gas budget/i, 'Not enough SUI for gas fees'],
];

export function friendlyError(err: unknown, fallback = 'Something went wrong — please try again'): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const [pattern, friendly] of ERROR_MAP) {
    if (pattern.test(msg)) return friendly;
  }
  return fallback;
}
