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
import './commands/manager'

import './modules/tickets'
import './modules/invites'
import './modules/moderation'
import './modules/sales'

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

    console.log(`[DEPLOY] Dados dos comandos:`, JSON.stringify(commands.map((c: any) => c.name)))

    const rest = new REST({ version: '10' }).setToken(config.discordToken)
    console.log(`[DEPLOY] Client ID: ${config.discordClientId}`)

    console.log(`[DEPLOY] Registrando ${commands.length} comandos (Global)...`)
    const globalResult = await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    ) as any
    console.log(`[DEPLOY] Global: ${globalResult.length} comandos registrados`)

    const guildIds = Array.from(c.guilds.cache.keys())
    console.log(`[DEPLOY] ${guildIds.length} guild(s) encontradas`)

    for (const guildId of guildIds) {
      console.log(`[DEPLOY] Registrando comandos na guild ${guildId}...`)
      const guildResult = await rest.put(
        Routes.applicationGuildCommands(config.discordClientId, guildId),
        { body: commands }
      ) as any
      console.log(`[DEPLOY] Guild ${guildId}: ${guildResult.length} comandos registrados`)
    }

    console.log('[DEPLOY] Slash commands registrados com sucesso!')
  } catch (err: any) {
    console.error('[DEPLOY] ERRO CRITICO:', err.message, err)
  }
}

client.login(config.discordToken)
  .then(() => console.log('[ARX STORE] Login request enviado...'))
  .catch(err => console.error('[ARX STORE] ERRO no login:', err.message))
