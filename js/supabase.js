/**
 * supabase.js
 * Crea el cliente de Supabase que usa toda la aplicación. La lectura de cada
 * tabla vive en sus módulos (parque.js, vistas-bd.js).
 */
const db = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
