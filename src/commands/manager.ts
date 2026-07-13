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

const WHITELABEL_FEE = 15.0

const PRICING_OPTIONS = [
  { id: "1m", label: "1 Mes", price: 19.90 },
  { id: "3m", label: "3 Meses", price: 49.90 },
  { id: "6m", label: "6 Meses", price: 89.90 },
  { id: "lifetime", label: "Vitalicio", price: 199.90 },
]

const BOT_ICONS: Record<string, string> = {
  ticket: "🎫",
  invite: "📨",
  mod: "🛡️",
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

  const botSlugs = ["ticket", "invite", "mod"]
  for (const slug of botSlugs) {
    const cfg = configs[slug]
    const label = `${BOT_ICONS[slug] ?? "🤖"} ${slug.charAt(0).toUpperCase() + slug.slice(1)}`
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
        .setLabel(slug.charAt(0).toUpperCase() + slug.slice(1))
        .setStyle(cfg?.active ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
    btnCount++

    if (btnCount % 2 === 0) {
      rows.push(currentRow)
      currentRow = new ActionRowBuilder<ButtonBuilder>()
    }
  }

  currentRow.addComponents(
    new ButtonBuilder()
      .setCustomId("mgr_custom")
      .setLabel("⭐ Personalizado")
      .setStyle(ButtonStyle.Primary)
  )
  btnCount++

  if (btnCount % 2 === 0) {
    rows.push(currentRow)
    currentRow = new ActionRowBuilder<ButtonBuilder>()
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow)
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
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
  const name = botSlug.charAt(0).toUpperCase() + botSlug.slice(1)

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
  customId: "mgr_refresh",
  types: ["Button"],
  async run(interaction: any) {
    const configs = await getSalesConfig(interaction.guildId!)
    const { embed, rows } = buildMainPanel(configs)
    await interaction.update({ embeds: [embed], components: rows })
  },
})

createResponder({
  customId: "mgr_bot:**",
  types: ["Button"],
  async run(interaction: any) {
    const botSlug = interaction.customId.split(":")[1]
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = configs[botSlug]
    const { embed, rows } = buildBotPanel(botSlug, cfg)
    await interaction.update({ embeds: [embed], components: rows })
  },
})

createResponder({
  customId: "mgr_back",
  types: ["Button"],
  async run(interaction: any) {
    const configs = await getSalesConfig(interaction.guildId!)
    const { embed, rows } = buildMainPanel(configs)
    await interaction.update({ embeds: [embed], components: rows })
  },
})

createResponder({
  customId: "mgr_channel:**",
  types: ["Button"],
  async run(interaction: any) {
    const botSlug = interaction.customId.split(":")[1]

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
  customId: "mgr_channelselect:**",
  types: ["ChannelSelect"],
  async run(interaction: any) {
    const botSlug = interaction.customId.split(":")[1]
    const channelId = interaction.values[0]
    console.log(`[Manager] channelselect: botSlug=${botSlug}, channelId=${channelId}`)
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = configs[botSlug]
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
  customId: "mgr_role:**",
  types: ["Button"],
  async run(interaction: any) {
    const botSlug = interaction.customId.split(":")[1]

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
  customId: "mgr_roleselect:**",
  types: ["RoleSelect"],
  async run(interaction: any) {
    const botSlug = interaction.customId.split(":")[1]
    const roleId = interaction.values[0]
    console.log(`[Manager] roleselect: botSlug=${botSlug}, roleId=${roleId}`)
    const configs = await getSalesConfig(interaction.guildId!)
    const cfg = configs[botSlug]
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
  customId: "mgr_post:**",
  types: ["Button"],
  async run(interaction: any) {
    const botSlug = interaction.customId.split(":")[1]
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

      const bots = await getDefaultBots()
      const botMeta = bots.find((b: any) => b.slug === botSlug)
      if (!botMeta) {
        return interaction.editReply({ content: "Bot nao encontrado nos settings." })
      }

      const embed = new EmbedBuilder()
        .setTitle(`🛒 ${botMeta.name}`)
        .setDescription(botMeta.description ?? "Adquira este bot para seu servidor")
        .setColor(0xe11d48)
        .setImage(interaction.guild!.iconURL() ?? null)
        .addFields(
          {
            name: "✨ Funcionalidades",
            value: ((botMeta.features as string[]) ?? [])
              .map((f: string, i: number) => `**${i + 1}.** ${f}`)
              .join("\n") || "Consulte o site",
          },
          {
            name: "💰 Planos",
            value: (botMeta.pricing ?? PRICING_OPTIONS).map(
              (p: any) => `**${p.label}** — R$ ${p.price.toFixed(2).replace(".", ",")}`
            ).join("\n"),
          },
          {
            name: "🏷️ Whitelabel",
            value: `+R$ ${WHITELABEL_FEE.toFixed(2).replace(".", ",")} para remover marcas ARX do bot`,
          },
          {
            name: "🔧 Como funciona",
            value:
              "1. Selecione a duracao abaixo\n" +
              "2. Escolha se quer whitelabel (sem marcas ARX)\n" +
              "3. Pague via Pix (QR Code)\n" +
              "4. Receba cargo de cliente + ativacao automatica",
          }
        )
        .setFooter({ text: "ARX Store" })

      const select = new StringSelectMenuBuilder()
        .setCustomId(`sales_buy:${botSlug}:${cfg.clienteRoleId}`)
        .setPlaceholder("Selecione a duracao...")
        .addOptions(
          (botMeta.pricing ?? PRICING_OPTIONS).map((p: any) => ({
            label: `${p.label} — R$ ${p.price.toFixed(2).replace(".", ",")}`,
            value: `${p.duration ?? p.id}:${p.price}:${p.label}`,
            emoji: (p.duration ?? p.id) === "lifetime" ? "⭐" : "💳",
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
  customId: "mgr_custom",
  types: ["Button"],
  async run(interaction: any) {
    const embed = new EmbedBuilder()
      .setTitle("⭐ Bot Personalizado")
      .setDescription(
        "Solicite um bot feito sob medida para suas necessidades.\n\n" +
        "**Como funciona:**\n" +
        "1. Voce descreve o que precisa\n" +
        "2. Nos fazemos um orcamento\n" +
        "3. Apos pagamento, desenvolvemos e entregamos\n\n" +
        "Use o botao abaixo para abrir um chamado de orcamento."
      )
      .setColor(0xf59e0b)

    const btn = new ButtonBuilder()
      .setCustomId("mgr_custom_order")
      .setLabel("Solicitar Orcamento")
      .setStyle(ButtonStyle.Success)

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
      ephemeral: true,
    })
  },
})

createResponder({
  customId: "mgr_custom_order",
  types: ["Button"],
  async run(interaction: any) {
    const channel = interaction.channel
    await interaction.reply({
      content:
        "Para solicitar um bot personalizado, abra um ticket no nosso Discord de suporte ou " +
        `acesse o site. Envie sua ideia neste canal ${channel} que nossa equipe entrara em contato.`,
      ephemeral: true,
    })
  },
})
