import { config } from './config'
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js'
import { _commands } from './base'

import './commands/loja'
import './commands/meuplano'
import './commands/ativar'
import './commands/desativar'
import './commands/config'
import './commands/manager'

import './modules/tickets'
import './modules/invites'
import './modules/moderation'
import './modules/sales'

const commands = Array.from(_commands.values()).map(cmd => {
  if (!cmd.data) throw new Error(`Comando sem data: ${cmd.name ?? 'unknown'}`)
  return cmd.data.toJSON()
})

const rest = new REST({ version: '10' }).setToken(config.discordToken)

async function getBotGuildIds(): Promise<string[]> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })
  return new Promise((resolve, reject) => {
    client.once(Events.ClientReady, async () => {
      try {
        const ids = Array.from(client.guilds.cache.keys())
        await client.destroy()
        resolve(ids)
      } catch (e) {
        try { await client.destroy() } catch {}
        reject(e)
      }
    })
    client.login(config.discordToken).catch(reject)
  })
}

;(async () => {
  try {
    console.log(`Registrando ${commands.length} slash command(s) (Global)...`)
    await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    )

    const guildIds = await getBotGuildIds()
    if (guildIds.length) {
      console.log(`Limpando comandos de guild para evitar duplicação (${guildIds.length} guilds)...`)
      for (const guildId of guildIds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(config.discordClientId, guildId),
            { body: [] }
          )
        } catch (e: any) {
          const code = e?.code ?? e?.rawError?.code ?? 'unknown'
          console.log(`WARN: falha ao limpar guild ${guildId} (code: ${code})`)
        }
      }
      console.log('✅ Limpeza de comandos de guild concluída.')
    }

    console.log('✅ Slash commands registrados com sucesso!')
  } catch (err) {
    console.error('Erro ao registrar commands:', err)
  }
})()
