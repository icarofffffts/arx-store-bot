/**
 * ARX Store Bot — Entry point
 * Arquitetura Constatic: createCommand / createResponder / createEvent
 * https://constatic-docs.vercel.app
 */

import './setup'

import {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
} from 'discord.js'

import { config } from './config'
import { setupCreators, createEvent } from './base'

import './commands/loja'
import './commands/meuplano'
import './commands/ativar'
import './commands/desativar'
import './commands/config'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

createEvent({
  name: Events.ClientReady,
  once: true,
  async run(c) {
    console.log(`[ARX STORE] Bot conectado como ${c.user.tag}`)
    setupCreators(client)
  },
})

client.login(config.discordToken)
