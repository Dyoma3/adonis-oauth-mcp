import { z } from 'zod'

/**
 * Parameters of an authorization request, as posted back by the consent
 * screen to the approve and deny endpoints.
 */
export const authorizationRequestValidator = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
  code_challenge_method: z.literal('S256'),
  resource: z.url(),
})

/**
 * The part of an authorization request that has to be trusted before anything
 * else: until the client and its redirect URI are known to be registered, no
 * error may be reported by redirecting.
 */
export const authorizationTargetValidator = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  resource: z.url(),
  state: z.string().optional(),
})

export const tokenRequestValidator = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  code_verifier: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9\-._~]+$/),
  resource: z.url(),
})

export type AuthorizationRequestPayload = z.infer<typeof authorizationRequestValidator>
export type AuthorizationTarget = z.infer<typeof authorizationTargetValidator>
export type TokenRequestPayload = z.infer<typeof tokenRequestValidator>
