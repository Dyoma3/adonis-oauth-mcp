import type { ApplicationService } from '@adonisjs/core/types'
import OAuthServer from '../src/oauth_server.js'
import OAuthAuthorizationCode from '../src/models/authorization_code.js'
import type { OAuthConfig } from '../src/types.js'

export default class OauthProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(OAuthServer, async () => {
      const config = this.app.config.get<OAuthConfig | undefined>('oauth')

      if (!config) {
        throw new Error(
          'Missing OAuth configuration. Run "node ace configure @dinko/adonis-oauth" to create config/oauth.ts'
        )
      }

      return new OAuthServer(config)
    })
  }

  async boot() {
    const table = this.app.config.get<string | undefined>('oauth.authorizationCodesTable')
    if (table) OAuthAuthorizationCode.table = table
  }
}
