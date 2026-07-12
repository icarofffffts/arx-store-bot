import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { createCommand, colors } from '../base'
import { getBotSupabase } from '../utils/supabase'

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

      const bots: any[] = Array.isArray(data.value) ? data.value : JSON.parse(String(data.value))

      if (!bots.length) {
        return interaction.reply({
          content: 'Nenhum bot disponivel no momento.',
          ephemeral: true,
        })
      }

      const embed = new EmbedBuilder()
        .setTitle('ARX Store — Bots Disponiveis')
        .setDescription('Confira os bots disponiveis para ativar no seu servidor:')
        .setColor(colors.primary)
        .setFooter({ text: 'Use /ativar para ativar um bot no seu servidor' })

      for (const bot of bots) {
        const available = bot.available !== false
        const status = available ? '🟢 Disponivel' : '🔴 Indisponivel'
        embed.addFields({
          name: bot.name ?? bot.slug ?? 'Bot sem nome',
          value: [
            bot.description ? `**Descricao:** ${bot.description}` : null,
            bot.category ? `**Categoria:** ${bot.category}` : null,
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
