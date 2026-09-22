// Rellena fecha_aprobado, fecha_rechazo, fecha_novedad y fecha_cierre (para "Novedad resuelta") en
// retiros que ya pasaron por esos estados ANTES de que existieran esas columnas (migraciones 0044/0045)
// o de que las acciones/el script de Dropi empezaran a sellarlas — así la barra de pasos de la ficha no
// se queda en "—" para retiros viejos. La fecha se saca del evento correspondiente en retiro_eventos
// (la actividad real ya quedó guardada, solo faltaba copiarla a su columna).
//
// Por defecto NO escribe nada: solo dice qué encontraría y para cuántos retiros. Para aplicar de verdad:
//
// Uso: npx tsx scripts/backfill-fechas-retiros.ts [--aplicar]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");

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

interface Retiro {
  id: string;
  numero_correlativo: number;
  estado: string;
  estado_dropi: string | null;
  fecha_aprobado: string | null;
  fecha_rechazo: string | null;
  fecha_novedad: string | null;
  fecha_cierre: string | null;
}

interface Evento {
  evento: string;
  creado_en: string;
}

const fecha = (isoUtc: string) => isoUtc.slice(0, 10);

async function main() {
  const { data: retiros, error } = await supabase
    .from("retiros")
    .select("id, numero_correlativo, estado, estado_dropi, fecha_aprobado, fecha_rechazo, fecha_novedad, fecha_cierre")
    .or(
      [
        "and(estado_dropi.eq.aprobado,fecha_aprobado.is.null)",
        "and(estado_dropi.eq.rechazado,fecha_rechazo.is.null)",
        "and(estado.in.(novedad,novedad_resuelta),fecha_novedad.is.null)",
        "and(estado.eq.novedad_resuelta,fecha_cierre.is.null)",
      ].join(",")
    );
  if (error) throw new Error(`Error leyendo retiros: ${error.message}`);
  if (!retiros || retiros.length === 0) {
    console.log("No hay retiros con fechas faltantes por rellenar.");
    return;
  }
  console.log(`${retiros.length} retiro(s) con alguna fecha faltante. Revisando su historial...`);

  let actualizados = 0;
  let sinDatos = 0;

  for (const r of retiros as Retiro[]) {
    const { data: eventos, error: errorEventos } = await supabase
      .from("retiro_eventos")
      .select("evento, creado_en")
      .eq("retiro_id", r.id)
      .order("creado_en", { ascending: true });
    if (errorEventos) throw new Error(`Error leyendo eventos del retiro #${r.numero_correlativo}: ${errorEventos.message}`);
    const lista = (eventos ?? []) as Evento[];

    const cambios: Record<string, string> = {};

    if (r.estado_dropi === "aprobado" && !r.fecha_aprobado) {
      const ultimo = [...lista].reverse().find((e) => /aprobado/i.test(e.evento));
      if (ultimo) cambios.fecha_aprobado = fecha(ultimo.creado_en);
    }
    if (r.estado_dropi === "rechazado" && !r.fecha_rechazo) {
      const ultimo = [...lista].reverse().find((e) => /rechazado/i.test(e.evento));
      if (ultimo) cambios.fecha_rechazo = fecha(ultimo.creado_en);
    }
    if ((r.estado === "novedad" || r.estado === "novedad_resuelta") && !r.fecha_novedad) {
      // La nota manual ("Novedad: …") o, si la generó Dropi, el evento del rechazo — lo que haya
      // pasado primero es cuándo el retiro entró de verdad en novedad.
      const candidatos = lista.filter((e) => /^Novedad:/i.test(e.evento) || /rechazado/i.test(e.evento));
      if (candidatos.length > 0) cambios.fecha_novedad = fecha(candidatos[0].creado_en);
    }
    if (r.estado === "novedad_resuelta" && !r.fecha_cierre) {
      const resuelta = [...lista].reverse().find((e) => /^Novedad resuelta/i.test(e.evento));
      if (resuelta) cambios.fecha_cierre = fecha(resuelta.creado_en);
    }

    if (Object.keys(cambios).length === 0) {
      console.log(`  #${String(r.numero_correlativo).padStart(4, "0")}: sin eventos que expliquen la fecha faltante — se deja en "—".`);
      sinDatos++;
      continue;
    }

    console.log(`  #${String(r.numero_correlativo).padStart(4, "0")}: ${JSON.stringify(cambios)}`);
    if (aplicar) {
      const { error: errorUpdate } = await supabase.from("retiros").update(cambios).eq("id", r.id);
      if (errorUpdate) throw new Error(`Error actualizando el retiro #${r.numero_correlativo}: ${errorUpdate.message}`);
    }
    actualizados++;
  }

  console.log(
    aplicar
      ? `Listo: ${actualizados} retiro(s) actualizados, ${sinDatos} sin datos suficientes.`
      : `Modo de prueba (sin --aplicar): ${actualizados} retiro(s) se actualizarían, ${sinDatos} quedarían igual. Corre con --aplicar para guardarlo de verdad.`
  );
}

main();
