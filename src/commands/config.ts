import { SlashCommandBuilder, EmbedBuilder, inlineCode, codeBlock } from 'discord.js'
import { createCommand, colors } from '../base'
import { getBotConfig, updateBotConfig, getGuildBots } from '../utils/store-queries'
import { getBotSupabase } from '../utils/supabase'

createCommand({
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configura um bot ativo no servidor')
    .addSubcommand(sub =>
      sub.setName('ver')
        .setDescription('Visualiza a configuracao atual do bot')
        .addStringOption(opt =>
          opt.setName('bot')
            .setDescription('Nome do bot')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(sub =>
      sub.setName('editar')
        .setDescription('Edita uma configuracao do bot')
        .addStringOption(opt =>
          opt.setName('bot')
            .setDescription('Nome do bot')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(opt =>
          opt.setName('chave')
            .setDescription('Chave da configuracao')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('valor')
            .setDescription('Novo valor')
            .setRequired(true))),
  async run(interaction) {
    if (interaction.isAutocomplete()) {
      try {
        const focused = interaction.options.getFocused().toLowerCase()
        const guildBots = await getGuildBots(interaction.guildId!)

        const { data: settings } = await getBotSupabase()
          .from('settings')
          .select('value')
          .eq('key', 'default_bots')
          .single()

        const allBots: any[] = settings?.value
          ? (Array.isArray(settings.value) ? settings.value : JSON.parse(String(settings.value)))
          : []

        const botMap = new Map(allBots.map((b: any) => [b.slug, b]))

        const filtered = guildBots
          .filter((b: any) => {
            const name = (botMap.get(b.bot_slug)?.name ?? b.bot_slug).toLowerCase()
            const slug = b.bot_slug.toLowerCase()
            return name.includes(focused) || slug.includes(focused)
          })
          .slice(0, 25)

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
      if (!interaction.guildId) {
        return interaction.reply({
          content: 'Este comando so pode ser usado em um servidor.',
          ephemeral: true,
        })
      }

      const subcommand = interaction.options.getSubcommand()
      const botSlug = interaction.options.getString('bot', true)

      const activeBots = await getGuildBots(interaction.guildId)
      const existing = activeBots.find((b: any) => b.bot_slug === botSlug)

      if (!existing) {
        return interaction.reply({
          content: `O bot **${botSlug}** nao esta ativo neste servidor.`,
          ephemeral: true,
        })
      }

      if (subcommand === 'ver') {
        const config = await getBotConfig(interaction.guildId, botSlug)

        const configStr = config && Object.keys(config).length
          ? Object.entries(config).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')
          : '(configuracao vazia)'

        const embed = new EmbedBuilder()
          .setTitle(`Configuracao — ${botSlug}`)
          .setDescription(codeBlock('json', configStr))
          .setColor(colors.info)
          .setFooter({ text: 'Use /config editar para alterar valores' })

        await interaction.reply({ embeds: [embed] })
        return
      }

      if (subcommand === 'editar') {
        const chave = interaction.options.getString('chave', true)
        const valor = interaction.options.getString('valor', true)

        const currentConfig = (await getBotConfig(interaction.guildId, botSlug)) ?? {}

        let parsedValue: unknown = valor
        if (valor === 'true') parsedValue = true
        else if (valor === 'false') parsedValue = false
        else if (valor === 'null') parsedValue = null
        else if (!isNaN(Number(valor)) && valor.trim() !== '') parsedValue = Number(valor)

        const newConfig = { ...currentConfig, [chave]: parsedValue }
        await updateBotConfig(interaction.guildId, botSlug, newConfig)

        const embed = new EmbedBuilder()
          .setTitle('Configuracao Atualizada')
          .setDescription(`Bot **${botSlug}** atualizado com sucesso.`)
          .addFields({
            name: 'Alteracao',
            value: `${inlineCode(chave)}: ${inlineCode(String(parsedValue))}`,
          })
          .setColor(colors.success)

        await interaction.reply({ embeds: [embed] })
        return
      }
    } catch (err: any) {
      await interaction.reply({
        content: `Erro ao configurar bot: ${err.message}`,
        ephemeral: true,
      })
    }
  },
})
