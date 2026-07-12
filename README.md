# ARX Store — Bot Manager

Bot Discord da plataforma ARX Store. Gerencia loja de bots, planos e ativacoes via comandos slash.

## Comandos

| Comando | Descricao |
|---------|-----------|
| `/loja` | Ver bots disponiveis |
| `/meuplano` | Status da assinatura |
| `/ativar` | Ativar bot no servidor |
| `/desativar` | Desativar bot |
| `/config` | Configurar bot ativo |

## Deploy (Coolify)

Build pack: **Dockerfile** (esta na raiz)
Porta: nao expoe (bot conecta via WebSocket)

## Stack

- discord.js v14.15.3
- @magicyan/discord 1.7.3
- TypeScript + Supabase
