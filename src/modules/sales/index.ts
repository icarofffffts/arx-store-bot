import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Message,
  AttachmentBuilder,
} from "discord.js"
import { createCommand, createResponder, createEvent } from "../../base"
import { getBotSupabase } from "../../utils/supabase"
import { createPixPayment, getPaymentStatus } from "../../utils/mercadopago"

const WHITELABEL_FEE = 15.0

const PRICING_OPTIONS = [
  { id: "1m", label: "1 Mes", price: 19.90 },
  { id: "3m", label: "3 Meses", price: 49.90 },
  { id: "6m", label: "6 Meses", price: 89.90 },
  { id: "lifetime", label: "Vitalicio", price: 199.90 },
]

const pendingTokenSubmissions = new Map<string, { orderId: string }>()

async function getDefaultBots() {
  const supabase = getBotSupabase()
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "default_bots")
    .single()
  if (!data?.value) return []
  return Array.isArray(data.value) ? data.value : []
}

async function getUserByDiscordId(discordId: string) {
  const { data } = await getBotSupabase()
    .from("users")
    .select("*")
    .eq("discord_id", discordId)
    .single()
  return data
}

async function createOrder(discordId: string, botSlug: string, metadata: any = {}) {
  const supabase = getBotSupabase()
  const user = await getUserByDiscordId(discordId)
  if (!user) return null
  const { data: order } = await supabase
    .from("custom_bot_orders")
    .insert({ user_id: user.id, bot_slug: botSlug, status: "pending", metadata })
    .select()
    .single()
  return order
}

async function updateOrder(orderId: string, fields: Record<string, any>) {
  await getBotSupabase().from("custom_bot_orders").update(fields).eq("id", orderId)
}

async function getPaidOrdersNeedingToken() {
  const { data } = await getBotSupabase()
    .from("custom_bot_orders")
    .select("*, users(discord_id)")
    .eq("status", "paid")
    .is("bot_token", null)
    .limit(10)
  return data ?? []
}

async function submitBotToken(orderId: string, botToken: string, clientId: string) {
  await getBotSupabase()
    .from("custom_bot_orders")
    .update({ bot_token: botToken, bot_client_id: clientId, status: "deploying" })
    .eq("id", orderId)
}

async function pollPaymentUntilDone(p: {
  paymentId: number
  orderId: string
  client: Client
  guildId: string
  userId: string
  clienteRoleId: string
}) {
  const { paymentId, orderId, client, guildId, userId, clienteRoleId } = p

  for (let attempt = 0; attempt < 72; attempt++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const status = await getPaymentStatus(paymentId)

      if (status === "approved") {
        await updateOrder(orderId, { status: "paid", mp_payment_id: String(paymentId) })

        if (clienteRoleId) {
          try {
            const guild = await client.guilds.fetch(guildId)
            const member = await guild.members.fetch(userId)
            await member.roles.add(clienteRoleId)
            console.log(`[SALES] Cargo ${clienteRoleId} adicionado a ${member.user.tag}`)
          } catch (e) {
            console.error("[SALES] Erro ao setar cargo:", e)
          }
        }

        try {
          const user = await client.users.fetch(userId)
          await user.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("✅ Pagamento Aprovado!")
                .setColor(0x22c55e)
                .setDescription(
                  "Seu pagamento foi confirmado e o cargo de cliente foi liberado!\n\n" +
                  "Para ativar seu bot, envie o token e Client ID:\n" +
                  "`!token SEU_TOKEN_AQUI CLIENT_ID_AQUI`\n\n" +
                  "**Como obter:** https://discord.com/developers/applications"
                ),
            ],
          }).catch(() => {})
          pendingTokenSubmissions.set(userId, { orderId })
        } catch {}

        return
      }

      if (["rejected", "cancelled", "refunded"].includes(status)) {
        await updateOrder(orderId, { status })
        return
      }
    } catch {}
  }
}

createCommand({
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configura sistemas do ARX Store")
    .addSubcommand((s) =>
      s
        .setName("loja")
        .setDescription("Cria painel de vendas de um bot com QR Code Pix")
        .addStringOption((o) =>
          o.setName("bot").setDescription("Bot para vender").setRequired(true)
            .addChoices(
              { name: "Ticket Bot", value: "ticket" },
              { name: "Invite Bot", value: "invite" },
              { name: "Mod Bot", value: "mod" },
            )
        )
        .addRoleOption((o) =>
          o.setName("cargo_cliente")
            .setDescription("Cargo dado ao cliente apos pagamento")
            .setRequired(true)
        )
    ),
  async run(interaction: any) {
    if (!interaction.guild?.channels) return

    const botSlug = interaction.options.getString("bot", true)
    const clienteRole = interaction.options.getRole("cargo_cliente", true)
    const bots = await getDefaultBots()
    const botMeta = bots.find((b: any) => b.slug === botSlug)
    if (!botMeta) {
      return interaction.reply({ content: "Bot nao encontrado nos settings.", ephemeral: true })
    }

    const embed = new EmbedBuilder()
      .setTitle(`🛒 ${botMeta.name}`)
      .setDescription(botMeta.description ?? "Adquira este bot para seu servidor")
      .setColor(0xe11d48)
      .setThumbnail(interaction.guild.iconURL() ?? null)
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
            "1. Selecione a duracao\n" +
            "2. Escolha se quer whitelabel\n" +
            "3. Pague via PIX (QR Code)\n" +
            "4. Receba cargo de cliente + ativacao do bot",
        }
      )
      .setFooter({ text: "ARX Store" })

    const select = new StringSelectMenuBuilder()
      .setCustomId(`sales_buy:${botSlug}:${clienteRole.id}`)
      .setPlaceholder("Selecione a duracao...")
      .addOptions(
        (botMeta.pricing ?? PRICING_OPTIONS).map((p: any) => ({
          label: `${p.label} — R$ ${p.price.toFixed(2).replace(".", ",")}`,
          value: `${p.duration ?? p.id}:${p.price}:${p.label}`,
          emoji: (p.duration ?? p.id) === "lifetime" ? "⭐" : "💳",
        }))
      )

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    })
  },
})

createResponder({
  customId: "sales_buy:**",
  types: ["StringSelect"],
  async run(interaction: any) {
    const customIdParts = interaction.customId.split(":")
    const botSlug = customIdParts[1]
    const clienteRoleId = customIdParts[2]

    const [duration, priceStr, ...labelParts] = interaction.values[0].split(":")
    const label = decodeURIComponent(labelParts.join(":"))
    const basePrice = parseFloat(priceStr)

    const bots = await getDefaultBots()
    const botMeta = bots.find((b: any) => b.slug === botSlug)

    const embed = new EmbedBuilder()
      .setTitle("🏷️ Deseja Whitelabel?")
      .setColor(0xe11d48)
      .setDescription(
        `**Bot:** ${botMeta?.name ?? botSlug}\n` +
        `**Duracao:** ${label}\n` +
        `**Preco base:** R$ ${basePrice.toFixed(2).replace(".", ",")}\n` +
        `**Whitelabel:** +R$ ${WHITELABEL_FEE.toFixed(2).replace(".", ",")}\n\n` +
        "Whitelabel remove todas as marcas ARX do bot. Seu cliente nao ve \"ARX\" em nenhum lugar — parece um bot exclusivo feito so para voce."
      )

    const payload = `${botSlug}:${duration}:${basePrice}:${encodeURIComponent(label)}:${clienteRoleId}`

    const simBtn = new ButtonBuilder()
      .setCustomId(`sales_wl:yes:${payload}`)
      .setLabel(`Sim (+R$ ${WHITELABEL_FEE.toFixed(2).replace(".", ",")})`)
      .setStyle(ButtonStyle.Success)

    const naoBtn = new ButtonBuilder()
      .setCustomId(`sales_wl:no:${payload}`)
      .setLabel("Nao (padrao ARX)")
      .setStyle(ButtonStyle.Secondary)

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(simBtn, naoBtn)],
      ephemeral: true,
    })
  },
})

createResponder({
  customId: "sales_wl:**",
  types: ["Button"],
  async run(interaction: any) {
    const parts = interaction.customId.split(":")
    const choice = parts[1]
    const botSlug = parts[2]
    const duration = parts[3]
    const basePrice = parseFloat(parts[4])
    const label = decodeURIComponent(parts[5])
    const clienteRoleId = parts[6]
    const whitelabel = choice === "yes"
    const totalPrice = whitelabel ? basePrice + WHITELABEL_FEE : basePrice

    await interaction.deferReply({ ephemeral: true })

    const user = await getUserByDiscordId(interaction.user.id)
    if (!user?.email) {
      return interaction.editReply({
        content: "Sua conta nao tem email. Vincule no site primeiro.",
      })
    }

    const bots = await getDefaultBots()
    const botMeta = bots.find((b: any) => b.slug === botSlug)

    const order = await createOrder(interaction.user.id, botSlug, {
      bot_name: botMeta?.name ?? botSlug,
      duration,
      duration_label: label,
      base_price: basePrice,
      whitelabel,
      total_price: totalPrice,
      cliente_role_id: clienteRoleId,
      guild_id: interaction.guildId,
    })

    if (!order) {
      return interaction.editReply({ content: "Erro ao criar pedido." })
    }

    let pixResult
    try {
      pixResult = await createPixPayment({
        amount: totalPrice,
        description: `${botMeta?.name ?? botSlug} — ${label}${whitelabel ? " (Whitelabel)" : ""}`,
        email: user.email,
        firstName: interaction.user.username,
        orderId: order.id,
      })
    } catch (err: any) {
      return interaction.editReply({ content: `Erro ao gerar Pix: ${err.message}` })
    }

    await updateOrder(order.id, { mp_payment_id: String(pixResult.id), status: "awaiting_payment" })

    const qrEmbed = new EmbedBuilder()
      .setTitle("📱 Pague com Pix")
      .setColor(0xe11d48)
      .setDescription(
        `**${botMeta?.name ?? botSlug}**\n` +
        `${label}${whitelabel ? " (Whitelabel)" : ""}\n\n` +
        `**Valor:** R$ ${totalPrice.toFixed(2).replace(".", ",")}\n\n` +
        "Escaneie o QR Code ou copie o codigo Pix abaixo.\n" +
        "O QR Code expira em 30 minutos.\n\n" +
        `**Pedido:** #${(order.id as string).slice(0, 8)}`
      )
      .setFooter({ text: "Aguardando pagamento..." })

    const files: AttachmentBuilder[] = []
    if (pixResult.qrCodeBase64) {
      files.push(new AttachmentBuilder(Buffer.from(pixResult.qrCodeBase64, "base64"), { name: "pix-qrcode.png" }))
    }

    await interaction.editReply({
      embeds: [qrEmbed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("pix_copy")
            .setLabel("📋 Copiar Codigo Pix")
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      files,
    })

    const msg = await interaction.fetchReply().catch(() => null)

    pollPaymentUntilDone({
      paymentId: pixResult.id,
      orderId: order.id,
      client: interaction.client as Client,
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      clienteRoleId,
    }).catch(() => {})
  },
})

createResponder({
  customId: "pix_copy",
  types: ["Button"],
  async run(interaction: any) {
    const message = interaction.message
    const embed = message?.embeds?.[0]
    if (!embed?.description) {
      return interaction.reply({ content: "Codigo nao encontrado. Tente escanear o QR Code.", ephemeral: true })
    }
    await interaction.reply({
      content: "Para pagar, escaneie o QR Code na mensagem acima usando o app do seu banco.",
      ephemeral: true,
    })
  },
})

createEvent({
  name: "messageCreate",
  async run(message: Message) {
    if (message.author.bot || message.guild) return
    if (!message.content.startsWith("!token")) return

    const parts = message.content.split(/\s+/)
    if (parts.length < 3) {
      await message.reply("Formato: `!token SEU_TOKEN CLIENT_ID`")
      return
    }

    const token = parts[1]
    const clientId = parts[2]
    const pending = pendingTokenSubmissions.get(message.author.id)
    if (!pending) {
      await message.reply("Nenhum pedido pendente para sua conta.")
      return
    }

    try {
      await submitBotToken(pending.orderId, token, clientId)
      pendingTokenSubmissions.delete(message.author.id)
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Token Recebido!")
            .setDescription("Seu bot esta na fila de deploy. Em breve estara online com nossa source!")
            .setColor(0x22c55e),
        ],
      })
    } catch {
      await message.reply("Erro ao processar. Tente novamente.")
    }
  },
})

function initSalesPoller(client: Client) {
  setInterval(async () => {
    try {
      const orders = await getPaidOrdersNeedingToken()
      for (const order of orders as any[]) {
        const discordId = order.users?.discord_id
        if (!discordId || pendingTokenSubmissions.has(discordId)) continue
        try {
          const user = await client.users.fetch(discordId)
          await user.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("✅ Pagamento Aprovado!")
                .setColor(0x22c55e)
                .setDescription(
                  `Seu pedido de **${order.bot_slug}** foi aprovado!\n` +
                  "Para ativar, envie: `!token SEU_TOKEN CLIENT_ID`"
                ),
            ],
          }).catch(() => {})
          pendingTokenSubmissions.set(discordId, { orderId: order.id })
        } catch {}
      }
    } catch (err) {
      console.error("[SALES] Erro no poller:", err)
    }
  }, 60_000)
}

export { initSalesPoller }
