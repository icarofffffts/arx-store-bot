import {
  Guild,
  GuildMember,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  ApplicationCommandOptionType,
} from "discord.js"
import { SlashCommandBuilder } from "discord.js"
import { createCommand, colors } from "../../base"

interface ModerationConfig {
  log_channel_id?: string
  staff_role_id?: string
  mute_role_id?: string
}

const guildConfigs = new Map<string, ModerationConfig>()

export async function loadModerationModule(guild: Guild, config: Record<string, unknown>): Promise<void> {
  guildConfigs.set(guild.id, {
    log_channel_id: config.log_channel_id as string | undefined,
    staff_role_id: config.staff_role_id as string | undefined,
    mute_role_id: config.mute_role_id as string | undefined,
  })
  console.log(`[MODERATION] Modulo carregado para ${guild.name}`)
}

export async function unloadModerationModule(guild: Guild): Promise<void> {
  guildConfigs.delete(guild.id)
  console.log(`[MODERATION] Modulo descarregado de ${guild.name}`)
}

async function checkStaffPermission(member: GuildMember, guildId: string): Promise<boolean> {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true
  if (member.permissions.has(PermissionFlagsBits.BanMembers)) return true

  const config = guildConfigs.get(guildId)
  if (config?.staff_role_id && member.roles.cache.has(config.staff_role_id)) return true

  return false
}

async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  const config = guildConfigs.get(guild.id)
  if (!config?.log_channel_id) return null
  const channel = guild.channels.cache.get(config.log_channel_id)
  return channel?.type === 0 ? (channel as TextChannel) : null
}

async function sendLog(guild: Guild, embed: EmbedBuilder) {
  const log = await getLogChannel(guild)
  if (log) {
    await log.send({ embeds: [embed] }).catch(() => {})
  }
}

createCommand({
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bane um membro do servidor")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuario para banir").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do ban").setRequired(false)
    ),
  async run(interaction) {
    if (!interaction.guild || !interaction.guildId) {
      return interaction.reply({ content: "Use este comando em um servidor.", flags: [64] })
    }

    const member = interaction.member as GuildMember
    if (!(await checkStaffPermission(member, interaction.guildId))) {
      return interaction.reply({
        content: "Voce nao tem permissao para usar este comando.",
        flags: [64],
      })
    }

    const target = interaction.options.getUser("usuario", true)
    const reason = interaction.options.getString("motivo") ?? "Nenhum motivo informado"

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null)
    if (!targetMember) {
      return interaction.reply({ content: "Usuario nao encontrado no servidor.", flags: [64] })
    }

    if (!targetMember.bannable) {
      return interaction.reply({
        content: "Nao consigo banir este usuario. Verifique a hierarquia de cargos.",
        flags: [64],
      })
    }

    try {
      await targetMember.ban({ reason })

      const embed = new EmbedBuilder()
        .setTitle("Usuario Banido")
        .setDescription(`${target.tag} foi banido do servidor.`)
        .addFields(
          { name: "Moderador", value: interaction.user.tag, inline: true },
          { name: "Motivo", value: reason, inline: true }
        )
        .setColor(colors.danger)
        .setTimestamp()

      await interaction.reply({ embeds: [embed] })
      await sendLog(interaction.guild, embed)
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao banir usuario: ${err.message}`,
        flags: [64],
      })
    }
  },
})

createCommand({
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa um membro do servidor")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuario para expulsar").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo da expulsao").setRequired(false)
    ),
  async run(interaction) {
    if (!interaction.guild || !interaction.guildId) {
      return interaction.reply({ content: "Use este comando em um servidor.", flags: [64] })
    }

    const member = interaction.member as GuildMember
    if (!(await checkStaffPermission(member, interaction.guildId))) {
      return interaction.reply({
        content: "Voce nao tem permissao para usar este comando.",
        flags: [64],
      })
    }

    const target = interaction.options.getUser("usuario", true)
    const reason = interaction.options.getString("motivo") ?? "Nenhum motivo informado"

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null)
    if (!targetMember) {
      return interaction.reply({ content: "Usuario nao encontrado no servidor.", flags: [64] })
    }

    if (!targetMember.kickable) {
      return interaction.reply({
        content: "Nao consigo expulsar este usuario. Verifique a hierarquia de cargos.",
        flags: [64],
      })
    }

    try {
      await targetMember.kick(reason)

      const embed = new EmbedBuilder()
        .setTitle("Usuario Expulso")
        .setDescription(`${target.tag} foi expulso do servidor.`)
        .addFields(
          { name: "Moderador", value: interaction.user.tag, inline: true },
          { name: "Motivo", value: reason, inline: true }
        )
        .setColor(colors.warning)
        .setTimestamp()

      await interaction.reply({ embeds: [embed] })
      await sendLog(interaction.guild, embed)
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao expulsar usuario: ${err.message}`,
        flags: [64],
      })
    }
  },
})

createCommand({
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Silencia um membro no servidor")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuario para silenciar").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("minutos")
        .setDescription("Duracao do mute em minutos (0 = permanente)")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do mute").setRequired(false)
    ),
  async run(interaction) {
    if (!interaction.guild || !interaction.guildId) {
      return interaction.reply({ content: "Use este comando em um servidor.", flags: [64] })
    }

    const member = interaction.member as GuildMember
    if (!(await checkStaffPermission(member, interaction.guildId))) {
      return interaction.reply({
        content: "Voce nao tem permissao para usar este comando.",
        flags: [64],
      })
    }

    const config = guildConfigs.get(interaction.guildId)
    const muteRoleId = config?.mute_role_id
    if (!muteRoleId) {
      return interaction.reply({
        content: "Cargo de mute nao configurado. Use /config para definir `mute_role_id`.",
        flags: [64],
      })
    }

    const target = interaction.options.getUser("usuario", true)
    const minutes = interaction.options.getInteger("minutos") ?? 0
    const reason = interaction.options.getString("motivo") ?? "Nenhum motivo informado"

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null)
    if (!targetMember) {
      return interaction.reply({ content: "Usuario nao encontrado no servidor.", flags: [64] })
    }

    try {
      await targetMember.roles.add(muteRoleId, reason)

      const embed = new EmbedBuilder()
        .setTitle("Usuario Silenciado")
        .setDescription(`${target.tag} foi silenciado.`)
        .addFields(
          { name: "Moderador", value: interaction.user.tag, inline: true },
          { name: "Duracao", value: minutes > 0 ? `${minutes} minuto(s)` : "Permanente", inline: true },
          { name: "Motivo", value: reason, inline: true }
        )
        .setColor(colors.warning)
        .setTimestamp()

      await interaction.reply({ embeds: [embed] })
      await sendLog(interaction.guild, embed)

      if (minutes > 0) {
        setTimeout(async () => {
          try {
            await targetMember.roles.remove(muteRoleId, "Mute expirado").catch(() => {})
            const unmuteEmbed = new EmbedBuilder()
              .setTitle("Mute Expirado")
              .setDescription(`${target.tag} foi desmutado automaticamente.`)
              .setColor(colors.success)
            await sendLog(interaction.guild, unmuteEmbed)
          } catch {}
        }, minutes * 60 * 1000)
      }
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao silenciar usuario: ${err.message}`,
        flags: [64],
      })
    }
  },
})

createCommand({
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Limpa mensagens do canal")
    .addIntegerOption((opt) =>
      opt
        .setName("quantidade")
        .setDescription("Quantidade de mensagens para apagar (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  async run(interaction) {
    if (!interaction.guild || !interaction.guildId || !interaction.channel) {
      return interaction.reply({ content: "Use este comando em um servidor.", flags: [64] })
    }

    const member = interaction.member as GuildMember
    if (!(await checkStaffPermission(member, interaction.guildId))) {
      return interaction.reply({
        content: "Voce nao tem permissao para usar este comando.",
        flags: [64],
      })
    }

    const amount = interaction.options.getInteger("quantidade", true)

    try {
      const channel = interaction.channel as TextChannel
      const messages = await channel.bulkDelete(amount, true)

      const embed = new EmbedBuilder()
        .setTitle("Mensagens Limpas")
        .setDescription(`${messages.size} mensagens apagadas por ${interaction.user.tag}.`)
        .setColor(colors.info)
        .setTimestamp()

      await interaction.reply({ embeds: [embed], flags: [64] })
      await sendLog(interaction.guild, embed)
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao apagar mensagens: ${err.message}`,
        flags: [64],
      })
    }
  },
})
