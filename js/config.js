/**
 * config.js
 * Configuración de conexión a Supabase.
 *
 * IMPORTANTE: aquí solo va la CLAVE PÚBLICA (publishable / anon), que es
 * segura de exponer en el navegador. El "access token" (sbp_...) de gestión
 * NUNCA debe escribirse aquí ni compartirse: es un secreto de administrador.
 *
 * La seguridad real de los datos la controlan las políticas RLS definidas
 * en la base de datos.
 */
const SUPABASE_CONFIG = {
  url: 'https://nbdacyepdjamgqoibtuv.supabase.co',
  anonKey: 'sb_publishable_2P3PFpeh5EaJZqWfDHGXSA_hDoA9VRv'
};
