import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { createCommand, colors } from '../base'
import { getBotSupabase } from '../utils/supabase'

createCommand({
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Verifica o status da ARX Store'),
  async run(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('ARX Store — Status')
      .setDescription('🟢 Todos os sistemas operacionais.')
      .setColor(colors.success)
    await interaction.reply({ embeds: [embed] })
  },
})
