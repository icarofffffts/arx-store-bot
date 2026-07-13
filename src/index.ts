/**
 * ARX Store Bot — Entry point
 * Arquitetura Constatic: createCommand / createResponder / createEvent
 */

import './setup'

console.log('[ARX STORE] ===== INICIANDO =====')
console.log('[ARX STORE] Envs disponiveis:', Object.keys(process.env).filter(k =>
  k.startsWith('DISCORD') || k.startsWith('SUPABASE') || k.startsWith('NEXT') || k.startsWith('MERCADO')
).join(', '))

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

    const rest = new REST({ version: '10' }).setToken(config.discordToken)
    await deployCommands(c, rest)

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

async function deployCommands(c: Client<true>, rest: REST) {
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

client.on('debug', (msg: string) => {
  if (msg.includes('[WS =>') || msg.includes('Heartbeat') || msg.includes('Authenticating')) {
    console.log('[DJS]', msg)
  }
})

client.on('error', (err: Error) => {
  console.error('[DJS ERROR]', err.message)
})

client.on('shardError', (err: Error) => {
  console.error('[DJS SHARD ERROR]', err.message)
})

;(async () => {
  const restCheck = new REST({ version: '10' }).setToken(config.discordToken)
  try {
    console.log('[ARX STORE] Testando token na API do Discord...')
    const me = await restCheck.get('/users/@me') as any
    console.log(`[ARX STORE] Token OK! Logando como ${me.username} (${me.id})...`)
  } catch (e: any) {
    console.error(`[ARX STORE] TOKEN INVALIDO! Discord API: ${e.message}`)
    process.exit(1)
  }

  try {
    console.log('[ARX STORE] Conectando ao Gateway...')
    await client.login(config.discordToken)
    console.log('[ARX STORE] Gateway conectado!')
  } catch (e: any) {
    console.error('[ARX STORE] ERRO ao conectar:', e.message)
    console.error('[ARX STORE] Detalhes:', e.code ?? e.httpStatus ?? 'sem detalhes')
    process.exit(1)
  }
})()
