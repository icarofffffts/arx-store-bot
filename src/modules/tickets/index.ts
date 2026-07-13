import {
  Guild,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  CategoryChannel,
  MessageComponentInteraction,
  ButtonInteraction,
  Collection,
  GuildMember,
  User,
  AttachmentBuilder,
} from "discord.js"
import { createCommand, createResponder, colors, res } from "../../base"
import { SlashCommandBuilder } from "discord.js"

const guildConfigs = new Map<string, Record<string, unknown>>()
const ticketPanels = new Map<string, { channelId: string; messageId: string }>()
const openTickets = new Map<string, { ownerId: string; createdAt: number; claimedBy?: string }>()

export async function loadTicketModule(guild: Guild, config: Record<string, unknown>): Promise<void> {
  guildConfigs.set(guild.id, config)
  console.log(`[TICKETS] Modulo carregado para ${guild.name}`)
}

export async function unloadTicketModule(guild: Guild): Promise<void> {
  guildConfigs.delete(guild.id)
  ticketPanels.delete(guild.id)

  for (const [channelId, ticket] of openTickets.entries()) {
    const channel = guild.channels.cache.get(channelId)
    if (channel && channel.guildId === guild.id) {
      openTickets.delete(channelId)
    }
  }

  console.log(`[TICKETS] Modulo descarregado de ${guild.name}`)
}

createCommand({
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configura o sistema de tickets")
    .addStringOption((opt) =>
      opt
        .setName("modulo")
        .setDescription("Modulo para configurar")
        .setRequired(true)
        .addChoices({ name: "Ticket", value: "ticket" })
    )
    .addChannelOption((opt) =>
      opt
        .setName("canal")
        .setDescription("Canal onde o painel de tickets sera enviado")
        .setRequired(true)
    ),
  async run(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content: "Este comando so pode ser usado em um servidor.",
        flags: [64],
      })
    }

    const member = interaction.member as GuildMember
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "Voce precisa da permissao **Gerenciar Servidor** para usar este comando.",
        flags: [64],
      })
    }

    const moduleName = interaction.options.getString("modulo", true)
    if (moduleName !== "ticket") {
      return interaction.reply({ content: "Modulo nao suportado.", flags: [64] })
    }

    const channel = interaction.options.getChannel("canal", true)
    if (channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: "O canal precisa ser um canal de texto.",
        flags: [64],
      })
    }

    const config = guildConfigs.get(interaction.guildId) ?? {}

    const embed = new EmbedBuilder()
      .setTitle("Central de Tickets")
      .setDescription(
        [
          "Bem-vindo a central de tickets ARX Store!",
          "",
          "Clique no botao abaixo para abrir um ticket e nossa equipe ira atende-lo(a) o mais rapido possivel.",
          "",
          "**Como funciona:**",
          "Um canal privado sera criado para voce.",
          "Apenas voce e a equipe poderao ve-lo.",
          "",
          "**Regras:**",
          "Seja respeitoso.",
          "Descreva seu problema com detalhes.",
          "Nao abra tickets duplicados.",
        ].join("\n")
      )
      .setColor(colors.purple)

    const button = new ButtonBuilder()
      .setCustomId("ticket/open")
      .setLabel("Abrir Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫")

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

    const textChannel = channel as TextChannel
    const panelMessage = await textChannel.send({
      embeds: [embed],
      components: [row],
    })

    ticketPanels.set(interaction.guildId, {
      channelId: textChannel.id,
      messageId: panelMessage.id,
    })

    await interaction.reply({
      content: "Painel de tickets criado com sucesso!",
      flags: [64],
    })
  },
})

createResponder({
  customId: "ticket/open",
  types: ["Button"],
  async run(interaction: ButtonInteraction) {
    if (!interaction.guild || !interaction.guildId) return

    const config = guildConfigs.get(interaction.guildId) ?? {}
    const staffRoleId = config.staff_role_id as string | undefined
    const categoryId = config.category_id as string | undefined

    await interaction.deferReply({ flags: [64] })

    const existingTicket = findExistingTicket(interaction.guildId, interaction.user.id)
    if (existingTicket) {
      const chan = interaction.guild.channels.cache.get(existingTicket)
      await interaction.editReply({
        content: `Voce ja possui um ticket aberto: <#${chan?.id ?? existingTicket}>`,
      })
      return
    }

    const category = categoryId
      ? (interaction.guild.channels.cache.get(categoryId) as CategoryChannel)
      : undefined

    const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20)}`

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category?.id ?? undefined,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      })

      if (staffRoleId) {
        await ticketChannel.permissionOverwrites.create(staffRoleId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        })
      }

      openTickets.set(ticketChannel.id, {
        ownerId: interaction.user.id,
        createdAt: Date.now(),
      })

      const embed = new EmbedBuilder()
        .setTitle("Ticket Aberto")
        .setDescription(
          [
            `Ola ${interaction.user}, sua solicitacao foi registrada.`,
            "",
            "Descreva seu problema e um membro da equipe ira atende-lo em breve.",
            "",
            "Acoes disponiveis:",
            "Clique em **Fechar Ticket** para encerrar este atendimento.",
          ].join("\n")
        )
        .setColor(colors.success)
        .setFooter({ text: `Ticket ID: ${ticketChannel.id}` })

      const closeButton = new ButtonBuilder()
        .setCustomId(`ticket/close/${ticketChannel.id}`)
        .setLabel("Fechar Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")

      const claimButton = new ButtonBuilder()
        .setCustomId(`ticket/claim/${ticketChannel.id}`)
        .setLabel("Assumir")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🙋")

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        claimButton,
        closeButton
      )

      await ticketChannel.send({
        content: `🎫 ${interaction.user} abriu um ticket.`,
        embeds: [embed],
        components: [row],
      })

      await interaction.editReply({
        content: `Ticket criado: <#${ticketChannel.id}>`,
      })
    } catch (err) {
      console.error("[TICKETS] Erro ao criar ticket:", err)
      await interaction.editReply({
        content: "Erro ao criar o ticket. Verifique as permissoes do bot.",
      })
    }
  },
})

createResponder({
  customId: "ticket/close/:channelId",
  types: ["Button"],
  async run(interaction: ButtonInteraction, params: { channelId: string }) {
    if (!interaction.guild) return

    const channel = interaction.guild.channels.cache.get(params.channelId) as TextChannel
    if (!channel) {
      await interaction.reply({ content: "Canal nao encontrado.", flags: [64] })
      return
    }

    await interaction.deferReply({ flags: [64] })

    const ticket = openTickets.get(params.channelId)

    const transcript = (await channel.messages.fetch({ limit: 100 }))
      .reverse()
      .map(
        (m) =>
          `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || "(sem texto)"}`
      )
      .join("\n")

    const transcriptBuffer = Buffer.from(transcript, "utf-8")

    const ownerId = ticket?.ownerId
    if (ownerId) {
      try {
        const owner = await interaction.guild.members.fetch(ownerId)
        const embed = new EmbedBuilder()
          .setTitle("Ticket Fechado")
          .setDescription(
            `Seu ticket em **${interaction.guild.name}** foi fechado.`
          )
          .addFields({
            name: "Transcript",
            value: "O transcript esta em anexo.",
          })
          .setColor(colors.danger)

        await owner.send({
          embeds: [embed],
          files: [
            new AttachmentBuilder(transcriptBuffer, {
              name: `transcript-${params.channelId}.txt`,
            }),
          ],
        }).catch(() => {})
      } catch {}
    }

    await channel.delete().catch(() => {})
    openTickets.delete(params.channelId)

    await interaction.editReply({
      content: "Ticket fechado com sucesso.",
    })
  },
})

createResponder({
  customId: "ticket/claim/:channelId",
  types: ["Button"],
  async run(interaction: ButtonInteraction, params: { channelId: string }) {
    if (!interaction.guild) return

    const config = guildConfigs.get(interaction.guild.id) ?? {}
    const staffRoleId = config.staff_role_id as string | undefined

    if (staffRoleId) {
      const member = interaction.member as GuildMember
      if (!member.roles.cache.has(staffRoleId)) {
        await interaction.reply({
          content: "Apenas membros da equipe podem assumir tickets.",
          flags: [64],
        })
        return
      }
    }

    const ticket = openTickets.get(params.channelId)
    if (!ticket) {
      await interaction.reply({
        content: "Ticket nao encontrado.",
        flags: [64],
      })
      return
    }

    if (ticket.claimedBy) {
      await interaction.reply({
        content: `Este ticket ja foi assumido por <@${ticket.claimedBy}>.`,
        flags: [64],
      })
      return
    }

    ticket.claimedBy = interaction.user.id

    const channel = interaction.guild.channels.cache.get(params.channelId) as TextChannel
    if (channel) {
      await channel.send({
        content: `🙋 ${interaction.user} assumiu este ticket.`,
      })
    }

    await interaction.reply({
      content: "Voce assumiu este ticket!",
      flags: [64],
    })
  },
})

function findExistingTicket(guildId: string, userId: string): string | undefined {
  for (const [channelId, ticket] of openTickets.entries()) {
    if (ticket.ownerId === userId) return channelId
  }
  return undefined
}
