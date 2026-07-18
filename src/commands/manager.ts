import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} from "discord.js"
import { createCommand, createResponder, colors } from "../base"
import { getBotSupabase } from "../utils/supabase"
import { config } from "../config"


const WHITELABEL_FEE = 15.0

const PRICING_OPTIONS = [
  { id: "1m", label: "1 Mes", price: 19.90 },
  { id: "3m", label: "3 Meses", price: 49.90 },
  { id: "6m", label: "6 Meses", price: 89.90 },
  { id: "lifetime", label: "Vitalicio", price: 199.90 },
]

const BOT_ICONS: Record<string, string> = {
  "promisse-tickets": "🎫",
  "vendas-ghost-studio": "🛒",
  "custom_bot": "⭐",
}

const BOT_LABELS: Record<string, string> = {
  "promisse-tickets": "Promisse Tickets",
  "vendas-ghost-studio": "Vendas Ghost Studio",
  "custom_bot": "Bot Personalizado",
}

interface BotMeta {
  name: string
  description: string
  features: string[]
  pricing: typeof PRICING_OPTIONS
  ticketAddon?: boolean
}

const BOT_META: Record<string, BotMeta> = {
  "promisse-tickets": {
    name: "Promisse Tickets",
    description: "Sistema completo de tickets para suporte ao seu servidor Discord. Configure categorias, permissões de cargo, painéis personalizados e muito mais.",
    features: [
      "Painel de tickets totalmente personalizável",
      "Múltiplas categorias de ticket",
      "Sistema de avaliação de atendimento",
      "Ranking de atendentes",
      "Pagamentos via Pix dentro do ticket",
      "Modal de abertura com perguntas customizáveis",
      "Logs e histórico de tickets",
    ],
    pricing: PRICING_OPTIONS,
  },
  "vendas-ghost-studio": {
    name: "Vendas Ghost Studio",
    description: "Loja completa dentro do Discord. Venda produtos digitais com entrega automática, estoque, cupons e painel administrativo tudo em um só bot.",
    features: [
      "Loja de produtos digitais no Discord",
      "Entrega automática de produtos (.txt)",
      "Sistema de cupons com desconto percentual",
      "Carrinho de compras com threads privadas",
      "Painel administrativo completo",
      "Pagamento via Pix (QR Code)",
      "Vitrine de produtos atualizada em tempo real",
      "Rastreamento de pedidos",
    ],
    pricing: PRICING_OPTIONS,
    ticketAddon: true,
  },
  "custom_bot": {
    name: "Bot Personalizado",
    description: "Solicite um bot feito sob medida para suas necessidades exclusivas.",
    features: [
      "Desenvolvimento sob demanda (API, Banco de Dados, etc)",
      "Você descreve o que precisa",
      "Nós fazemos um orçamento justo",
      "Após pagamento, desenvolvemos e entregamos",
      "Garantia e suporte técnico",
    ],
    pricing: [],
  },
}

async function getDefaultBots() {
  const { data } = await getBotSupabase()
    .from("settings")
    .select("value")
    .eq("key", "default_bots")
    .single()
  if (!data?.value) return []
  return Array.isArray(data.value) ? data.value : []
}

interface SalesConfig {
  channelId: string
  clienteRoleId: string
  messageId?: string
  active: boolean
}

async function getSalesConfig(guildId: string): Promise<Record<string, SalesConfig>> {
  const { data, error } = await getBotSupabase()
    .from("settings")
    .select("value")
    .eq("key", `sales_config_${guildId}`)
    .single()
  console.log(`[Manager] getSalesConfig(${guildId}):`, JSON.stringify(data?.value), "error:", error?.message ?? "none")
  const raw = data?.value
  if (!raw) return {}
  if (typeof raw === "string") {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw as Record<string, SalesConfig>
}

async function saveSalesConfig(guildId: string, config: Record<string, SalesConfig>) {
  console.log(`[Manager] saveSalesConfig(${guildId}):`, JSON.stringify(config))
  const { error } = await getBotSupabase()
    .from("settings")
    .upsert({ key: `sales_config_${guildId}`, value: config }, { onConflict: "key" })
  if (error) console.error(`[Manager] saveSalesConfig ERROR:`, error.message)
}

function buildMainPanel(configs: Record<string, SalesConfig>) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ ARX Store Manager")
    .setDescription("Configure os anuncios de venda de cada bot abaixo.")
    .setColor(colors.primary)

  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  let currentRow = new ActionRowBuilder<ButtonBuilder>()
  let btnCount = 0

  const botSlugs = ["promisse-tickets", "vendas-ghost-studio", "custom_bot"]
  for (const slug of botSlugs) {
    const cfg = configs[slug]
    const label = `${BOT_ICONS[slug] ?? "🤖"} ${BOT_LABELS[slug] ?? slug}`
    const desc = cfg?.active
      ? `Ativo em <#${cfg.channelId}>`
      : "Nao configurado"

    embed.addFields({
      name: label,
      value: desc + `\nCargo: ${cfg?.clienteRoleId ? `<@&${cfg.clienteRoleId}>` : "—"}`,
      inline: true,
    })

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`mgr_bot:${slug}`)
        .setLabel(BOT_LABELS[slug] ?? slug)
        .setStyle(cfg?.active ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
    btnCount++

    if (btnCount % 2 === 0) {
      rows.push(currentRow)
      currentRow = new ActionRowBuilder<ButtonBuilder>()
    }
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow)
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("mgr_approve_payments")
        .setLabel("💰 Aprovar Pagamentos")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("mgr_refresh")
        .setLabel("📋 Recarregar")
        .setStyle(ButtonStyle.Secondary),
    )
  )

  return { embed, rows }
}

function buildBotPanel(botSlug: string, cfg: SalesConfig | undefined) {
  const icon = BOT_ICONS[botSlug] ?? "🤖"
  const name = BOT_LABELS[botSlug] ?? botSlug

  const embed = new EmbedBuilder()
    .setTitle(`${icon} Configurar — ${name} Bot`)
    .setColor(colors.primary)
    .addFields(
      {
        name: "Canal de Vendas",
        value: cfg?.channelId ? `<#${cfg.channelId}>` : "Nao definido",
        inline: true,
      },
      {
        name: "Cargo Cliente",
        value: cfg?.clienteRoleId ? `<@&${cfg.clienteRoleId}>` : "Nao definido",
        inline: true,
      },
      {
        name: "Status",
        value: cfg?.active && cfg?.channelId ? "✅ Ativo" : "🔴 Inativo",
        inline: true,
      },
    )

  const hasActive = cfg?.active && cfg?.channelId
  const hasAll = hasActive && cfg?.clienteRoleId

  const rows: ActionRowBuilder<ButtonBuilder>[] = []

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`mgr_post:${botSlug}`)
        .setLabel("📢 Postar Anuncio")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasAll),
      new ButtonBuilder()
        .setCustomId(`mgr_channel:${botSlug}`)
        .setLabel("📺 Canal")
        .setStyle(ButtonStyle.Primary),
    )
  )

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`mgr_role:${botSlug}`)
        .setLabel("👤 Cargo Cliente")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mgr_back`)
        .setLabel("↩️ Voltar")
        .setStyle(ButtonStyle.Secondary),
    )
  )

  return { embed, rows }
}

createCommand({
  scope: 'master',
  data: new SlashCommandBuilder()
    .setName("manager")
    .setDescription("Painel de gerenciamento da ARX Store"),
  async run(interaction: any) {
    if (!interaction.guildId) return interaction.reply({ content: "Use em um servidor.", ephemeral: true })

    const configs = await getSalesConfig(interaction.guildId)
    const { embed, rows } = buildMainPanel(configs)

    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_refresh",
  types: ["Button"],
  async run(interaction: any) {
    const configs = await getSalesConfig(interaction.guildId!)
    const { embed, rows } = buildMainPanel(configs)
    await interaction.update({ embeds: [embed], components: rows })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_bot:**",
  types: ["Button"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const botSlug = parts[1]
    if (!botSlug || !/^[a-z0-9_-]{1,64}$/.test(botSlug)) {
      return interaction.reply({ content: "Invalid bot slug.", ephemeral: true })
    }
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = configs[botSlug]
    const { embed, rows } = buildBotPanel(botSlug, cfg)
    await interaction.update({ embeds: [embed], components: rows })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_back",
  types: ["Button"],
  async run(interaction: any) {
    const configs = await getSalesConfig(interaction.guildId!)
    const { embed, rows } = buildMainPanel(configs)
    await interaction.update({ embeds: [embed], components: rows })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_channel:**",
  types: ["Button"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const botSlug = parts[1]
    if (!botSlug || !/^[a-z0-9_-]{1,64}$/.test(botSlug)) {
      return interaction.reply({ content: "Invalid bot slug.", ephemeral: true })
    }

    const select = new ChannelSelectMenuBuilder()
      .setCustomId(`mgr_channelselect:${botSlug}`)
      .setPlaceholder("Selecione o canal de vendas...")
      .setChannelTypes(ChannelType.GuildText)

    await interaction.update({
      content: "Selecione o canal onde o anuncio de venda sera postado:",
      embeds: [],
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select)],
    })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_channelselect:**",
  types: ["ChannelSelect"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const botSlug = parts[1]
    const channelId = interaction.values[0]
    if (!botSlug || !/^[a-z0-9_-]{1,64}$/.test(botSlug)) {
      return interaction.reply({ content: "Invalid bot slug.", ephemeral: true })
    }
    if (!channelId || !/^\d{17,20}$/.test(channelId)) {
      return interaction.reply({ content: "Invalid channel.", ephemeral: true })
    }
    console.log(`[Manager] channelselect: botSlug=${botSlug}, channelId=${channelId}`)
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = (configs[botSlug] ?? {}) as SalesConfig
    console.log(`[Manager] channelselect: existing cfg for ${botSlug}:`, JSON.stringify(cfg))

    const hasRole = !!cfg?.clienteRoleId
    configs[botSlug] = {
      channelId,
      clienteRoleId: cfg?.clienteRoleId ?? "",
      messageId: cfg?.messageId,
      active: hasRole,
    }
    console.log(`[Manager] channelselect: saving full config:`, JSON.stringify(configs))

    await saveSalesConfig(interaction.guildId!, configs)

    // Re-read to confirm it saved
    const verify = await getSalesConfig(interaction.guildId!)
    console.log(`[Manager] channelselect: verified config after save:`, JSON.stringify(verify))

    const updatedCfg = configs[botSlug]
    const { embed, rows } = buildBotPanel(botSlug, updatedCfg)
    await interaction.update({
      content: null,
      embeds: [embed],
      components: rows,
    })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_role:**",
  types: ["Button"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const botSlug = parts[1]
    if (!botSlug || !/^[a-z0-9_-]{1,64}$/.test(botSlug)) {
      return interaction.reply({ content: "Invalid bot slug.", ephemeral: true })
    }

    const select = new RoleSelectMenuBuilder()
      .setCustomId(`mgr_roleselect:${botSlug}`)
      .setPlaceholder("Selecione o cargo de cliente...")

    await interaction.update({
      content: "Selecione o cargo que sera dado aos clientes apos pagamento:",
      embeds: [],
      components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select)],
    })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_roleselect:**",
  types: ["RoleSelect"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const botSlug = parts[1]
    const roleId = interaction.values[0]
    if (!botSlug || !/^[a-z0-9_-]{1,64}$/.test(botSlug)) {
      return interaction.reply({ content: "Invalid bot slug.", ephemeral: true })
    }
    if (!roleId || !/^\d{17,20}$/.test(roleId)) {
      return interaction.reply({ content: "Invalid role.", ephemeral: true })
    }
    console.log(`[Manager] roleselect: botSlug=${botSlug}, roleId=${roleId}`)
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = (configs[botSlug] ?? {}) as SalesConfig
    console.log(`[Manager] roleselect: existing cfg for ${botSlug}:`, JSON.stringify(cfg))

    const hasChannel = !!cfg?.channelId
    configs[botSlug] = {
      channelId: cfg?.channelId ?? "",
      clienteRoleId: roleId,
      messageId: cfg?.messageId,
      active: hasChannel,
    }
    console.log(`[Manager] roleselect: saving full config:`, JSON.stringify(configs))

    await saveSalesConfig(interaction.guildId!, configs)

    // Re-read to confirm it saved
    const verify = await getSalesConfig(interaction.guildId!)
    console.log(`[Manager] roleselect: verified config after save:`, JSON.stringify(verify))

    const updatedCfg = configs[botSlug]
    const { embed, rows } = buildBotPanel(botSlug, updatedCfg)
    await interaction.update({
      content: null,
      embeds: [embed],
      components: rows,
    })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_post:**",
  types: ["Button"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const botSlug = parts[1]
    if (!botSlug || !/^[a-z0-9_-]{1,64}$/.test(botSlug)) {
      return interaction.reply({ content: "Invalid bot slug.", ephemeral: true })
    }
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = configs[botSlug]

    if (!cfg?.channelId || !cfg?.clienteRoleId) {
      return interaction.reply({
        content: "Configure o canal e o cargo de cliente antes de postar.",
        ephemeral: true,
      })
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const channel = await interaction.guild!.channels.fetch(cfg.channelId)
      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.editReply({ content: "Canal de vendas invalido ou nao encontrado." })
      }

      const botMeta = BOT_META[botSlug]
      if (!botMeta) {
        return interaction.editReply({ content: `Bot desconhecido: ${botSlug}` })
      }

      if (botSlug === "custom_bot") {
        const embed = new EmbedBuilder()
          .setTitle(`${BOT_ICONS[botSlug] ?? "⭐"} ${botMeta.name}`)
          .setDescription(botMeta.description)
          .setColor(0xf59e0b)
          .setImage(interaction.guild!.iconURL() ?? null)
          .addFields(
            {
              name: "📋 Como funciona",
              value: botMeta.features
                .map((f, i) => `**${i + 1}.** ${f}`)
                .join("\n"),
            }
          )
          .setFooter({ text: "ARX Store - Orcamentos" })

        const btn = new ButtonBuilder()
          .setCustomId(`sales_ticket_open:${cfg.clienteRoleId}`)
          .setLabel("Solicitar Orcamento")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Success)

        const msg = await (channel as any).send({
          embeds: [embed],
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
        })

        configs[botSlug].messageId = msg.id
        await saveSalesConfig(interaction.guildId!, configs)

        return interaction.editReply({
          content: `✅ Anuncio de **${botMeta.name}** postado em ${channel}!`,
        })
      }

      const ticketLine = botMeta.ticketAddon
        ? "\n**🎫 Addon Tickets** — +R$ 20,00 (opcional)"
        : ""

      const embed = new EmbedBuilder()
        .setTitle(`${BOT_ICONS[botSlug] ?? "🤖"} ${botMeta.name}`)
        .setDescription(botMeta.description)
        .setColor(0xe11d48)
        .setImage(interaction.guild!.iconURL() ?? null)
        .addFields(
          {
            name: "✨ Funcionalidades",
            value: botMeta.features
              .map((f, i) => `**${i + 1}.** ${f}`)
              .join("\n"),
          },
          {
            name: "💰 Planos",
            value: botMeta.pricing.map(
              (p) => `**${p.label}** — R$ ${p.price.toFixed(2).replace(".", ",")}`
            ).join("\n") + ticketLine,
          },
          {
            name: "🏷️ Whitelabel",
            value: `+R$ ${WHITELABEL_FEE.toFixed(2).replace(".", ",")} para remover marcas ARX do bot`,
          },
          {
            name: "🔧 Como funciona",
            value:
              "1. Selecione a duracao abaixo\n" +
              "2. Escolha a source do bot\n" +
              "3. Escolha se quer whitelabel (sem marcas ARX)\n" +
              "4. Pague via Pix (QR Code)\n" +
              "5. Receba cargo de cliente + bot ativado",
          }
        )
        .setFooter({ text: "ARX Store" })

      const select = new StringSelectMenuBuilder()
        .setCustomId(`sales_buy:${botSlug}:${cfg.clienteRoleId}`)
        .setPlaceholder("Selecione a duracao...")
        .addOptions(
          botMeta.pricing.map((p) => ({
            label: `${p.label} — R$ ${p.price.toFixed(2).replace(".", ",")}`,
            value: `${p.id}:${p.price}:${p.label}`,
            emoji: p.id === "lifetime" ? "⭐" : "💳",
          }))
        )

      const msg = await (channel as any).send({
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      })

      configs[botSlug].messageId = msg.id
      await saveSalesConfig(interaction.guildId!, configs)

      await interaction.editReply({
        content: `✅ Anuncio de **${botMeta.name}** postado em ${channel}!`,
      })
    } catch (err: any) {
      await interaction.editReply({ content: `Erro ao postar anuncio: ${err.message}` })
    }
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_approve_payments",
  types: ["Button"],
  async run(interaction: any) {
    if (!config.adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Apenas administradores podem aprovar pagamentos.",
        ephemeral: true,
      })
    }

    const guildId = interaction.guildId!
    const { data: orders } = await getBotSupabase()
      .from("custom_bot_orders")
      .select("id, user_id, bot_slug, status, metadata, mp_payment_id, created_at")
      .or("status.eq.awaiting_payment,status.eq.pending")
      .order("created_at", { ascending: false })
      .limit(25)

    if (!orders || orders.length === 0) {
      return interaction.reply({
        content: "Nenhum pagamento pendente encontrado.",
        ephemeral: true,
      })
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId("mgr_approve_select")
      .setPlaceholder("Selecione um pedido para aprovar...")
      .addOptions(
        orders.slice(0, 25).map((o: any) => {
          const meta = typeof o.metadata === "string" ? JSON.parse(o.metadata) : o.metadata
          const label = `#${(o.id as string).slice(0, 6)} — ${meta?.bot_name ?? o.bot_slug}`
          const desc = `R$ ${(meta?.total_price ?? 0).toFixed(2).replace(".", ",")} — ${o.status}`
          return {
            label: label.slice(0, 100),
            description: desc.slice(0, 100),
            value: o.id,
          }
        })
      )

    await interaction.reply({
      content: "Selecione o pedido que deseja aprovar manualmente:",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      ephemeral: true,
    })
  },
})

createResponder({
  scope: 'master',
  customId: "mgr_approve_select",
  types: ["StringSelect"],
  async run(interaction: any) {
    if (!config.adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Apenas administradores podem aprovar pagamentos.",
        ephemeral: true,
      })
    }

    const orderId = interaction.values[0]
    if (!orderId || orderId.length > 100) {
      return interaction.reply({ content: "Invalid order.", ephemeral: true })
    }

    const { data: order } = await getBotSupabase()
      .from("custom_bot_orders")
      .select("id, user_id, bot_slug, metadata, mp_payment_id")
      .eq("id", orderId)
      .single()

    if (!order) {
      return interaction.reply({ content: "Pedido nao encontrado.", ephemeral: true })
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const meta = typeof order.metadata === "string" ? JSON.parse(order.metadata) : (order.metadata ?? {})

      await getBotSupabase()
        .from("custom_bot_orders")
        .update({ status: "paid", mp_payment_id: order.mp_payment_id ?? "manual" })
        .eq("id", orderId)

      const guildId = meta.guild_id
      const clienteRoleId = meta.cliente_role_id
      const salesChannelId = meta.sales_channel_id

      const { data: user } = await getBotSupabase()
        .from("users")
        .select("discord_id, name")
        .eq("id", order.user_id)
        .single()

      const userId = user?.discord_id

      if (clienteRoleId && guildId && userId) {
        try {
          const guild = await interaction.client.guilds.fetch(guildId)
          const member = await guild.members.fetch(userId)
          await member.roles.add(clienteRoleId)
          console.log(`[Manager] Role ${clienteRoleId} adicionado a ${userId}`)
        } catch (e: any) {
          console.error(`[Manager] Erro ao adicionar role: ${e.message}`)
        }
      }

      if (salesChannelId && userId) {
        try {
          const channel = await interaction.client.channels.fetch(salesChannelId)
          if (channel && "send" in channel) {
            const embed = new EmbedBuilder()
              .setTitle("✅ Pagamento Aprovado!")
              .setColor(0x22c55e)
              .setDescription(
                `<@${userId}>, seu pagamento foi **aprovado manualmente** e o cargo de cliente foi liberado!\n\n` +
                "Clique no botao abaixo para **ativar seu bot**."
              )

            const activateBtn = new ButtonBuilder()
              .setCustomId(`activate_bot:${orderId}`)
              .setLabel("🚀 Ativar Bot")
              .setStyle(ButtonStyle.Success)

            await (channel as any).send({
              content: `<@${userId}>`,
              embeds: [embed],
              components: [new ActionRowBuilder<ButtonBuilder>().addComponents(activateBtn)],
            })
          }
        } catch (e: any) {
          console.error(`[Manager] Erro ao enviar msg de aprovacao: ${e.message}`)
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Pagamento Aprovado")
        .setDescription(
          `Pedido **#${(orderId as string).slice(0, 8)}** aprovado com sucesso!\n\n` +
          `Comprador: ${user?.name ?? "N/A"} (<@${userId ?? "N/A"}>)\n` +
          `Bot: ${meta.bot_name ?? order.bot_slug}`
        )
        .setColor(0x22c55e)

      await interaction.editReply({ embeds: [embed] })
    } catch (err: any) {
      await interaction.editReply({ content: `Erro ao aprovar pagamento: ${err.message}` })
    }
  },
})
