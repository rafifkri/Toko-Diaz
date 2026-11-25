import { createClient } from '@supabase/supabase-js'
import { REST_URL, token, jwt } from './harness'

/** Klien supabase-js yang menembak PostgREST langsung (tanpa prefiks /rest/v1) dengan JWT pengguna aktif. */
export const supabase = createClient('http://supabase.test', 'anon-placeholder', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (input, init) => {
      const url = String(input instanceof Request ? input.url : input).replace('http://supabase.test/rest/v1', REST_URL)
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${token() ?? jwt(null)}`)
      return fetch(url, { ...init, headers })
    },
  },
})
