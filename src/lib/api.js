let csrfTokenValue = null

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function setCsrfToken(token) {
  csrfTokenValue = typeof token === 'string' && token ? token : null
}

export function clearCsrfToken() {
  csrfTokenValue = null
}

export async function getCsrfToken() {
  const response = await apiRequest('/api/auth/csrf.php', { method: 'GET', skipCsrf: true })
  setCsrfToken(response.csrfToken)
  return csrfTokenValue
}

export async function apiRequest(path, options = {}) {
  const method = options.method || 'GET'
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (method !== 'GET' && method !== 'HEAD' && !options.skipCsrf) {
    if (!csrfTokenValue) await getCsrfToken()
    headers.set('X-CSRF-Token', csrfTokenValue)
  }

  const response = await fetch(path, {
    ...options,
    method,
    credentials: 'same-origin',
    headers,
    body: options.body !== undefined && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body,
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    throw new ApiError(body?.error || `Permintaan gagal (${response.status})`, response.status, body)
  }
  return body
}
