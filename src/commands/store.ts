import { SlashCommandBuilder } from 'discord.js'
import { createCommand } from '../base'

createCommand({
  data: new SlashCommandBuilder()
    .setName('store')
    .setDescription('Gerencia a loja de bots do ARX Store')
    .addSubcommand(sub =>
      sub.setName('ativar').setDescription('Ativa um bot no servidor')
        .addStringOption(opt => opt.setName('bot').setDescription('Slug do bot').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('desativar').setDescription('Desativa um bot no servidor')
        .addStringOption(opt => opt.setName('bot').setDescription('Slug do bot').setRequired(true))),
  async run(interaction) {
    await interaction.reply({ content: '🏪 Comando store em desenvolvimento.', ephemeral: true })
  },
})
