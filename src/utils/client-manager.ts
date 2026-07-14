import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} from 'discord.js'
import { getBotSupabase } from './supabase'
import { setupCreators, _commands, _responders } from '../base'

export interface ClientBot {
  client: Client
  orderId: string
  botSlug: string
  token: string
  startedAt: Date
}

class ClientManager {
  master: Client | null = null
  slaves: Map<string, ClientBot> = new Map()
  private syncTimer: ReturnType<typeof setInterval> | null = null

  async startMaster(token: string): Promise<Client> {
    console.log('[ClientManager] Iniciando master...')
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
      ],
    })

    setupCreators(client, { type: 'master' })

    client.on(Events.ClientReady, async (c) => {
      console.log(`[ClientManager] Master conectado como ${c.user.tag}`)
      const rest = new REST({ version: '10' }).setToken(token)
      await this.deployMasterCommands(c, rest, token)
    })

    client.on('error', (err) => console.error('[Master] Error:', err.message))
    client.on('shardError', (err) => console.error('[Master] ShardError:', err.message))

    await client.login(token)
    this.master = client
    console.log('[ClientManager] Master online.')
    return client
  }

  async startSlave(orderId: string, botSlug: string, token: string): Promise<Client> {
    if (this.slaves.has(orderId)) {
      console.log(`[ClientManager] Slave ${orderId} ja esta rodando.`)
      return this.slaves.get(orderId)!.client
    }

    console.log(`[ClientManager] Iniciando slave ${orderId} (${botSlug})...`)

    const restCheck = new REST({ version: '10' }).setToken(token)
    try {
      const me = await restCheck.get('/users/@me') as any
      console.log(`[ClientManager] Slave ${orderId} token OK: ${me.username} (${me.id})`)
    } catch (e: any) {
      console.error(`[ClientManager] Slave ${orderId} token INVALIDO: ${e.message}`)
      await getBotSupabase()
        .from('custom_bot_orders')
        .update({ status: 'error', metadata: { error: `Token invalido: ${e.message}` } })
        .eq('id', orderId)
      throw new Error(`Token invalido para order ${orderId}: ${e.message}`)
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
      ],
    })

    setupCreators(client, { type: 'slave' })

    client.on(Events.ClientReady, async (c) => {
      console.log(`[ClientManager] Slave ${orderId} conectado como ${c.user.tag}`)
      const rest = new REST({ version: '10' }).setToken(token)
      await this.deploySlaveCommands(c, rest, token, botSlug)
    })

    client.on('error', (err) => console.error(`[Slave ${orderId}] Error:`, err.message))
    client.on('shardError', (err) => console.error(`[Slave ${orderId}] ShardError:`, err.message))

    await client.login(token)

    const bot: ClientBot = { client, orderId, botSlug, token, startedAt: new Date() }
    this.slaves.set(orderId, bot)

    await getBotSupabase()
      .from('custom_bot_orders')
      .update({ status: 'active' })
      .eq('id', orderId)

    console.log(`[ClientManager] Slave ${orderId} online. Total slaves: ${this.slaves.size}`)
    return client
  }

  async stopSlave(orderId: string): Promise<void> {
    const bot = this.slaves.get(orderId)
    if (!bot) return
    console.log(`[ClientManager] Parando slave ${orderId}...`)
    bot.client.destroy()
    this.slaves.delete(orderId)
    console.log(`[ClientManager] Slave ${orderId} parado. Total slaves: ${this.slaves.size}`)
  }

  async syncFromDB(): Promise<void> {
    try {
      const { data: orders } = await getBotSupabase()
        .from('custom_bot_orders')
        .select('id, bot_slug, bot_token, status')
        .in('status', ['active', 'deploying'])
        .not('bot_token', 'is', null)

      if (!orders || orders.length === 0) {
        return
      }

      for (const order of orders) {
        if (!this.slaves.has(order.id)) {
          try {
            await this.startSlave(order.id, order.bot_slug, order.bot_token)
          } catch (e: any) {
            console.error(`[ClientManager] Falha ao iniciar slave ${order.id}: ${e.message}`)
          }
        }
      }
    } catch (e: any) {
      console.error('[ClientManager] Erro no sync:', e.message)
    }
  }

  startSyncLoop(intervalMs: number = 60_000): void {
    if (this.syncTimer) return
    console.log(`[ClientManager] Iniciando sync loop a cada ${intervalMs / 1000}s`)
    this.syncTimer = setInterval(() => this.syncFromDB(), intervalMs)
    this.syncFromDB()
  }

  getSlaveCount(): number {
    return this.slaves.size
  }

  getSlaveClients(): Client[] {
    return Array.from(this.slaves.values()).map(b => b.client)
  }

  private async deployMasterCommands(c: Client<true>, rest: REST, token: string) {
    const appId = (await rest.get('/users/@me') as any).id
    if (!appId) return

    const commands = Array.from(_commands.values())
      .filter(cmd => cmd.data)
      .map(cmd => cmd.data!.toJSON())

    if (commands.length === 0) return

    await rest.put(Routes.applicationCommands(appId), { body: [] })

    const guildIds = Array.from(c.guilds.cache.keys())
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands })
    }

    console.log(`[ClientManager] Master: ${commands.length} comandos registrados em ${guildIds.length} guilds.`)
  }

  private async deploySlaveCommands(c: Client<true>, rest: REST, token: string, botSlug: string) {
    const appId = (await rest.get('/users/@me') as any).id
    if (!appId) return

    const slaveCommands = Array.from(_commands.values())
      .filter(cmd => cmd.data && cmd.scope !== 'master')
      .map(cmd => cmd.data!.toJSON())

    if (slaveCommands.length === 0) return

    const guildIds = Array.from(c.guilds.cache.keys())
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: slaveCommands })
    }

    console.log(`[ClientManager] Slave (${botSlug}): ${slaveCommands.length} comandos registrados.`)
  }
}

export const clientManager = new ClientManager()
