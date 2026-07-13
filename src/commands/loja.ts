import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { createCommand, colors } from '../base'
import { getBotSupabase } from '../utils/supabase'
import { getGuildBots, getAvailablePlans } from '../utils/store-queries'

interface BotDefinition {
  name: string
  slug: string
  description: string
  category: string
  available: boolean
  plan_slug?: string
}

createCommand({
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('Ve os bots disponiveis na ARX Store'),
  async run(interaction) {
    try {
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
