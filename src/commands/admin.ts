import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import { createCommand, colors } from '../base'
import { activateBot } from '../utils/store-queries'
import { getBotSupabase } from '../utils/supabase'
import { loadGuildModules } from '../modules/manager'
import { config } from '../config'

createCommand({
  scope: 'master',
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Comandos administrativos da ARX Store')
    .addSubcommand(sub =>
      sub.setName('ativar')
        .setDescription('Ativa todos os bots em um servidor (bypass pagamento)')
        .addStringOption(opt =>
          opt.setName('servidor')
            .setDescription('ID do servidor (padrao: servidor atual)')
            .setRequired(false))),
  async run(interaction) {
    const userId = interaction.user.id
    if (!config.adminUserIds.includes(userId)) {
      return interaction.reply({
        content: 'Voce nao tem permissao para usar este comando.',
        ephemeral: true,
      })
    }

    const sub = interaction.options.getSubcommand()

    if (sub === 'ativar') {
      const guildId = interaction.options.getString('servidor') ?? interaction.guildId

      if (!guildId) {
        return interaction.reply({
          content: 'Informe o ID do servidor ou use este comando em um servidor.',
          ephemeral: true,
        })
      }

      await interaction.deferReply()

      try {
        const { data: settings } = await getBotSupabase()
          .from('settings')
          .select('value')
          .eq('key', 'default_bots')
          .single()

        const bots: any[] = settings?.value
          ? (Array.isArray(settings.value) ? settings.value : JSON.parse(String(settings.value)))
          : []

        if (!bots.length) {
          return interaction.editReply('Nenhum bot cadastrado nas configuracoes.')
        }

        const results: string[] = []

        for (const bot of bots) {
          try {
            await activateBot(guildId, bot.slug)
            results.push(`+ **${bot.name ?? bot.slug}** ativado`)
          } catch (err: any) {
            results.push(`- **${bot.name ?? bot.slug}** falhou: ${err.message}`)
          }
        }

        await loadGuildModules(interaction.client)

        const embed = new EmbedBuilder()
          .setTitle('Bots Ativados (Admin)')
          .setDescription(`Servidor: \`${guildId}\`\n\n${results.join('\n')}`)
          .setColor(colors.success)
          .setFooter({ text: 'Bypass de pagamento - Admin' })

        await interaction.editReply({ embeds: [embed] })
      } catch (err: any) {
        await interaction.editReply(`Erro ao ativar bots: ${err.message}`)
      }
    }
  },
})
