import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, TextChannel, ThreadAutoArchiveDuration } from "discord.js"
import { createResponder, colors } from "../../base"
import { config } from "../../config"

// Abre o ticket para o usuário informando "Orcamento - Seu Nome"
createResponder({
  scope: 'master',
  customId: "sales_ticket_open:**",
  types: ["Button"],
  async run(interaction: any) {
    const clienteRoleId = interaction.customId.split(":")[1]
    
    // Tem que estar num canal de texto pra criar uma thread privada
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: "Nao foi possivel abrir o ticket neste canal.",
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const channel = interaction.channel as TextChannel
      
      const thread = await channel.threads.create({
        name: `orcamento-${interaction.user.username}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: "Orcamento Bot Personalizado",
      })

      // Adiciona o comprador na thread
      await thread.members.add(interaction.user.id)

      // Adiciona os admin (se possivel/necessario)
      for (const adminId of config.adminUserIds) {
        try {
          await thread.members.add(adminId)
        } catch { } // ignora erro se o admin nao tiver no servidor
      }

      const embed = new EmbedBuilder()
        .setTitle("🎫 Orçamento de Bot Personalizado")
        .setDescription(
          `Ola <@${interaction.user.id}>!\n\n` +
          "Descreva o máximo de detalhes do bot que voce precisa:\n" +
          "1. Qual o foco principal do bot?\n" +
          "2. Liste as funções desejadas.\n" +
          "3. Precisa de banco de dados ou painel?\n\n" +
          "Nossa equipe analisará e retornará com um orçamento. Aguarde o atendimento."
        )
        .setColor(colors.primary)
        .setFooter({ text: "ARX Store - Suporte" })

      const rows = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("sales_ticket_close")
          .setLabel("🔒 Fechar Ticket")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("sales_ticket_claim")
          .setLabel("🙋‍♂️ Assumir")
          .setStyle(ButtonStyle.Primary)
      )

      await thread.send({
        content: `<@${interaction.user.id}>`,
        embeds: [embed],
        components: [rows]
      })

      await interaction.editReply({
        content: `✅ Ticket de orçamento aberto em <#${thread.id}>!`
      })
    } catch (err: any) {
      await interaction.editReply({
        content: `❌ Ocorreu um erro ao criar seu ticket: ${err.message}`
      })
    }
  }
})

// Assumir o ticket
createResponder({
  scope: 'master',
  customId: "sales_ticket_claim",
  types: ["Button"],
  async run(interaction: any) {
    if (!config.adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Somente staffs podem assumir tickets.",
        ephemeral: true
      })
    }
    
    await interaction.reply({
      content: `👋 O staff <@${interaction.user.id}> assumiu o ticket e ira lhe atender!`,
    })
    
    // Atualiza o top message pra remover o botao assumir e manter o fechar
    try {
      const msg = interaction.message
      const rows = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("sales_ticket_close")
          .setLabel("🔒 Fechar Ticket")
          .setStyle(ButtonStyle.Danger)
      )
      await msg.edit({ components: [rows] })
      
      const thread = interaction.channel
      await thread.setName(`assumido-${interaction.user.username}`)
    } catch {}
  }
})

// Fechar o ticket
createResponder({
  scope: 'master',
  customId: "sales_ticket_close",
  types: ["Button"],
  async run(interaction: any) {
    if (!config.adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Somente staffs podem fechar tickets de orcamento.",
        ephemeral: true
      })
    }

    await interaction.deferReply()

    const embed = new EmbedBuilder()
      .setTitle("🔒 Ticket Fechado")
      .setDescription(`Este ticket foi finalizado por <@${interaction.user.id}>.`)
      .setColor(colors.danger)

    const rows = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("sales_ticket_delete")
        .setLabel("🗑️ Deletar Ticket")
        .setStyle(ButtonStyle.Danger)
    )

    await interaction.editReply({
      embeds: [embed],
      components: [rows]
    })
    
    try {
      const thread = interaction.channel
      await thread.setName(`fechado`)
      await thread.setArchived(true)
    } catch {}
  }
})

// Deletar o ticket
createResponder({
  scope: 'master',
  customId: "sales_ticket_delete",
  types: ["Button"],
  async run(interaction: any) {
    if (!config.adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Somente staffs podem deletar tickets.",
        ephemeral: true
      })
    }
    
    await interaction.reply({ content: "O ticket sera deletado em 3 segundos..." })
    
    setTimeout(async () => {
      try {
        const thread = interaction.channel
        await thread.delete("Ticket deletado via bot")
      } catch {}
    }, 3000)
  }
})
