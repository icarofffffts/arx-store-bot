import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { createCommand, colors } from '../base'
import { deactivateBot, getGuildBots } from '../utils/store-queries'
import { getBotSupabase } from '../utils/supabase'
import { disableModule } from '../modules/manager'

createCommand({
  data: new SlashCommandBuilder()
    .setName('desativar')
    .setDescription('Desativa um bot do servidor')
    .addStringOption(opt =>
      opt.setName('bot')
        .setDescription('Nome do bot para desativar')
        .setRequired(true)
        .setAutocomplete(true)),
  async run(interaction) {
    if (interaction.isAutocomplete()) {
      try {
        const focused = interaction.options.getFocused().toLowerCase()
        const guildBots = await getGuildBots(interaction.guildId!)

        const filtered = guildBots
          .filter((b: any) => b.bot_slug.toLowerCase().includes(focused))
          .slice(0, 25)

        if (!filtered.length) {
          await interaction.respond([])
          return
        }

        const { data: settings } = await getBotSupabase()
          .from('settings')
          .select('value')
          .eq('key', 'default_bots')
          .single()

        const allBots: any[] = settings?.value
          ? (Array.isArray(settings.value) ? settings.value : JSON.parse(String(settings.value)))
          : []

        const botMap = new Map(allBots.map((b: any) => [b.slug, b]))

        await interaction.respond(
          filtered.map((b: any) => ({
            name: botMap.get(b.bot_slug)?.name ?? b.bot_slug,
            value: b.bot_slug,
          }))
        )
      } catch {
        await interaction.respond([])
      }
      return
    }

    try {
      if (!interaction.guildId || !interaction.guild) {
        return interaction.reply({
          content: 'Este comando so pode ser usado em um servidor.',
          ephemeral: true,
        })
      }

      const member = await interaction.guild.members.fetch(interaction.user.id)
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: 'Voce precisa da permissao **Gerenciar Servidor** para desativar bots.',
          ephemeral: true,
        })
      }

      const botSlug = interaction.options.getString('bot', true)

      const activeBots = await getGuildBots(interaction.guildId)
      const existing = activeBots.find((b: any) => b.bot_slug === botSlug)
      if (!existing) {
        return interaction.reply({
          content: `O bot **${botSlug}** nao esta ativo neste servidor.`,
          ephemeral: true,
        })
      }

      await deactivateBot(interaction.guildId, botSlug)

      await disableModule(interaction.client, interaction.guildId, botSlug)

      const embed = new EmbedBuilder()
        .setTitle('Bot Desativado')
        .setDescription(`O bot **${botSlug}** foi desativado do servidor.`)
        .setColor(colors.danger)

      await interaction.reply({ embeds: [embed] })
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao desativar bot: ${err.message}`,
        ephemeral: true,
      })
    }
  },
})
