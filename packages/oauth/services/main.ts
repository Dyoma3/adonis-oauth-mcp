import app from '@adonisjs/core/services/app'
import OAuthServer from '../src/oauth_server.js'

let oauth: OAuthServer

/**
 * Container service for the configured OAuth server, for code that cannot use
 * dependency injection. Controllers should inject `OAuthServer` instead.
 */
await app.booted(async () => {
  oauth = await app.container.make(OAuthServer)
})

export { oauth as default }
