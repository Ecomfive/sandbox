// Lee el archivo de retiros ya extraido (ver dropi-extraer-retiros.ts) y CONCILIA:
// Dropi no crea retiros. Cada retiro de Dropi se vincula al retiro que creo el equipo
// leyendo su correlativo (#0007) en el concepto; guarda su id, el banco y su estado.
// Lo que no se puede vincular queda aparte en dropi_retiros_sin_vincular para revisarlo.
// Ademas actualiza el saldo actual de wallet con el numero que el mismo Dropi reporta
// (user.wallets[0].amount).
//
// Uso: npx tsx scripts/dropi-ingerir-retiros.ts <cr|pa> <archivo.json>

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  ETIQUETA_ESTADO_DROPI,
  ETIQUETA_MOTIVO,
  emparejarRetiros,
  extraerCorrelativo,
  mapearEstadoDropi,
  type RetiroDropi,
  type RetiroLocal,
} from "../src/lib/dropi/emparejar-retiros";

const pais = process.argv[2];
const archivo = process.argv[3];

if (!["cr", "pa"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-retiros.ts <cr|pa> <archivo.json>");
  process.exit(1);
}

// Panama y Costa Rica no usan horario de verano, asi que el offset es fijo.
const OFFSET_HORAS: Record<string, number> = { cr: -6, pa: -5 };
const TAMANO_LOTE = 100;

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

interface FilaRetiro {
  id: number;
  amount: string;
  status: string;
  created_at: string;
  concept: string | null;
  user_bank?: { bank?: { name?: string | null } | null } | null;
  user?: { wallets?: { amount: string }[] | null } | null;
}

function fechaLocal(isoUtc: string): string {
  const fecha = new Date(isoUtc);
  fecha.setHours(fecha.getHours() + OFFSET_HORAS[pais]);
  return fecha.toISOString().slice(0, 10);
}

function lotes<T>(items: T[]): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < items.length; i += TAMANO_LOTE) resultado.push(items.slice(i, i + TAMANO_LOTE));
  return resultado;
}

async function cargarRetirosLocales(paisId: string, plataformaId: string, correlativos: number[]): Promise<RetiroLocal[]> {
  const locales: RetiroLocal[] = [];
  for (const lote of lotes(correlativos)) {
    const { data, error } = await supabase
      .from("retiros")
      .select("id, numero_correlativo, dropi_id, estado_dropi, monto")
      .eq("pais_id", paisId)
      .eq("plataforma_id", plataformaId)
      .in("numero_correlativo", lote);
    if (error) throw new Error(`Error leyendo retiros: ${error.message}`);
    for (const r of data ?? []) {
      locales.push({
        id: r.id,
        correlativo: Number(r.numero_correlativo),
        dropiId: r.dropi_id === null ? null : Number(r.dropi_id),
        estadoDropi: r.estado_dropi,
        monto: Number(r.monto),
      });
    }
  }
  return locales;
}

async function main() {
  const filas: FilaRetiro[] = JSON.parse(readFileSync(archivo, "utf8"));
  console.log(`Leidos ${filas.length} retiros de ${archivo}`);

  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", pais.toUpperCase()).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) throw new Error("Falta pais o plataforma Dropi. Corre las migraciones.");

  const paisId = paisRow.id;
  const plataformaId = plataformaRow.id;

  if (filas.length === 0) {
    console.log("Sin retiros para conciliar.");
    return;
  }

  const dropi: RetiroDropi[] = filas.map((f) => ({
    dropiId: f.id,
    monto: Number(f.amount),
    fecha: fechaLocal(f.created_at),
    banco: f.user_bank?.bank?.name ?? null,
    estado: mapearEstadoDropi(f.status),
    concepto: f.concept,
  }));

  const correlativos = [...new Set(dropi.map((d) => extraerCorrelativo(d.concepto)).filter((c): c is number => c !== null))];
  const locales = await cargarRetirosLocales(paisId, plataformaId, correlativos);
  const { actualizaciones, sinVincular } = emparejarRetiros(dropi, locales);

  const advertencias: string[] = [];
  for (const a of actualizaciones) {
    const cambios: Record<string, unknown> = { banco: a.banco, estado_dropi: a.estadoDropi };
    if (a.vinculadoAhora) cambios.dropi_id = a.dropiId;
    const { error } = await supabase.from("retiros").update(cambios).eq("id", a.retiroId);
    if (error) throw new Error(`Error actualizando el retiro #${a.correlativo}: ${error.message}`);

    if (a.vinculadoAhora || a.cambioEstado) {
      await supabase.from("retiro_eventos").insert({
        retiro_id: a.retiroId,
        evento: a.vinculadoAhora
          ? `Vinculado con Dropi #${a.dropiId} (${ETIQUETA_ESTADO_DROPI[a.estadoDropi]})`
          : `Dropi reporta: ${ETIQUETA_ESTADO_DROPI[a.estadoDropi]}`,
      });
    }
    if (Math.abs(a.montoDropi - a.montoRetiro) >= 0.005) {
      advertencias.push(
        `#${String(a.correlativo).padStart(4, "0")}: Dropi reporta ${a.montoDropi.toFixed(2)} y el retiro tiene ${a.montoRetiro.toFixed(2)}`
      );
    }
  }

  // Los que ya se vincularon dejan de estar "sin vincular".
  for (const lote of lotes(actualizaciones.map((a) => a.dropiId))) {
    const { error } = await supabase
      .from("dropi_retiros_sin_vincular")
      .delete()
      .eq("pais_id", paisId)
      .eq("plataforma_id", plataformaId)
      .in("dropi_id", lote);
    if (error) throw new Error(`Error limpiando retiros sin vincular: ${error.message}`);
  }

  if (sinVincular.length > 0) {
    const ahora = new Date().toISOString();
    const { error } = await supabase.from("dropi_retiros_sin_vincular").upsert(
      sinVincular.map((s) => ({
        pais_id: paisId,
        plataforma_id: plataformaId,
        dropi_id: s.retiro.dropiId,
        monto: s.retiro.monto,
        fecha: s.retiro.fecha,
        estado_dropi: s.retiro.estado,
        banco: s.retiro.banco,
        concepto: s.retiro.concepto,
        correlativo: s.correlativo,
        motivo: s.motivo,
        actualizado_en: ahora,
      })),
      { onConflict: "pais_id,plataforma_id,dropi_id" }
    );
    if (error) throw new Error(`Error guardando retiros sin vincular: ${error.message}`);
  }

  const vinculadosAhora = actualizaciones.filter((a) => a.vinculadoAhora).length;
  console.log(
    `Vinculados ahora: ${vinculadosAhora}. Ya vinculados (actualizados): ${actualizaciones.length - vinculadosAhora}. Sin vincular: ${sinVincular.length}.`
  );
  for (const s of sinVincular) {
    console.log(
      `  Sin vincular - Dropi #${s.retiro.dropiId} (${s.retiro.fecha}, ${s.retiro.monto.toFixed(2)}): ${ETIQUETA_MOTIVO[s.motivo]}`
    );
  }
  for (const texto of advertencias) console.log(`  Ojo con el monto - ${texto}`);

  const saldoActual = filas[0].user?.wallets?.[0]?.amount;
  if (saldoActual === undefined) {
    console.log("La respuesta no trajo el saldo de wallet; no se actualiza saldos_wallet.");
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { error: errorSaldo } = await supabase
    .from("saldos_wallet")
    .upsert(
      { pais_id: paisId, plataforma_id: plataformaId, monto: Number(saldoActual), fecha: hoy },
      { onConflict: "pais_id,plataforma_id,fecha" }
    );
  if (errorSaldo) throw new Error(`Error guardando saldo de wallet: ${errorSaldo.message}`);
  console.log(`Saldo de wallet actualizado: ${saldoActual} (al ${hoy}).`);
}

main();
