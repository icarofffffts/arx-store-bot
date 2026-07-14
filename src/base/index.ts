/**
 * Base Constatic — ARX Store Bot
 * Padrão inspirado em https://constatic-docs.vercel.app
 *
 * createCommand  — registra slash commands
 * createResponder — responde botões/selects/modais com customId como rota
 * createEvent    — listeners de eventos Discord
 * setupCreators  — bootstrap central
 */

import {
  Client,
  Events,
  Interaction,
  MessageFlags,
  ComponentType,
} from 'discord.js'
import { createContainer, isAttachment, withProperties, ComponentData } from '@magicyan/discord'

// ── Tipos ─────────────────────────────────────────────────
type ResponderType = 'Button' | 'StringSelect' | 'Modal' | 'UserSelect' | 'RoleSelect' | 'ChannelSelect'

interface CommandOptions {
  name?: string
  data?: { name: string; toJSON: () => unknown }
  description?: string
  scope?: 'master' | 'slave' | 'all'
  run: (interaction: any) => Promise<void>
}

interface ResponderOptions<P = Record<string, string>> {
  customId: string
  types: ResponderType[]
  scope?: 'master' | 'slave' | 'all'
  cache?: 'cached' | 'raw'
  parse?: (params: Record<string, string>) => P
  run: (interaction: any, params: P) => Promise<void>
}

interface EventOptions {
  name: string
  once?: boolean
  run: (...args: any[]) => Promise<void>
}

// ── Registros globais ─────────────────────────────────────
const _commands   = new Map<string, CommandOptions>()
const _responders: ResponderOptions<any>[] = []
const _events:     EventOptions[] = []

type CreatorsConfig = {
  commands?: {
    guilds?: Array<string | undefined>
  }
}

let _creatorsConfig: CreatorsConfig | null = null

// ── Cores ARX Store ───────────────────────────────────────
export const colors = {
  success:  0x3fb950,
  danger:   0xef4444,
  warning:  0xe3b341,
  info:     0x3b82f6,
  primary:  0x8957e5,
  neutral:  0x4b5563,
  purple:   0x8957e5,
} as const

type ColorKey = keyof typeof colors

type ResFunction = <R>(...components: ComponentData[]) => R & {
  with<R>(options: Partial<R>): R
}

type Res = Record<ColorKey, ResFunction>

// ── res — respostas Components V2 ─────────────────────────
export const res: Res = (Object.entries(colors) as [ColorKey, number][])
  .reduce((acc, [key, color]) => ({
    ...acc,
    [key]: (...components: ComponentData[]) => {
      const container = createContainer(color, components)
      const files     = components.filter(isAttachment)
      const defaults  = {
        files,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        components: [container],
        content: null,
        embeds: [],
        withComponents: true,
      }
      const withFunc = (options: Record<string, unknown>) => {
        if ('flags' in options && Array.isArray(options.flags)) {
          options.flags = Array.from(new Set([MessageFlags.IsComponentsV2, ...options.flags]))
        }
        if ('files' in options && Array.isArray(options.files)) {
          options.files = [...files, ...options.files]
        }
        return { ...defaults, ...options }
      }
      return withProperties(defaults, { with: withFunc })
    },
  }), {} as Res)

// ── CustomID pattern matching ─────────────────────────────
function matchPattern(pattern: string, customId: string): Record<string, string> | null {
  const normalizedPattern = pattern.replace(/:/g, '/')
  const normalizedId      = customId.replace(/:/g, '/')
  const patternParts = normalizedPattern.split('/').filter(Boolean)
  const idParts      = normalizedId.split('/').filter(Boolean)

  // Wildcard **
  const wildcardIdx = patternParts.indexOf('**')
  if (wildcardIdx !== -1) {
    const before = patternParts.slice(0, wildcardIdx)
    if (before.length > idParts.length) return null
    const params: Record<string, string> = { _: idParts.slice(wildcardIdx).join('/') }
    for (let i = 0; i < before.length; i++) {
      if (before[i].startsWith(':')) params[before[i].slice(1)] = idParts[i]
      else if (before[i] !== idParts[i]) return null
    }
    return params
  }

  if (patternParts.length !== idParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) params[patternParts[i].slice(1)] = idParts[i]
    else if (patternParts[i] !== idParts[i]) return null
  }
  return params
}

function getInteractionType(interaction: Interaction): ResponderType | null {
  if (interaction.isButton())             return 'Button'
  if (interaction.isStringSelectMenu())   return 'StringSelect'
  if (interaction.isModalSubmit())        return 'Modal'
  if (interaction.isUserSelectMenu())     return 'UserSelect'
  if (interaction.isRoleSelectMenu())     return 'RoleSelect'
  if (interaction.isChannelSelectMenu())  return 'ChannelSelect'
  return null
}

// ── createCommand ─────────────────────────────────────────
export function createCommand(options: CommandOptions): CommandOptions {
  const resolvedName = options.name ?? options.data?.name
  if (!resolvedName) {
    throw new Error('createCommand: é necessário informar "name" ou "data.name"')
  }
  const normalized: CommandOptions = { ...options, name: resolvedName }
  _commands.set(resolvedName, normalized)
  return normalized
}

// ── createResponder ───────────────────────────────────────
export function createResponder<P = Record<string, string>>(
  options: ResponderOptions<P>
): ResponderOptions<P> {
  _responders.push(options)
  return options
}

// ── createEvent ───────────────────────────────────────────
export function createEvent(options: EventOptions): EventOptions {
  _events.push(options)
  return options
}

// ── setupCreators — bootstrap central ────────────────────
export function setupCreators(config: CreatorsConfig): {
  createCommand: typeof createCommand
  createEvent: typeof createEvent
  createResponder: typeof createResponder
}
export function setupCreators(client: Client, opts?: { type: 'master' | 'slave' }): void
export function setupCreators(arg: Client | CreatorsConfig, opts?: { type: 'master' | 'slave' }): any {
  if (!(arg instanceof Client)) {
    _creatorsConfig = arg
    return { createCommand, createEvent, createResponder }
  }
  const client = arg
  const clientType = opts?.type ?? 'master'
  // Registra eventos customizados
  for (const event of _events) {
    if (event.once) {
      client.once(event.name, (...args) => event.run(...args))
    } else {
      client.on(event.name, (...args) => event.run(...args))
    }
  }

  // Handler central de interações
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ── Slash commands ──────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const cmd = _commands.get(interaction.commandName)
        if (cmd) {
          if (clientType === 'slave' && cmd.scope === 'master') return
          await cmd.run(interaction)
          return
        }
        return // Não encontrado — deixa o handler legado tratar
      }

      // ── Autocomplete ────────────────────────────────────
      if (interaction.isAutocomplete()) {
        const cmd = _commands.get(interaction.commandName)
        if (cmd) {
          if (clientType === 'slave' && cmd.scope === 'master') return
          await cmd.run(interaction)
          return
        }
        return
      }

      // ── Responders ──────────────────────────────────────
      const customId = (interaction as any).customId as string | undefined
      if (!customId) return

      const interactionType = getInteractionType(interaction)
      if (!interactionType) return

      for (const responder of _responders) {
        if (!responder.types.includes(interactionType)) continue
        if (clientType === 'slave' && responder.scope === 'master') continue

        const rawParams = matchPattern(responder.customId, customId)
        if (rawParams === null) continue

        const params = responder.parse ? responder.parse(rawParams) : rawParams
        await responder.run(interaction, params)
        return
      }
    } catch (err: any) {
      console.error('[Base] Erro em interação:', err?.message ?? err)
      const msg = {
        content: `❌ ${err?.message ?? 'Erro inesperado'}`,
        flags: [MessageFlags.Ephemeral],
      }
      if ((interaction as any).replied || (interaction as any).deferred) {
        await (interaction as any).followUp(msg).catch(() => {})
      } else if ((interaction as any).reply) {
        await (interaction as any).reply(msg).catch(() => {})
      }
    }
  })
}

export function getCreatorsConfig(): CreatorsConfig | null {
  return _creatorsConfig
}

export { _commands, _responders, _events }
