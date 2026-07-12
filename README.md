# ARX Store — Bot Manager

Bot Discord do ARX Store. Gerencia assinaturas, ativacao de bots e planos via comandos slash.

## Comandos

| Comando | Descricao |
|---------|-----------|
| `/loja` | Ver bots disponiveis |
| `/meuplano` | Status da assinatura |
| `/ativar` | Ativar bot no servidor |
| `/desativar` | Desativar bot |
| `/config` | Configurar bot ativo |

## Stack

- discord.js v14
- @magicyan/discord (Constatic)
- Supabase (PostgreSQL)

## Deploy

Coolify: Dockerfile na raiz, porta nao exposta (bot-only).

```env
DISCORD_BOT_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=https://supabase.arxdevs.xyz
```
