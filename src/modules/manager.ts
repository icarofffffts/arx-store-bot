import { Client, Guild } from "discord.js"
import { getBotSupabase } from "../utils/supabase"
import { loadTicketModule, unloadTicketModule } from "./tickets"
import { loadInviteModule, unloadInviteModule } from "./invites"
import { loadModerationModule, unloadModerationModule } from "./moderation"

interface GuildBotConfig {
  id: string
  guild_id: string
  bot_slug: string
  bot_name: string
  config: Record<string, unknown>
  subscription_id: string
}

const activeModules = new Map<string, Set<string>>()

export function isModuleActive(guildId: string, botSlug: string): boolean {
  const guildModules = activeModules.get(guildId)
  return guildModules ? guildModules.has(botSlug) : false
}

export async function loadGuildModules(client: Client) {
  const supabase = getBotSupabase()

  const { data: bots } = await supabase
    .schema("store")
    .from("guild_bots")
    .select("id, guild_id, bot_slug, bot_name, config, subscription_id")
    .eq("status", "active")

  if (!bots) return

  for (const bot of bots) {
    await enableModule(client, bot)
  }

  console.log(`[ARX STORE] ${bots.length} modulos carregados`)
}

async function enableModule(client: Client, bot: GuildBotConfig) {
  const guild = client.guilds.cache.get(bot.guild_id)
  if (!guild) return

  if (!activeModules.has(bot.guild_id)) {
    activeModules.set(bot.guild_id, new Set())
  }

  const guildModules = activeModules.get(bot.guild_id)!

  if (guildModules.has(bot.bot_slug)) return

  try {
    switch (bot.bot_slug) {
      case "ticket":
        await loadTicketModule(guild, bot.config)
        break
      case "invite":
        await loadInviteModule(guild, bot.config)
        break
      case "mod":
        await loadModerationModule(guild, bot.config)
        break
      default:
        console.warn(`[ARX STORE] Modulo desconhecido: ${bot.bot_slug}`)
        return
    }
    guildModules.add(bot.bot_slug)
    console.log(`[ARX STORE] Modulo ${bot.bot_slug} ativado em ${guild.name}`)
  } catch (err) {
    console.error(`[ARX STORE] Erro ao ativar modulo ${bot.bot_slug} em ${guild.name}:`, err)
  }
}

export async function disableModule(client: Client, guildId: string, botSlug: string) {
  const guild = client.guilds.cache.get(guildId)
  if (!guild) return

  const guildModules = activeModules.get(guildId)
  if (!guildModules?.has(botSlug)) return

  try {
    switch (botSlug) {
      case "ticket":
        await unloadTicketModule(guild)
        break
      case "invite":
        await unloadInviteModule(guild)
        break
      case "mod":
        await unloadModerationModule(guild)
        break
    }

    guildModules.delete(botSlug)
    if (guildModules.size === 0) activeModules.delete(guildId)
    console.log(`[ARX STORE] Modulo ${botSlug} desativado em ${guild.name}`)
  } catch (err) {
    console.error(`[ARX STORE] Erro ao desativar modulo ${botSlug} em ${guild.name}:`, err)
  }
}

export async function refreshGuildModules(client: Client) {
  const supabase = getBotSupabase()

  const { data: bots } = await supabase
    .schema("store")
    .from("guild_bots")
    .select("id, guild_id, bot_slug, bot_name, config, subscription_id")
    .eq("status", "active")

  if (!bots) return

  const currentModules = new Map<string, Set<string>>()
  for (const [guildId, slugs] of activeModules.entries()) {
    currentModules.set(guildId, new Set(slugs))
  }

  for (const bot of bots) {
    const guildSlugs = currentModules.get(bot.guild_id)
    if (guildSlugs) {
      guildSlugs.delete(bot.bot_slug)
    }
    await enableModule(client, bot)
  }

  for (const [guildId, toRemove] of currentModules.entries()) {
    for (const slug of toRemove) {
      await disableModule(client, guildId, slug)
    }
  }
}
