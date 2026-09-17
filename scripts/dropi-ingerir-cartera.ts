// Lee el archivo de historial de cartera ya extraido (ver
// dropi-extraer-cartera.ts) y lo guarda por lotes en Supabase.
//
// Uso: npx tsx scripts/dropi-ingerir-cartera.ts <cr|pa> <archivo.json>

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const pais = process.argv[2];
const archivo = process.argv[3];

if (!["cr", "pa"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-cartera.ts <cr|pa> <archivo.json>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

interface FilaCartera {
  ID: number;
  FECHA: string; // "17-09-2026 00:01"
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

function* enLotes<T>(items: T[], tamano: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += tamano) yield items.slice(i, i + tamano);
}

async function main() {
  const filas: FilaCartera[] = JSON.parse(readFileSync(archivo, "utf8"));
  console.log(`Leidas ${filas.length} transacciones de ${archivo}`);

  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", pais.toUpperCase()).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) throw new Error("Falta pais o plataforma Dropi. Corre las migraciones.");

  const paisId = paisRow.id;
  const plataformaId = plataformaRow.id;

  const registros = new Map(
    filas.map((f) => {
      const { fecha, fecha_hora } = parsearFecha(String(f.FECHA));
      return [
        f.ID,
        {
          pais_id: paisId,
          plataforma_id: plataformaId,
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
    })
  );

  const registrosUnicos = Array.from(registros.values());
  for (const lote of enLotes(registrosUnicos, 500)) {
    const { error } = await supabase
      .from("historial_cartera")
      .upsert(lote, { onConflict: "pais_id,plataforma_id,dropi_id" });
    if (error) throw new Error(`Error guardando historial_cartera: ${error.message}`);
  }

  console.log(`Guardadas/actualizadas ${registrosUnicos.length} transacciones de cartera.`);
}

main();
