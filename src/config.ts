export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  discordToken: process.env.DISCORD_BOT_TOKEN!,
  discordClientId: process.env.DISCORD_CLIENT_ID!,
  mercadopagoToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
  adminUserIds: (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),
}
