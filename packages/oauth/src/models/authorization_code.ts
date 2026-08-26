import { createHash, randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import db from '@adonisjs/lucid/services/db'

type IssueAuthorizationCodePayload = {
  userId: string | number
  clientId: string
  redirectUri: string
  resource: string
  scopes: string[]
  codeChallenge: string
  codeChallengeMethod: 'S256'
}

/**
 * Authorization codes, stored hashed so a database leak cannot be replayed.
 *
 * The model deliberately has no relationship to the application's user model:
 * a package cannot know its name, its table or the type of its primary key.
 * `userId` is stored as-is and handed back to `issueToken`.
 */
export default class OAuthAuthorizationCode extends BaseModel {
  static table = 'oauth_authorization_codes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: string | number

  @column({ serializeAs: null })
  declare codeHash: string

  @column()
  declare clientId: string

  @column()
  declare redirectUri: string

  @column()
  declare resource: string

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string[] | string) =>
      typeof value === 'string' ? (JSON.parse(value) as string[]) : value,
  })
  declare scopes: string[]

  @column()
  declare codeChallenge: string

  @column()
  declare codeChallengeMethod: 'S256'

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  static async issue(payload: IssueAuthorizationCodePayload, ttlSeconds: number) {
    const code = randomBytes(32).toString('base64url')
    const authorizationCode = await this.create({
      ...payload,
      codeHash: this.hash(code),
      expiresAt: DateTime.now().plus({ seconds: ttlSeconds }),
    })

    return { code, authorizationCode }
  }

  /**
   * Reads and deletes a code in a single transaction, so a code replayed
   * concurrently can only be redeemed once. Expired codes are deleted too,
   * then reported as missing.
   */
  static async consume(code: string) {
    const codeHash = this.hash(code)

    return await db.transaction(async (trx) => {
      const authorizationCode = await this.query({ client: trx })
        .where('codeHash', codeHash)
        .forUpdate()
        .first()

      if (!authorizationCode) return null

      await authorizationCode.delete()

      if (authorizationCode.expiresAt.toMillis() <= DateTime.now().toMillis()) return null
      return authorizationCode
    })
  }

  private static hash(code: string) {
    return createHash('sha256').update(code).digest('hex')
  }
}
