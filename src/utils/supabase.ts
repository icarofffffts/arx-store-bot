import { createClient } from '@supabase/supabase-js'
import { config } from '../config'

let _botSupabase: any = null

export function createBotSupabase() {
  if (_botSupabase) return _botSupabase
  _botSupabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
    db: { schema: 'store' },
  }) as any
  return _botSupabase
}

export function getBotSupabase() {
  return _botSupabase ?? createBotSupabase()
}
