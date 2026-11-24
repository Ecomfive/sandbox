// Despacho ciudad › cierres de los repartidores (24 nov 2026, migración 0362): los cierres del día que mandan desde su panel, para que Soporte los
// valide. Las fotos de los depósitos se ven con un enlace temporal del almacenamiento privado. Solo servidor; quien llama ya revisó el módulo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResumenCierre } from "./panel-repartidor";

export interface CierreRepartidor {
  id: string;
  courier: string;
  dia: string;
  estado: "enviado" | "validado" | "devuelto";
  resumen: ResumenCierre;
  depositos: { tienda: string; monto: number; foto: string | null }[];
  nota: string | null;
  enviadoEn: string;
  revisadoPor: string | null;
  revisadoEn: string | null;
}

const BUCKET = "despacho-comprobantes";

/** Los cierres de `desde` a `hasta` (AAAA-MM-DD): primero los que esperan validación. Sin la migración 0362, ninguno. */
export async function cargarCierres(supabase: SupabaseClient, desde: string, hasta: string): Promise<CierreRepartidor[]> {
  const { data, error } = await supabase
    .from("despacho_cierres")
    .select("id, courier, dia, estado, resumen, depositos, nota, enviado_en, revisado_por_nombre, revisado_en")
    .gte("dia", desde)
    .lte("dia", hasta)
    .order("dia", { ascending: false })
    .limit(200);
  if (error) return [];
  const orden = { enviado: 0, devuelto: 1, validado: 2 } as const;
  const cierres = await Promise.all(
    (data ?? []).map(async (c) => {
      const depositos = await Promise.all(
        ((c.depositos as { tienda: string; monto: number; archivo: string | null }[]) ?? []).map(async (d) => {
          const ruta = d.archivo?.startsWith("storage:") ? d.archivo.slice(8) : null;
          const firmado = ruta ? await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60 * 60) : null;
          return { tienda: d.tienda, monto: Number(d.monto) || 0, foto: firmado?.data?.signedUrl ?? null };
        }),
      );
      return {
        id: c.id as string,
        courier: c.courier as string,
        dia: c.dia as string,
        estado: c.estado as CierreRepartidor["estado"],
        resumen: c.resumen as ResumenCierre,
        depositos,
        nota: (c.nota as string | null) ?? null,
        enviadoEn: c.enviado_en as string,
        revisadoPor: (c.revisado_por_nombre as string | null) ?? null,
        revisadoEn: (c.revisado_en as string | null) ?? null,
      };
    }),
  );
  return cierres.sort((a, b) => orden[a.estado] - orden[b.estado] || b.dia.localeCompare(a.dia));
}
