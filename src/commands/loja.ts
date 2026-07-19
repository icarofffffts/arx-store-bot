import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { createCommand, colors } from '../base'
import { getBotSupabase } from '../utils/supabase'
import { getGuildBots, getAvailablePlans, getUserByDiscordId } from '../utils/store-queries'

interface BotDefinition {
  name: string
  slug: string
  description: string
  category: string
  available: boolean
  plan_slug?: string
}

createCommand({
  scope: 'master',
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Ve os bots disponiveis na ARX Store'),
  async run(interaction) {
    try {
      const user = await getUserByDiscordId(interaction.user.id)
      const { data, error } = await getBotSupabase()
        .from('settings')
        .select('value')
        .eq('key', 'default_bots')
        .single()

      if (error || !data?.value) {
        return interaction.reply({
          content: 'Nenhum bot disponivel no momento.',
          ephemeral: true,
        })
      }

      const bots: BotDefinition[] = Array.isArray(data.value)
        ? data.value
        : JSON.parse(String(data.value))

      if (!bots.length) {
        return interaction.reply({
          content: 'Nenhum bot disponivel no momento.',
          ephemeral: true,
        })
      }

      const plans = await getAvailablePlans()
      const planMap = new Map(plans.map((p: any) => [p.slug, p]))

      let activeSlugs: Set<string> = new Set()
      if (interaction.guildId) {
        const guildBots = await getGuildBots(interaction.guildId)
        activeSlugs = new Set(guildBots.map((b: any) => b.bot_slug))
      }

      const embed = new EmbedBuilder()
        .setTitle('ARX Store — Bots Disponiveis')
        .setDescription('Confira os bots disponiveis para ativar no seu servidor:')
        .setColor(colors.primary)
        .setFooter({ text: 'Use /ativar para ativar um bot no seu servidor' })

      if (!user) {
        embed.addFields({
          name: '⚠️ Conta Necessaria',
          value: 'Voce precisa vincular sua conta do Discord no site primeiro:\nhttps://store.arxdevs.shop/login\n\nSem vincular, nao e possivel comprar ou ativar bots.',
          inline: false,
        })
      } else if (!user.email) {
        embed.addFields({
          name: '⚠️ Email Necessario',
          value: 'Sua conta nao tem email vinculado. Adicione um email no site para comprar via Pix:\nhttps://store.arxdevs.shop/dashboard/settings\n\nDepois de adicionar, volte aqui para comprar.',
          inline: false,
        })
      }

      for (const bot of bots) {
        const alreadyActive = activeSlugs.has(bot.slug)
        const available = bot.available !== false
        const status = alreadyActive
          ? '✅ Ja ativo neste servidor'
          : available
            ? '🟢 Disponivel'
            : '🔴 Indisponivel'

        const plan = bot.plan_slug ? planMap.get(bot.plan_slug) : null
        const planPrice = plan ? (plan as any).price : null
        const priceInfo = planPrice ? `R$ ${planPrice}/mes` : 'Incluso no plano'

        embed.addFields({
          name: bot.name ?? bot.slug ?? 'Bot sem nome',
          value: [
            bot.description ? `**Descricao:** ${bot.description}` : null,
            bot.category ? `**Categoria:** ${bot.category}` : null,
            `**Preco:** ${priceInfo}`,
            `**Status:** ${status}`,
          ].filter(Boolean).join('\n'),
          inline: false,
        })
      }

      await interaction.reply({ embeds: [embed] })
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao carregar bots: ${err.message}`,
        ephemeral: true,
      })
    }
  },
})
