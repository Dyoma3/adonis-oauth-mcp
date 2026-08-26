import type { OAuthClientConfig } from './types.js'

export default class OAuthRedirectUriMatcher {
  constructor(
    private client: OAuthClientConfig,
    private redirectUri: string
  ) {}

  execute() {
    return (
      this.client.redirectUris.some((registeredRedirectUri) =>
        this.redirectUrisMatch(registeredRedirectUri)
      ) ||
      (this.client.redirectUriPatterns ?? []).some((registeredRedirectUriPattern) =>
        this.redirectUriPatternMatches(registeredRedirectUriPattern)
      )
    )
  }

  private redirectUrisMatch(registeredRedirectUri: string) {
    if (registeredRedirectUri === this.redirectUri) return true

    const registeredUrl = this.parseUrl(registeredRedirectUri)
    const url = this.parseUrl(this.redirectUri)

    if (!registeredUrl || !url) return false
    if (!this.isLoopbackRedirectUri(registeredUrl)) return false
    if (this.hasExplicitPort(registeredRedirectUri)) return false

    return (
      url.protocol === registeredUrl.protocol &&
      url.hostname === registeredUrl.hostname &&
      this.pathnamesMatch(registeredUrl.pathname, url.pathname) &&
      url.search === registeredUrl.search &&
      url.hash === registeredUrl.hash
    )
  }

  private pathnamesMatch(registeredPathname: string, pathname: string) {
    if (pathname === registeredPathname) return true
    if (registeredPathname === '/') return false

    const registeredPathnamePrefix = registeredPathname.endsWith('/')
      ? registeredPathname
      : `${registeredPathname}/`

    return pathname.startsWith(registeredPathnamePrefix)
  }

  private redirectUriPatternMatches(registeredRedirectUriPattern: string) {
    const registeredUrl = this.parseUrl(registeredRedirectUriPattern)
    const url = this.parseUrl(this.redirectUri)

    if (!registeredUrl || !url) return false
    if (registeredUrl.protocol !== 'https:') return false

    return (
      url.origin === registeredUrl.origin &&
      this.pathnamePatternMatches(registeredUrl.pathname, url.pathname) &&
      url.search === registeredUrl.search &&
      url.hash === registeredUrl.hash
    )
  }

  private pathnamePatternMatches(registeredPathnamePattern: string, pathname: string) {
    const registeredSegments = registeredPathnamePattern.split('/')
    const segments = pathname.split('/')

    if (registeredSegments.length !== segments.length) return false

    return registeredSegments.every((registeredSegment, index) => {
      if (registeredSegment.startsWith(':') && registeredSegment.length > 1) {
        return /^[A-Za-z0-9_-]+$/.test(segments[index])
      }

      return registeredSegment === segments[index]
    })
  }

  private parseUrl(value: string) {
    try {
      return new URL(value)
    } catch {
      return null
    }
  }

  private isLoopbackRedirectUri(url: URL) {
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  }

  private hasExplicitPort(value: string) {
    return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/|$)/.test(value)
  }
}
