import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { createCommand, colors } from '../base'
import { getUserByDiscordId, getUserSubscription, getGuildBots } from '../utils/store-queries'
import { getBotSupabase } from '../utils/supabase'

const STATUS_MAP: Record<string, { label: string; color: number }> = {
  active:    { label: '🟢 Ativa',    color: colors.success },
  cancelled: { label: '🔴 Cancelada', color: colors.danger },
  expired:   { label: '⏰ Expirada',  color: colors.warning },
  pending:   { label: '🟡 Pendente',  color: colors.warning },
}

createCommand({
  scope: 'master',
  data: new SlashCommandBuilder()
    .setName('meuplano')
    .setDescription('Ve seu plano atual e status da assinatura'),
  async run(interaction) {
    try {
      const discordId = interaction.user.id
      const user = await getUserByDiscordId(discordId)

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('ARX Store — Meu Plano')
          .setDescription('Voce ainda nao possui uma conta na ARX Store.')
          .setColor(colors.warning)
        return interaction.reply({ embeds: [embed], ephemeral: true })
      }

      const subscription = await getUserSubscription(user.id)

      if (!subscription) {
        const embed = new EmbedBuilder()
          .setTitle('ARX Store — Meu Plano')
          .setDescription('**Plano Gratuito**')
          .addFields(
            { name: 'Status', value: '🆓 Free', inline: true },
            { name: 'Preco', value: 'R$ 0,00', inline: true },
            { name: 'Upgrade', value: '[Ver planos disponiveis](https://store.arxdevs.shop/dashboard/planos)', inline: false },
          )
          .setColor(colors.neutral)
        return interaction.reply({ embeds: [embed] })
      }

      const plan = subscription.plans as any
      if (!plan) {
        return interaction.reply({
          content: 'Erro ao carregar dados do plano.',
          ephemeral: true,
        })
      }

      const supabase = getBotSupabase()

      const { count: guildsCount } = await supabase
        .from('guild_bots')
        .select('guild_id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('status', 'active')

      const { count: botsCount } = await supabase
        .from('guild_bots')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('status', 'active')

      const statusInfo = STATUS_MAP[subscription.status] ?? { label: subscription.status, color: colors.neutral }

      const embed = new EmbedBuilder()
        .setTitle('ARX Store — Meu Plano')
        .setColor(statusInfo.color)
        .addFields(
          { name: 'Plano',  value: plan.name ?? 'Desconhecido', inline: true },
          { name: 'Preco',  value: plan.price ? `R$ ${plan.price}` : 'Gratuito', inline: true },
          { name: 'Status', value: statusInfo.label, inline: true },
        )

      if (plan.max_bots) {
        embed.addFields({
          name: 'Bots',
          value: `${botsCount ?? 0} / ${plan.max_bots} ativos`,
          inline: true,
        })
      }

      if (plan.max_guilds) {
        embed.addFields({
          name: 'Servidores',
          value: `${guildsCount ?? 0} / ${plan.max_guilds}`,
          inline: true,
        })
      }

      if (subscription.current_period_end) {
        embed.addFields({
          name: 'Proxima cobranca',
          value: new Date(subscription.current_period_end).toLocaleDateString('pt-BR'),
          inline: true,
        })
      }

      await interaction.reply({ embeds: [embed] })
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao buscar plano: ${err.message}`,
        ephemeral: true,
      })
    }
  },
})
