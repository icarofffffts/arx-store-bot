/**
 * ARX Store Bot — Entry point
 * Arquitetura Constatic: createCommand / createResponder / createEvent
 */

import './setup'

import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} from 'discord.js'

import { config } from './config'
import { setupCreators, createEvent, _commands } from './base'
import { loadGuildModules, refreshGuildModules } from './modules/manager'

import './commands/loja'
import './commands/meuplano'
import './commands/ativar'
import './commands/desativar'
import './commands/config'

import './modules/tickets'
import './modules/invites'
import './modules/moderation'
import { initSalesPoller } from './modules/sales'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
  ],
})

createEvent({
  name: Events.ClientReady,
  once: true,
  async run(c) {
    console.log(`[ARX STORE] Bot conectado como ${c.user.tag}`)
    setupCreators(client)

    await deployCommands(c)

    await loadGuildModules(client)

    initSalesPoller(client)

    setInterval(async () => {
      try {
        await refreshGuildModules(client)
      } catch (err) {
        console.error('[ARX STORE] Erro ao atualizar modulos:', err)
      }
    }, 5 * 60 * 1000)
  },
})

async function deployCommands(c: Client<true>) {
  try {
    const commands = Array.from(_commands.values()).map(cmd => {
      if (!cmd.data) throw new Error(`Comando sem data: ${(cmd as any).name ?? 'unknown'}`)
      return cmd.data.toJSON()
    })

    if (commands.length === 0) {
      console.log('[DEPLOY] Nenhum comando para registrar.')
      return
    }

    const rest = new REST({ version: '10' }).setToken(config.discordToken)

    console.log(`[DEPLOY] Registrando ${commands.length} slash command(s) (Global)...`)
    await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    )

    const guildIds = Array.from(c.guilds.cache.keys())
    if (guildIds.length) {
      console.log(`[DEPLOY] Limpando guild commands em ${guildIds.length} guild(s)...`)
      for (const guildId of guildIds) {
        await rest.put(
          Routes.applicationGuildCommands(config.discordClientId, guildId),
          { body: [] }
        ).catch(e => console.log(`[DEPLOY] WARN: guild ${guildId} — ${e.message}`))
      }
    }

    console.log('[DEPLOY] Slash commands registrados com sucesso!')
  } catch (err) {
    console.error('[DEPLOY] Erro ao registrar commands:', err)
  }
}

client.login(config.discordToken)
