import { Guild, GuildMember, Invite, EmbedBuilder } from "discord.js"
import { createEvent } from "../../base"
import { getBotSupabase } from "../../utils/supabase"

interface RewardTier {
  count: number
  label: string
}

interface InviteConfig {
  reward_tiers?: RewardTier[]
  dm_message?: string
  reward_dm_message?: string
}

const guildConfigs = new Map<string, InviteConfig>()
const inviteCache = new Map<string, Map<string, number>>()

export async function loadInviteModule(guild: Guild, config: Record<string, unknown>): Promise<void> {
  guildConfigs.set(guild.id, {
    reward_tiers: config.reward_tiers as RewardTier[] | undefined,
    dm_message: config.dm_message as string | undefined,
    reward_dm_message: config.reward_dm_message as string | undefined,
  })

  try {
    const invites = await (guild as any).invites.fetch().catch(() => new Map<string, Invite>())
    const counts = new Map<string, number>()
    for (const invite of invites.values()) {
      if (invite.inviter) {
        counts.set(invite.inviter.id, invite.uses ?? 0)
      }
    }
    inviteCache.set(guild.id, counts)
  } catch (err) {
    console.warn(`[INVITES] Erro ao cachear invites de ${guild.name}:`, err)
  }

  console.log(`[INVITES] Modulo carregado para ${guild.name}`)
}

export async function unloadInviteModule(guild: Guild): Promise<void> {
  guildConfigs.delete(guild.id)
  inviteCache.delete(guild.id)
  console.log(`[INVITES] Modulo descarregado de ${guild.name}`)
}

createEvent({
  name: "inviteCreate",
  async run(invite: Invite) {
    if (!invite.guild) return
    const guildId = invite.guild.id
    if (!guildConfigs.has(guildId)) return

    try {
      const invites = await (invite.guild as any).invites.fetch().catch(() => new Map<string, Invite>())
      const counts = new Map<string, number>()
      for (const inv of invites.values()) {
        if (inv.inviter) {
          counts.set(inv.inviter.id, inv.uses ?? 0)
        }
      }
      inviteCache.set(guildId, counts)
    } catch {}
  },
})

createEvent({
  name: "guildMemberAdd",
  async run(member: GuildMember) {
    const guildId = member.guild.id
    const config = guildConfigs.get(guildId)
    if (!config) return

    try {
      const newInvites = await (member.guild as any).invites.fetch().catch(() => new Map<string, Invite>())
      const oldInvites = inviteCache.get(guildId) ?? new Map()

      let inviterId: string | undefined

      for (const [code, invite] of newInvites) {
        const oldUses = oldInvites.get(invite.inviter?.id ?? "") ?? 0
        const newUses = invite.uses ?? 0
        if (newUses > oldUses && invite.inviter) {
          inviterId = invite.inviter.id
          break
        }
      }

      const newCounts = new Map<string, number>()
      for (const invite of newInvites.values()) {
        if (invite.inviter) {
          newCounts.set(invite.inviter.id, invite.uses ?? 0)
        }
      }
      inviteCache.set(guildId, newCounts)

      if (config.dm_message) {
        await member.send({ content: config.dm_message }).catch(() => {})
      }

      if (!inviterId || inviterId === member.id) return

      const tiers = config.reward_tiers ?? []
      if (tiers.length === 0) return

      const inviterInvites = newCounts.get(inviterId) ?? 0

      for (const tier of tiers.sort((a, b) => b.count - a.count)) {
        if (inviterInvites === tier.count) {
          try {
            const inviter = await member.guild.members.fetch(inviterId).catch(() => null)
            if (inviter) {
              const msg = config.reward_dm_message?.replace("{tier}", tier.label) ??
                `Parabens! Voce atingiu ${inviterInvites} convites e desbloqueou: **${tier.label}**!`

              await inviter.send({ content: msg }).catch(() => {})
            }
          } catch {}

          try {
            const supabase = getBotSupabase()
            await supabase
              .schema("store")
              .from("invite_rewards")
              .insert({
                guild_id: guildId,
                inviter_id: inviterId,
                tier_count: tier.count,
                tier_label: tier.label,
                invited_user_id: member.id,
              })
          } catch {}
          break
        }
      }
    } catch (err) {
      console.error(`[INVITES] Erro em guildMemberAdd para ${member.guild.name}:`, err)
    }
  },
})
