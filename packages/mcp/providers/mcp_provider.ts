import type { ApplicationService } from '@adonisjs/core/types'

export default class McpProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {}
}
