// La cartera (billetera) de Dropi de un país a `historial_cartera`, por lotes, sin repetir movimientos (clave: el id de Dropi). Lo
// usan scripts/dropi-ingerir-cartera.ts y «Actualizar Dropi». Cada fila trae las columnas del Excel «Descargar en Excel» de Dropi.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FilaCartera {
  ID: number;
  /** «17-09-2026 00:01», hora del país. */
  FECHA: string;
  TIPO: string;
  MONTO: number;
  "ORDEN ID": number | null;
  "NUMERO DE GUIA": string | null;
  DESCRIPCIÓN: string | null;
}

function parsearFecha(raw: string): { fecha: string; fecha_hora: string } {
  const [fechaParte, horaParte] = raw.split(" ");
  const [dia, mes, anio] = fechaParte.split("-");
  const fecha = `${anio}-${mes}-${dia}`;
  return { fecha, fecha_hora: `${fecha}T${horaParte ?? "00:00"}:00` };
}

/** Guarda los movimientos de cartera de un país (`PA`, `CR`); devuelve cuántos guardó o actualizó. */
export async function ingerirCartera(supabase: SupabaseClient, codigoPais: string, filas: FilaCartera[]) {
  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", codigoPais.toUpperCase()).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) throw new Error("Falta el país o la plataforma Dropi. Corre las migraciones.");
  const registros = new Map(
    filas.map((f) => {
      const { fecha, fecha_hora } = parsearFecha(String(f.FECHA));
      return [
        f.ID,
        {
          pais_id: paisRow.id,
          plataforma_id: plataformaRow.id,
          dropi_id: f.ID,
          tipo: f.TIPO,
          monto: f.MONTO,
          orden_referencia_externa: f["ORDEN ID"] != null ? String(f["ORDEN ID"]) : null,
          guia: f["NUMERO DE GUIA"],
          descripcion: f.DESCRIPCIÓN,
          fecha,
          fecha_hora,
        },
      ];
    }),
  );
  const unicos = Array.from(registros.values());
  for (let i = 0; i < unicos.length; i += 500) {
    const { error } = await supabase.from("historial_cartera").upsert(unicos.slice(i, i + 500), { onConflict: "pais_id,plataforma_id,dropi_id" });
    if (error) throw new Error(`Error guardando historial_cartera: ${error.message}`);
  }
  return { movimientos: unicos.length };
}
