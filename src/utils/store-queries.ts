import { getBotSupabase } from './supabase'

export async function getUserByDiscordId(discordId: string) {
  const { data } = await getBotSupabase()
    .from('users')
    .select('*')
    .eq('discord_id', discordId)
    .single()
  return data
}

export async function getUserSubscription(userId: string) {
  const { data } = await getBotSupabase()
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

export async function getActiveSubscription(userId: string) {
  return getUserSubscription(userId)
}

export async function getGuildBots(guildId: string) {
  const { data } = await getBotSupabase()
    .from('guild_bots')
    .select('*')
    .eq('guild_id', guildId)
    .eq('status', 'active')
  return data ?? []
}

export async function activateBot(guildId: string, botSlug: string, config?: Record<string, unknown>) {
  const { data, error } = await getBotSupabase()
    .from('guild_bots')
    .upsert(
      {
        guild_id: guildId,
        bot_slug: botSlug,
        status: 'active',
        config: config ?? {},
        activated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id,bot_slug' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deactivateBot(guildId: string, botSlug: string) {
  const { data, error } = await getBotSupabase()
    .from('guild_bots')
    .update({ status: 'inactive', deactivated_at: new Date().toISOString() })
    .eq('guild_id', guildId)
    .eq('bot_slug', botSlug)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deactivateBotById(guildBotId: string) {
  const { data, error } = await getBotSupabase()
    .from('guild_bots')
    .update({ status: 'inactive', deactivated_at: new Date().toISOString() })
    .eq('id', guildBotId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getBotConfig(guildId: string, botSlug: string) {
  const { data } = await getBotSupabase()
    .from('guild_bots')
    .select('config')
    .eq('guild_id', guildId)
    .eq('bot_slug', botSlug)
    .single()
  return data?.config ?? null
}

export async function getGuildBotConfig(guildBotId: string) {
  const { data } = await getBotSupabase()
    .from('guild_bots')
    .select('config')
    .eq('id', guildBotId)
    .single()
  return data?.config ?? null
}

export async function updateBotConfig(guildId: string, botSlug: string, config: Record<string, unknown>) {
  const { data, error } = await getBotSupabase()
    .from('guild_bots')
    .update({ config })
    .eq('guild_id', guildId)
    .eq('bot_slug', botSlug)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGuildBotConfig(guildBotId: string, config: Record<string, unknown>) {
  const { data, error } = await getBotSupabase()
    .from('guild_bots')
    .update({ config })
    .eq('id', guildBotId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAvailablePlans() {
  const { data } = await getBotSupabase()
    .from('plans')
    .select('*')
    .order('price', { ascending: true })
  return data ?? []
}

export async function getPlanBotLimit(planSlug: string) {
  const { data } = await getBotSupabase()
    .from('plans')
    .select('max_bots')
    .eq('slug', planSlug)
    .single()
  return data?.max_bots ?? 0
}

export async function getCustomBotOrders(userId: string) {
  const { data } = await getBotSupabase()
    .from('custom_bot_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function canActivateBot(userId: string, guildId: string, botSlug: string) {
  const user = await getUserByDiscordId(userId)
  if (!user) return false

  const subscription = await getUserSubscription(user.id)
  if (!subscription) return false

  const planSlug = subscription.plans?.slug ?? subscription.plan_slug
  if (!planSlug) return false

  const maxBots = await getPlanBotLimit(planSlug)
  if (maxBots === 0) return false

  const activeBots = await getGuildBots(guildId)
  if (activeBots.length >= maxBots) return false

  const existing = activeBots.find((b: any) => b.bot_slug === botSlug)
  if (existing) return false

  return true
}
