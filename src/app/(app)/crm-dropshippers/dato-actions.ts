"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { MODULO_ATENCION } from "@/lib/crm/areas";
import { CAMPOS_DATO, esCampoDato, normalizarDato } from "@/lib/crm/dato-dropshipper";
import { hoyPanama } from "@/lib/proveedor/fechas";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Cambia un dato del bloque «Datos» de la ficha (ciudad, ingreso o correo), con un clic en el lápiz. Devuelve el error como valor y,
 * si sale bien, el valor guardado (ya limpio). Queda en la Actividad del dropshipper con el antes y el después.
 */
export async function cambiarDatoDropshipper(id: string, campo: string, valor: string): Promise<{ error: string } | { valor: string | null }> {
  await requireModuloEscritura(MODULO_ATENCION);
  if (!ES_ID(String(id))) return { error: "Dropshipper no válido." };
  if (!esCampoDato(campo)) return { error: "Ese dato no se puede cambiar aquí." };
  const limpio = normalizarDato(campo, String(valor ?? ""), hoyPanama());
  if ("error" in limpio) return limpio;

  const { columna, etiqueta } = CAMPOS_DATO[campo];
  const supabase = createServiceClient();
  const { data: actual, error: errorLeer } = await supabase.from("dropshippers").select(columna).eq("id", id).maybeSingle();
  if (errorLeer) return { error: "No se pudo leer el dropshipper." };
  if (!actual) return { error: "No se encontró el dropshipper." };
  const antes = ((actual as unknown as Record<string, string | null>)[columna] ?? null) || null;
  if (antes === limpio.valor) return { valor: limpio.valor };

  const { error } = await supabase.from("dropshippers").update({ [columna]: limpio.valor }).eq("id", id);
  if (error) return { error: "No se pudo guardar." };

  await registrarAuditoria({
    accion: "editar_dropshipper",
    entidad: "dropshippers",
    entidadId: id,
    antes: { [etiqueta]: antes ?? "—" },
    despues: { [etiqueta]: limpio.valor ?? "—" },
  });
  revalidatePath("/crm-dropshippers", "layout");
  return { valor: limpio.valor };
}
