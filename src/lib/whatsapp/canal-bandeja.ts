/**
 * El canal en tiempo real de la bandeja de WhatsApp (Supabase Realtime, «broadcast», 29 oct 2026). Cuando llega o sale un mensaje, el servidor
 * avisa por aquí y cada bandeja abierta se actualiza al momento, sin esperar su vuelta de refresco. El aviso **no lleva datos** (ni texto, ni
 * número, ni chat): solo dice «hay algo nuevo», y cada bandeja lo pide al servidor con sus permisos de siempre. Sin dependencias: se usa en
 * el servidor (`aviso-bandeja.ts`) y en el navegador (`bandeja.tsx`).
 */
export const CANAL_BANDEJA = "bandeja-whatsapp";
export const EVENTO_NOVEDAD = "novedad";
