// Reporte de SOLO LECTURA: qué se tocó en Retiros en un día dado, sacando la actividad real de
// historial_auditoria y retiro_eventos — para confirmar con datos, no con memoria, qué retiros se
// editaron a mano (probando cambios) y a qué valores había que devolverlos. No cambia nada.
//
// Uso: npx tsx scripts/reporte-cambios-retiros.ts [YYYY-MM-DD] [cr|pa]
//   Sin fecha: hoy. Sin país: cr. El día se calcula con el huso horario de ese país
//   (Costa Rica y Panamá no usan horario de verano, así que el offset es fijo).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const OFFSET_HORAS: Record<string, number> = { cr: -6, pa: -5 };

const fechaArg = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null;
const paisArg = process.argv.find((a) => a === "cr" || a === "pa") ?? "cr";
const offset = OFFSET_HORAS[paisArg];

const hoyLocal = fechaArg ?? new Date(Date.now() + offset * 3600 * 1000).toISOString().slice(0, 10);
// Rango en UTC que cubre ese día completo en el huso horario elegido.
const desdeUtc = new Date(`${hoyLocal}T00:00:00.000${offset > 0 ? "+" : "-"}${String(Math.abs(offset)).padStart(2, "0")}:00`);
const hastaUtc = new Date(desdeUtc.getTime() + 24 * 3600 * 1000);

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

interface Linea {
  correlativo: number;
  retiroId: string;
  creadoEn: string;
  fuente: "auditoria" | "evento";
  texto: string;
}

async function main() {
  console.log(`Reporte de Retiros del ${hoyLocal} (${paisArg.toUpperCase()}), de ${desdeUtc.toISOString()} a ${hastaUtc.toISOString()} UTC.\n`);

  const { data: auditoria, error: errorAuditoria } = await supabase
    .from("historial_auditoria")
    .select("entidad_id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "retiros")
    .gte("creado_en", desdeUtc.toISOString())
    .lt("creado_en", hastaUtc.toISOString())
    .order("creado_en", { ascending: true });
  if (errorAuditoria) throw new Error(`Error leyendo historial_auditoria: ${errorAuditoria.message}`);

  const { data: eventos, error: errorEventos } = await supabase
    .from("retiro_eventos")
    .select("retiro_id, evento, creado_en")
    .gte("creado_en", desdeUtc.toISOString())
    .lt("creado_en", hastaUtc.toISOString())
    .order("creado_en", { ascending: true });
  if (errorEventos) throw new Error(`Error leyendo retiro_eventos: ${errorEventos.message}`);

  const idsUnicos = [...new Set([...(auditoria ?? []).map((a) => a.entidad_id), ...(eventos ?? []).map((e) => e.retiro_id)])].filter(
    (id): id is string => !!id
  );
  if (idsUnicos.length === 0) {
    console.log("No hay actividad de Retiros registrada en ese día.");
    return;
  }

  const { data: retiros, error: errorRetiros } = await supabase
    .from("retiros")
    .select("id, numero_correlativo, estado, estado_dropi, consolidado, monto_recibido, fecha_cierre")
    .in("id", idsUnicos);
  if (errorRetiros) throw new Error(`Error leyendo retiros: ${errorRetiros.message}`);
  const correlativoDe = new Map((retiros ?? []).map((r) => [r.id, r.numero_correlativo]));

  const lineas: Linea[] = [
    ...(auditoria ?? []).map((a): Linea => ({
      correlativo: correlativoDe.get(a.entidad_id!) ?? -1,
      retiroId: a.entidad_id!,
      creadoEn: a.creado_en,
      fuente: "auditoria",
      texto:
        `${a.usuario_nombre ?? "Alguien"} — ${a.accion}` +
        (a.antes || a.despues ? ` — antes: ${JSON.stringify(a.antes)}, después: ${JSON.stringify(a.despues)}` : "") +
        (a.detalle ? ` — ${a.detalle}` : ""),
    })),
    ...(eventos ?? []).map((e): Linea => ({
      correlativo: correlativoDe.get(e.retiro_id) ?? -1,
      retiroId: e.retiro_id,
      creadoEn: e.creado_en,
      fuente: "evento",
      texto: e.evento,
    })),
  ].sort((a, b) => a.correlativo - b.correlativo || a.creadoEn.localeCompare(b.creadoEn));

  let correlativoActual: number | null = null;
  for (const l of lineas) {
    if (l.correlativo !== correlativoActual) {
      correlativoActual = l.correlativo;
      console.log(`\n#${String(l.correlativo).padStart(4, "0")} (id ${l.retiroId})`);
      const actual = (retiros ?? []).find((r) => r.id === l.retiroId);
      if (actual) {
        console.log(
          `  Estado actual: ${actual.estado} · estado_dropi: ${actual.estado_dropi ?? "—"} · consolidado: ${actual.consolidado} · monto_recibido: ${actual.monto_recibido ?? "—"} · fecha_cierre: ${actual.fecha_cierre ?? "—"}`
        );
      }
    }
    console.log(`  [${l.creadoEn}] (${l.fuente}) ${l.texto}`);
  }
  console.log(`\n${idsUnicos.length} retiro(s) con actividad ese día.`);
}

main();
