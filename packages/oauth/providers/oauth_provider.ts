import type { ApplicationService } from '@adonisjs/core/types'

export default class OauthProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {}
}
