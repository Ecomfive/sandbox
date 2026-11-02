// Los retiros de Dropi de un país: Dropi no crea retiros, se CONCILIAN. Cada retiro de Dropi se vincula al que creó el equipo
// leyendo su correlativo (#0007) en el concepto; se guarda su id, el banco y su estado. Lo que no se puede vincular queda en
// `dropi_retiros_sin_vincular` para revisarlo. Además actualiza el saldo de la billetera con el que reporta Dropi
// (`user.wallets[0].amount`). Lo usan scripts/dropi-ingerir-retiros.ts y «Actualizar Dropi».

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ETIQUETA_ESTADO_DROPI,
  ETIQUETA_MOTIVO,
  emparejarRetiros,
  extraerCorrelativo,
  mapearEstadoDropi,
  type RetiroDropi,
  type RetiroLocal,
} from "@/lib/dropi/emparejar-retiros";

export interface FilaRetiro {
  id: number;
  amount: string;
  status: string;
  created_at: string;
  concept: string | null;
  user_bank?: { bank?: { name?: string | null } | null } | null;
  user?: { wallets?: { amount: string }[] | null } | null;
}

// Panamá y Costa Rica no usan horario de verano, así que el desfase es fijo.
const OFFSET_HORAS: Record<string, number> = { CR: -6, PA: -5, MX: -6 };
const TAMANO_LOTE = 100;

function lotes<T>(items: T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < items.length; i += TAMANO_LOTE) r.push(items.slice(i, i + TAMANO_LOTE));
  return r;
}

/** Concilia los retiros de un país (`PA`, `CR`) y guarda el saldo. `log` recibe los avisos (sin vincular, montos distintos). */
export async function ingerirRetiros(supabase: SupabaseClient, codigoPais: string, filas: FilaRetiro[], log: (texto: string) => void = () => {}) {
  const pais = codigoPais.toUpperCase();
  const fechaLocal = (isoUtc: string) => {
    const f = new Date(isoUtc);
    f.setHours(f.getHours() + (OFFSET_HORAS[pais] ?? -5));
    return f.toISOString().slice(0, 10);
  };
  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", pais).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) throw new Error("Falta el país o la plataforma Dropi. Corre las migraciones.");
  const paisId = paisRow.id as string;
  const plataformaId = plataformaRow.id as string;
  if (filas.length === 0) return { vinculadosAhora: 0, actualizados: 0, sinVincular: 0, saldo: null as number | null };

  const dropi: RetiroDropi[] = filas.map((f) => ({
    dropiId: f.id,
    monto: Number(f.amount),
    fecha: fechaLocal(f.created_at),
    banco: f.user_bank?.bank?.name ?? null,
    estado: mapearEstadoDropi(f.status),
    concepto: f.concept,
  }));
  const correlativos = [...new Set(dropi.map((d) => extraerCorrelativo(d.concepto)).filter((c): c is number => c !== null))];
  const locales: RetiroLocal[] = [];
  for (const lote of lotes(correlativos)) {
    const { data, error } = await supabase
      .from("retiros")
      .select("id, numero_correlativo, dropi_id, estado_dropi, monto, estado")
      .eq("pais_id", paisId)
      .eq("plataforma_id", plataformaId)
      .in("numero_correlativo", lote);
    if (error) throw new Error(`Error leyendo retiros: ${error.message}`);
    for (const r of data ?? [])
      locales.push({ id: r.id, correlativo: Number(r.numero_correlativo), dropiId: r.dropi_id === null ? null : Number(r.dropi_id), estadoDropi: r.estado_dropi, monto: Number(r.monto), estado: r.estado });
  }
  const { actualizaciones, sinVincular } = emparejarRetiros(dropi, locales);

  const hoyLocal = fechaLocal(new Date().toISOString());
  // Sin las migraciones 0044/0045/0046 Postgres rechaza las fechas de los pasos (42703): se sigue sin ellas.
  const columnasOpcionales = { fecha_rechazo: true, fecha_aprobado: true, fecha_novedad: true, fecha_cancelado_dropi: true };
  // Sin la 0046, el estado «cancelado» no existe todavía: se guarda como «rechazado».
  let hayEstadoCancelado = true;
  for (const a of actualizaciones) {
    const cambios: Record<string, unknown> = { banco: a.banco, estado_dropi: !hayEstadoCancelado && a.estadoDropi === "cancelado" ? "rechazado" : a.estadoDropi };
    if (a.vinculadoAhora) cambios.dropi_id = a.dropiId;
    // Dropi rechazó o canceló un retiro que seguía abierto aquí: queda en Novedad para revisarlo a mano.
    if (a.marcarNovedad) cambios.estado = "novedad";
    if (a.vinculadoAhora || a.cambioEstado) {
      if (columnasOpcionales.fecha_aprobado && a.estadoDropi === "aprobado") cambios.fecha_aprobado = hoyLocal;
      if (columnasOpcionales.fecha_rechazo && a.estadoDropi === "rechazado") cambios.fecha_rechazo = hoyLocal;
      if (columnasOpcionales.fecha_cancelado_dropi && a.estadoDropi === "cancelado") cambios.fecha_cancelado_dropi = hoyLocal;
    }
    if (columnasOpcionales.fecha_novedad && a.marcarNovedad) cambios.fecha_novedad = hoyLocal;

    let { error } = await supabase.from("retiros").update(cambios).eq("id", a.retiroId);
    if (error?.code === "23514" && hayEstadoCancelado && cambios.estado_dropi === "cancelado") {
      log('Falta correr la migración 0046 (estado «cancelado»): se guarda como «rechazado» por ahora.');
      hayEstadoCancelado = false;
      cambios.estado_dropi = "rechazado";
      ({ error } = await supabase.from("retiros").update(cambios).eq("id", a.retiroId));
    }
    if (error?.code === "42703") {
      const presentes = (Object.keys(columnasOpcionales) as (keyof typeof columnasOpcionales)[]).filter((c) => c in cambios);
      for (const c of presentes) {
        columnasOpcionales[c] = false;
        delete cambios[c];
      }
      if (presentes.length > 0) {
        log(`Falta correr la migración 0044/0045/0046 (${presentes.join(", ")}): se sigue sin esas fechas por ahora.`);
        ({ error } = await supabase.from("retiros").update(cambios).eq("id", a.retiroId));
      }
    }
    if (error) throw new Error(`Error actualizando el retiro #${a.correlativo}: ${error.message}`);

    if (a.vinculadoAhora || a.cambioEstado || a.marcarNovedad) {
      const etiqueta = ETIQUETA_ESTADO_DROPI[a.estadoDropi];
      await supabase.from("retiro_eventos").insert({ retiro_id: a.retiroId, evento: a.vinculadoAhora ? `Vinculado con Dropi #${a.dropiId}: ${etiqueta}` : etiqueta });
      // La novedad se crea sola, como si alguien pulsara «Novedad» en la ficha (la lee `novedadVigente`).
      if (a.marcarNovedad) await supabase.from("retiro_eventos").insert({ retiro_id: a.retiroId, evento: `Novedad: Dropi reportó el retiro como ${etiqueta.toLowerCase()}` });
    }
    if (Math.abs(a.montoDropi - a.montoRetiro) >= 0.005) log(`Ojo con el monto del #${String(a.correlativo).padStart(4, "0")}: Dropi reporta ${a.montoDropi.toFixed(2)} y el retiro tiene ${a.montoRetiro.toFixed(2)}.`);
  }

  // Los que ya se vincularon dejan de estar «sin vincular».
  for (const lote of lotes(actualizaciones.map((a) => a.dropiId))) {
    const { error } = await supabase.from("dropi_retiros_sin_vincular").delete().eq("pais_id", paisId).eq("plataforma_id", plataformaId).in("dropi_id", lote);
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
      { onConflict: "pais_id,plataforma_id,dropi_id" },
    );
    if (error) throw new Error(`Error guardando retiros sin vincular: ${error.message}`);
    for (const s of sinVincular) log(`Sin vincular: Dropi #${s.retiro.dropiId} (${s.retiro.fecha}, ${s.retiro.monto.toFixed(2)}): ${ETIQUETA_MOTIVO[s.motivo]}.`);
  }

  const vinculadosAhora = actualizaciones.filter((a) => a.vinculadoAhora).length;
  const saldoActual = filas[0].user?.wallets?.[0]?.amount;
  if (saldoActual === undefined) {
    log("Dropi no trajo el saldo de la billetera; no se actualizó.");
    return { vinculadosAhora, actualizados: actualizaciones.length - vinculadosAhora, sinVincular: sinVincular.length, saldo: null as number | null };
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const { error: errorSaldo } = await supabase.from("saldos_wallet").upsert({ pais_id: paisId, plataforma_id: plataformaId, monto: Number(saldoActual), fecha: hoy }, { onConflict: "pais_id,plataforma_id,fecha" });
  if (errorSaldo) throw new Error(`Error guardando el saldo de la billetera: ${errorSaldo.message}`);
  return { vinculadosAhora, actualizados: actualizaciones.length - vinculadosAhora, sinVincular: sinVincular.length, saldo: Number(saldoActual) };
}
