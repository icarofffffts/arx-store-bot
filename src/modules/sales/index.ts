import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Client,
  AttachmentBuilder,
} from "discord.js"
import { createResponder } from "../../base"
import { getBotSupabase } from "../../utils/supabase"
import { createPixPayment, getPaymentStatus } from "../../utils/mercadopago"

const WHITELABEL_FEE = 15.0

const PRICING_OPTIONS = [
  { id: "1m", label: "1 Mes", price: 19.90 },
  { id: "3m", label: "3 Meses", price: 49.90 },
  { id: "6m", label: "6 Meses", price: 89.90 },
  { id: "lifetime", label: "Vitalicio", price: 199.90 },
]

async function getDefaultBots() {
  const { data } = await getBotSupabase()
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
  const user = await getUserByDiscordId(discordId)
  if (!user) return null
  const { data: order } = await getBotSupabase()
    .from("custom_bot_orders")
    .insert({ user_id: user.id, bot_slug: botSlug, status: "pending", metadata })
    .select()
    .single()
  return order
}

async function updateOrder(orderId: string, fields: Record<string, any>) {
  await getBotSupabase().from("custom_bot_orders").update(fields).eq("id", orderId)
}

async function submitBotDeploy(orderId: string, botToken: string, clientId: string, botName: string) {
  await getBotSupabase()
    .from("custom_bot_orders")
    .update({
      bot_token: botToken,
      bot_client_id: clientId,
      bot_name: botName,
      status: "deploying",
    })
    .eq("id", orderId)
}

async function pollPayment(p: {
  paymentId: number
  orderId: string
  guildId: string
  userId: string
  clienteRoleId: string
  channelId: string
  client: Client
}) {
  const { paymentId, orderId, client, guildId, userId, clienteRoleId, channelId } = p

  for (let i = 0; i < 72; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const status = await getPaymentStatus(paymentId)
      if (status !== "pending" && status !== "in_process") {
        if (status === "approved") {
          await updateOrder(orderId, { status: "paid", mp_payment_id: String(paymentId) })

          if (clienteRoleId) {
            try {
              const guild = await client.guilds.fetch(guildId)
              const member = await guild.members.fetch(userId)
              await member.roles.add(clienteRoleId)
            } catch {}
          }

          try {
            const channel = await client.channels.fetch(channelId)
            if (channel && "send" in channel) {
              const embed = new EmbedBuilder()
                .setTitle("✅ Pagamento Aprovado!")
                .setColor(0x22c55e)
                .setDescription(
                  `<@${userId}>, seu pagamento foi confirmado e o cargo de cliente foi liberado!\n\n` +
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
          } catch {}
        }
        return
      }
    } catch {}
  }
}

createResponder({
  scope: 'master',
  customId: "sales_buy:**",
  types: ["StringSelect"],
  async run(interaction: any) {
    const customParts = interaction.customId.split(":")
    const botSlug = customParts[1]
    const clienteRoleId = customParts[2]

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
        "Whitelabel remove todas as marcas ARX do bot. Seu cliente nao ve \"ARX\" em lugar nenhum — parece um bot exclusivo."
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
  scope: 'master',
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
    if (!user) {
      return interaction.editReply({
        content: "Voce precisa de uma conta na ARX Store para comprar. Acesse o site primeiro.",
      })
    }

    const emailToUse = user.email || "cliente@arx.store"

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
      sales_channel_id: interaction.channelId,
    })

    if (!order) {
      return interaction.editReply({ content: "Erro ao criar pedido." })
    }

    let pixResult
    try {
      pixResult = await createPixPayment({
        amount: totalPrice,
        description: `${botMeta?.name ?? botSlug} — ${label}${whitelabel ? " (Whitelabel)" : ""}`,
        email: emailToUse,
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
        "Escaneie o QR Code com o app do seu banco.\n" +
        "O QR Code expira em 30 minutos.\n\n" +
        `**Pedido:** #${(order.id as string).slice(0, 8)}`
      )
      .setFooter({ text: "Aguardando pagamento..." })

    const files: AttachmentBuilder[] = []
    if (pixResult.qrCodeBase64) {
      files.push(new AttachmentBuilder(Buffer.from(pixResult.qrCodeBase64, "base64"), { name: "pix.png" }))
    }

    await interaction.editReply({
      embeds: [qrEmbed],
      files,
    })

    pollPayment({
      paymentId: pixResult.id,
      orderId: order.id,
      client: interaction.client as Client,
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      clienteRoleId,
      channelId: interaction.channelId,
    }).catch(() => {})
  },
})

createResponder({
  scope: 'master',
  customId: "activate_bot:**",
  types: ["Button"],
  async run(interaction: any) {
    const orderId = interaction.customId.split(":")[1]

    const modal = new ModalBuilder()
      .setCustomId(`activate_modal:${orderId}`)
      .setTitle("Ativar Bot")

    const tokenInput = new TextInputBuilder()
      .setCustomId("bot_token")
      .setLabel("Token do Bot")
      .setPlaceholder("MTMyNDU2Nzg5...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)

    const clientIdInput = new TextInputBuilder()
      .setCustomId("client_id")
      .setLabel("Client ID do Bot")
      .setPlaceholder("1234567890123456789")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)

    const nameInput = new TextInputBuilder()
      .setCustomId("bot_name")
      .setLabel("Nome do Bot (opcional)")
      .setPlaceholder("MeuBot Ticket")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(tokenInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(clientIdInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    )

    await interaction.showModal(modal)
  },
})

createResponder({
  scope: 'master',
  customId: "activate_modal:**",
  types: ["Modal"],
  async run(interaction: any) {
    const orderId = interaction.customId.split(":")[1]
    const botToken = interaction.fields.getTextInputValue("bot_token").trim()
    const clientId = interaction.fields.getTextInputValue("client_id").trim()
    const botName = interaction.fields.getTextInputValue("bot_name").trim() || ""

    await interaction.deferReply({ ephemeral: true })

    try {
      await submitBotDeploy(orderId, botToken, clientId, botName)

      const embed = new EmbedBuilder()
        .setTitle("✅ Bot em Deploy!")
        .setColor(0x22c55e)
        .setDescription(
          "Seu bot foi enviado para a fila de deploy!\n\n" +
          "Em breve ele estara online rodando nossa source no seu token.\n" +
          "Voce recebera uma DM quando o deploy for concluido."
        )

      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      await interaction.editReply({ content: "Erro ao processar. Tente novamente." })
    }
  },
})
