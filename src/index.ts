/**
 * ARX Store Bot — Entry point (Multi-Client)
 *
 * Master client: bot da loja (comandos de vendas, manager, admin)
 * Slave clients: bots dos clientes (tickets, invites, moderacao)
 *
 * Arquitetura Constatic com scope master/slave/all
 */

import './setup'

console.log('[ARX STORE] ===== INICIANDO (MULTI-CLIENT) =====')
console.log('[ARX STORE] Envs disponiveis:', Object.keys(process.env).filter(k =>
  k.startsWith('DISCORD') || k.startsWith('SUPABASE') || k.startsWith('NEXT') || k.startsWith('MERCADO')
).join(', '))

import { config } from './config'
import { createEvent, _commands } from './base'
import { loadGuildModules, refreshGuildModules } from './modules/manager'
import { clientManager } from './utils/client-manager'

import './commands/loja'
import './commands/meuplano'
import './commands/ativar'
import './commands/desativar'
import './commands/config'
import './commands/manager'
import './commands/admin'

import './modules/tickets'
import './modules/invites'
import './modules/moderation'
import './modules/sales'

createEvent({
  name: 'ready',
  once: true,
  async run(c: any) {
    console.log(`[ARX STORE] Bot conectado como ${c.user.tag}`)

    await loadGuildModules(c)

    setInterval(async () => {
      try {
        await refreshGuildModules(c)
      } catch (err) {
        console.error('[ARX STORE] Erro ao atualizar modulos:', err)
      }
    }, 5 * 60 * 1000)
  },
})

;(async () => {
  const { REST } = await import('discord.js')
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
    await clientManager.startMaster(config.discordToken)
    console.log(`[ARX STORE] Master online. Comandos: ${_commands.size}`)

    clientManager.startSyncLoop(60_000)
    console.log(`[ARX STORE] Sync de bots clientes iniciado (a cada 60s).`)
  } catch (e: any) {
    console.error('[ARX STORE] ERRO ao conectar:', e.message)
    process.exit(1)
  }
})()
