export interface ApiKeyAuthContext {
  apiKeyId: string
  projectId: string
  environmentId: string
}

export interface JwtAuthContext {
  externalUserId: string
  projectId: string
  environmentId: string
  expiresAt: string
}

export interface AppVariables {
  requestId: string
  apiKeyAuth: ApiKeyAuthContext
  jwtAuth: JwtAuthContext
}

export interface AppBindings {
  Variables: AppVariables
}
