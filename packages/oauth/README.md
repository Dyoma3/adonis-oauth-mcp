# @dinko/adonis-oauth

An OAuth 2.1 authorization server with PKCE, for AdonisJS applications that
need to hand access tokens to third-party clients.

The package owns the protocol. The application owns three things it cannot
delegate: **the consent screen**, **which token to issue**, and **the routes**.

```sh
npm i @dinko/adonis-oauth
node ace configure @dinko/adonis-oauth
```

Configuring writes these, and never overwrites what already exists:

| File | What to do with it |
| --- | --- |
| `config/oauth.ts` | Server settings, and the list of resources. It ships with none. |
| `database/migrations/..._create_oauth_authorization_codes_table.ts` | Adjust the `user_id` column to your users table, then migrate. |
| `app/controllers/oauth_controller.ts` | Yours from here: delegates to the package, and is where you add anything it does not cover. |
| `start/routes.ts` | The five routes, appended. Add your authentication middleware where it is marked. |
| `adonisrc.ts` | The provider and the commands. |

## Resources

A resource is something clients ask for access to. Each one lives in its own
file under `app/oauth_resources`, with its scopes, its clients and its token
issuing:

```sh
node ace make:oauth-resource mcp
```

The command registers it in `config/oauth.ts` for you:

```ts
import mcpResource from '../app/oauth_resources/mcp_resource.js'

export default defineConfig({
  // ...
  resources: [mcpResource],
})
```

The package has no opinion about what a resource is — an MCP server, an API, a
set of documents. It only routes tokens to the one that was asked for.

## Routes

Configuring appends them to `start/routes.ts`, with one decision left to you:

```ts
router
  .group(() => {
    router.post('authorize/approve', [OauthController, 'approveAuthorization'])
    router.post('authorize/deny', [OauthController, 'denyAuthorization'])
  })
  .use([
    // your authentication middleware, for example middleware.auth()
  ])
```

Approve and deny **must** be authenticated: the authorization code is bound to
the user granting access, so the endpoint has to know who that is. The token
endpoint is public, as the specification requires, and is where authorization
codes are redeemed, which makes it a good place for a throttle. The two
discovery endpoints are public and take no middleware.

## Handing the redirect back

Approve and deny answer `200 { redirect_to }` by default, and the consent
screen navigates itself:

```js
window.location.assign(response.redirect_to)
```

That is what a screen posting its decision with fetch or axios needs. An XHR
follows a 302 by re-issuing the request, so the page never navigates: the user
stays on the consent screen while the request lands cross-origin on the
client's callback and fails CORS.

Set `redirectMode: 'http'` when the consent screen is a plain HTML form. There
the browser is navigating the document, so it follows the 302 natively and the
user lands on the client.

## Reporting errors

Approve and deny resolve the client and its redirect URI before validating
anything else. Until both are known to be registered, an error cannot be
reported by redirecting — the request could be pointing anywhere — so it is
answered directly with `invalid_target`, `invalid_client` or `invalid_request`.

Once the redirect URI is trusted, every remaining error goes back to the client
through it, carrying `error` and the original `state`, as RFC 6749 section
4.1.2.1 requires. A malformed `code_challenge` reaches the client as
`error=invalid_request`, not as a validation response it cannot interpret.

## Issuing tokens

The type of token depends on the resource being accessed, so that decision
lives with each resource rather than in the controller. Once the package has
validated the request, consumed the authorization code and verified the PKCE
verifier, it calls:

```ts
issueToken: async ({ userId, scopes, client, resource, ctx }) => {
  const user = await User.find(userId)
  if (!user) return null // rejects the exchange with invalid_grant

  const expiresIn = 30 * 24 * 60 * 60
  const token = await User.accessTokens.create(user, scopes, {
    name: `oauth:${client.id}`,
    expiresIn,
  })

  return { accessToken: token.value!.release(), expiresIn }
}
```

`userId` is whatever was stored with the authorization code: the package has no
knowledge of your user model, and never loads it.

## The consent screen

The `GET /oauth/authorize` page is yours — Edge, Inertia or a separate
front end. The package only validates the request behind it:

```ts
const validation = server.validateAuthorizationRequest(request.qs())

if (!validation.valid) {
  return view.render('oauth/authorize', { error: validation.error })
}

return view.render('oauth/authorize', {
  client: validation.client,
  requestedScopes: validation.scopes,
  authorizationFields: validation.fields, // post these back to approve
})
```

Optional: applications rendering the screen elsewhere can skip it, since
approve and deny validate the request again on their own.

## Configuration

```ts
export default defineConfig({
  issuer: env.get('APP_URL'),
  authorizationEndpoint: `${env.get('APP_URL')}/oauth/authorize`,
  tokenEndpoint: `${env.get('APP_URL')}/oauth/token`,

  // optional
  redirectMode: 'json', // or 'http'
  tokenEndpointAuthMethods: ['none'],
  authorizationCodeTtlSeconds: 10 * 60,
  authorizationCodesTable: 'oauth_authorization_codes',
  authenticatedUserId: (ctx) => ctx.auth.user?.id, // defaults to this

  resources: [mcpResource],
})
```

Each resource declares:

| Field | |
| --- | --- |
| `id` | Slug used in `/.well-known/oauth-protected-resource/<id>`. |
| `resource` | Canonical resource indicator clients send as the `resource` parameter. |
| `resourceName` | Human-readable name, advertised through discovery. |
| `scopes` | Every scope the resource understands. |
| `clients` | `id`, `redirectUris`, `redirectUriPatterns`, `allowedScopes`. |
| `issueToken` | Mints the access token. |

## Matching redirect URIs

Registered URIs match exactly, with two deliberate exceptions for native
clients.

**Loopback** (`localhost`, `127.0.0.1`, `[::1]`) may vary the port, as RFC 8252
section 7.3 requires, unless the registration pins one. It may also append
segments *under* the registered path, which the specification does not allow:
Codex generates a random one, calling back on
`http://127.0.0.1:59137/callback/--52FXdsbEbv` against a registered
`http://127.0.0.1/callback`. Only descendants qualify, never a sibling, so
`/callbackevil/...` is rejected. Everything else — scheme, host, query,
fragment — still has to match.

**`redirectUriPatterns`** allows one `:param` segment, for the ChatGPT
connector, whose callback carries an id. Patterns are https only, must match
the origin exactly and have the same number of segments, and the generated
segment must be `[A-Za-z0-9_-]+`.

Both are extensions beyond OAuth 2.1, kept because real clients need them.
