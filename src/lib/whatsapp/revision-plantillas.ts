// Revisión automática del estado de las plantillas de WhatsApp (30 oct 2026). Meta avisa cuando aprueba o rechaza una plantilla, pero con 360dialog ese aviso solo llega si su webhook de cuenta
// (WABA) está configurado y no está confirmado que lo mande: por eso, además, se le pregunta a Meta por las plantillas que siguen «en revisión». Lo llama el cron diario y, de paso, quien abre la
// pantalla de Plantillas. Rutas relativas porque también puede usarse desde `scripts/`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sincronizarPlantillas } from "./plantillas-servidor";

/** Entre dos revisiones hechas «de paso» (al abrir la pantalla) pasan al menos estos minutos en cada instancia del servidor. */
const MINUTOS_ENTRE_REVISIONES = 10;
let ultimaRevisionMs = 0;

/**
 * Si hay plantillas mandadas a Meta que siguen en revisión, le pregunta a Meta cómo van y pone al día su estado (con su alerta y su aviso «Para ti», como si hubiera llegado el aviso).
 * Sin plantillas en revisión no llama a Meta. `siHaceFalta`: respeta el tiempo mínimo entre revisiones (para la que se hace al abrir la pantalla).
 */
export async function revisarPlantillasEnRevision(supabase: SupabaseClient, siHaceFalta = false): Promise<{ revisada: boolean; enRevision: number; actualizadas: number; nuevas: number } | { error: string }> {
  const { count, error } = await supabase.from("whatsapp_plantillas").select("id", { count: "exact", head: true }).eq("estado", "pendiente").not("meta_id", "is", null);
  if (error) return { error: "Falta correr la migración 0170 (plantillas de WhatsApp)." };
  const enRevision = count ?? 0;
  if (!enRevision) return { revisada: false, enRevision, actualizadas: 0, nuevas: 0 };
  if (siHaceFalta && Date.now() - ultimaRevisionMs < MINUTOS_ENTRE_REVISIONES * 60_000) return { revisada: false, enRevision, actualizadas: 0, nuevas: 0 };
  ultimaRevisionMs = Date.now();
  const r = await sincronizarPlantillas(supabase);
  if ("error" in r) return r;
  return { revisada: true, enRevision, ...r };
}
