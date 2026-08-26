/**
 * Resolves the scopes of a request: the ones asked for, or every scope the
 * client is allowed when the request carries none.
 */
export function parseScopes(scope: string | undefined, defaultScopes: readonly string[]) {
  const rawScopes = scope?.trim() ? scope.split(' ') : defaultScopes
  return [...new Set(rawScopes.map((value) => value.trim()).filter(Boolean))]
}
