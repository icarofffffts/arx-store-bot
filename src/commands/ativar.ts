import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { createCommand, colors } from '../base'
import { activateBot, canActivateBot, getUserByDiscordId } from '../utils/store-queries'
import { getBotSupabase } from '../utils/supabase'
import { loadGuildModules } from '../modules/manager'

createCommand({
  scope: 'master',
  data: new SlashCommandBuilder()
    .setName('ativar')
    .setDescription('Ativa um bot no servidor')
    .addStringOption(opt =>
      opt.setName('bot')
        .setDescription('Nome do bot para ativar')
        .setRequired(true)
        .setAutocomplete(true)),
  async run(interaction) {
    if (interaction.isAutocomplete()) {
      try {
        const focused = interaction.options.getFocused().toLowerCase()
        const { data } = await getBotSupabase()
          .from('settings')
          .select('value')
          .eq('key', 'default_bots')
          .single()

        const bots: any[] = data?.value
          ? (Array.isArray(data.value) ? data.value : JSON.parse(String(data.value)))
          : []

        const guildBots = await getBotSupabase()
          .from('guild_bots')
          .select('bot_slug')
          .eq('guild_id', interaction.guildId!)
          .eq('status', 'active')

        const activeSlugs = new Set((guildBots.data ?? []).map((b: any) => b.bot_slug))

        const filtered = bots
          .filter(b => {
            const name = (b.name ?? b.slug ?? '').toLowerCase()
            const slug = (b.slug ?? '').toLowerCase()
            return (name.includes(focused) || slug.includes(focused)) && !activeSlugs.has(b.slug)
          })
          .slice(0, 25)

        await interaction.respond(
          filtered.map(b => ({
            name: `${b.name ?? b.slug}${b.available === false ? ' (indisponivel)' : ''}`,
            value: b.slug,
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
          content: 'Voce precisa da permissao **Gerenciar Servidor** para ativar bots.',
          ephemeral: true,
        })
      }

      const botSlug = interaction.options.getString('bot', true)

      const user = await getUserByDiscordId(interaction.user.id)
      if (!user) {
        return interaction.reply({
          content: 'Voce precisa ter uma conta na ARX Store para ativar bots.\nCrie sua conta em: https://store.arxdevs.shop',
          ephemeral: true,
        })
      }

      const canActivate = await canActivateBot(interaction.user.id, interaction.guildId, botSlug)
      if (!canActivate) {
        return interaction.reply({
          content: 'Nao foi possivel ativar o bot. Verifique se:\n'
            + '- Voce possui uma assinatura ativa\n'
            + '- Seu plano tem limite de bots disponivel\n'
            + '- O bot nao esta ativo neste servidor',
          ephemeral: true,
        })
      }

      const { data: settings } = await getBotSupabase()
        .from('settings')
        .select('value')
        .eq('key', 'default_bots')
        .single()

      const bots: any[] = settings?.value
        ? (Array.isArray(settings.value) ? settings.value : JSON.parse(String(settings.value)))
        : []

      const botDef = bots.find((b: any) => b.slug === botSlug)
      const botName = botDef?.name ?? botSlug

      await activateBot(interaction.guildId, botSlug)

      await loadGuildModules(interaction.client)

      const embed = new EmbedBuilder()
        .setTitle('Bot Ativado')
        .setDescription(`O bot **${botName}** foi ativado com sucesso no servidor!`)
        .addFields({
          name: 'Proximos passos',
          value: 'Use **/config ver bot:' + botSlug + '** para visualizar as configuracoes\n'
            + 'Use **/config editar bot:' + botSlug + '** para personalizar o bot',
        })
        .setColor(colors.success)

      await interaction.reply({ embeds: [embed] })
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao ativar bot: ${err.message}`,
        ephemeral: true,
      })
    }
  },
})
