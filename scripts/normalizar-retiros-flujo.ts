// Deja los retiros que ya existen de acuerdo con el flujo Etapa / Estado / Consolidación:
//   · Abierto o Novedad  → Consolidación «Pendiente» (consolidado = false, sin bandera de novedad resuelta).
//   · Cerrado            → Consolidación «Consolidado» o «Novedad resuelta» (consolidado = true).
//   · Abierto pero Dropi lo rechazó o canceló → pasa a Novedad, con su nota («Novedad: Dropi reportó…»).
// Los retiros con el estado antiguo «Cancelado» (cancelación manual) NO se tocan salvo con --incluir-cancelados:
// pasan a Estado Novedad con etapa Cancelado, como hoy hace el botón «Cancelar».
//
// Uso: npx tsx scripts/normalizar-retiros-flujo.ts [--aplicar] [--incluir-cancelados]
//   Sin --aplicar solo dice qué cambiaría; no escribe nada.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const incluirCancelados = process.argv.includes("--incluir-cancelados");

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

const hoy = new Date().toISOString().slice(0, 10);
const num = (n: number) => `#${String(n).padStart(4, "0")}`;

interface Fila {
  id: string;
  numero_correlativo: number;
  estado: string;
  estado_dropi: string | null;
  consolidado: boolean;
  novedad_resuelta?: boolean | null;
  fecha_cierre: string | null;
}

async function traerTodos(): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("retiros")
      .select("*")
      .order("numero_correlativo")
      .range(desde, desde + 999);
    if (error) throw new Error(`Error leyendo retiros: ${error.message}`);
    filas.push(...(data as Fila[]));
    if ((data ?? []).length < 1000) return filas;
  }
}

async function main() {
  const filas = await traerTodos();
  const conBandera = filas.length > 0 && "novedad_resuelta" in filas[0];
  if (!conBandera) console.warn("Aviso: falta la migración 0048 (columna novedad_resuelta); se sigue sin ella.\n");

  let cambios = 0;
  for (const f of filas) {
    const c: Record<string, unknown> = {};
    const eventos: string[] = [];
    let motivo = "";

    if (f.estado === "cancelado") {
      if (!incluirCancelados) {
        console.log(`${num(f.numero_correlativo)}: estado antiguo «Cancelado» — no se toca (usa --incluir-cancelados).`);
        continue;
      }
      Object.assign(c, {
        estado: "novedad",
        estado_dropi: "cancelado",
        fecha_cancelado_dropi: f.fecha_cierre ?? hoy,
        fecha_novedad: hoy,
        consolidado: false,
        fecha_cierre: null,
      });
      if (conBandera) c.novedad_resuelta = false;
      eventos.push("Novedad: el retiro fue cancelado");
      motivo = "Cancelado → Novedad (etapa Cancelado)";
    } else if (f.estado === "abierto" && (f.estado_dropi === "rechazado" || f.estado_dropi === "cancelado")) {
      Object.assign(c, { estado: "novedad", fecha_novedad: hoy, consolidado: false });
      if (conBandera) c.novedad_resuelta = false;
      eventos.push(`Novedad: Dropi reportó el retiro como ${f.estado_dropi}`);
      motivo = `Abierto con Dropi ${f.estado_dropi} → Novedad`;
    } else if ((f.estado === "abierto" || f.estado === "novedad") && (f.consolidado || f.novedad_resuelta)) {
      c.consolidado = false;
      if (conBandera) c.novedad_resuelta = false;
      motivo = `${f.estado} con Consolidación distinta de Pendiente → Pendiente`;
    } else if (f.estado === "cerrado" && !f.consolidado) {
      c.consolidado = true;
      motivo = "Cerrado sin consolidar → Consolidado";
    } else {
      continue;
    }

    cambios++;
    console.log(`${num(f.numero_correlativo)}: ${motivo}`);
    if (!aplicar) continue;

    let cuerpo = { ...c };
    for (let i = 0; i < 6; i++) {
      const { error } = await supabase.from("retiros").update(cuerpo).eq("id", f.id);
      if (!error) break;
      const faltante = error.code === "42703" ? Object.keys(cuerpo).find((k) => error.message.includes(k)) : undefined;
      if (!faltante) throw new Error(`Error actualizando ${num(f.numero_correlativo)}: ${error.message}`);
      delete cuerpo[faltante];
    }
    for (const evento of eventos) await supabase.from("retiro_eventos").insert({ retiro_id: f.id, evento });
  }

  console.log(
    `\n${cambios} retiro(s) ${aplicar ? "actualizados" : "por actualizar (no se escribió nada; usa --aplicar)"}.`
  );
}

main();
