import "server-only";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { avisoAutomaticoDeFase } from "@/lib/ventas/avisar-whatsapp";
import { ESTADO_DE_FASE, puedePasar, validarDespacho, type Fase } from "@/lib/ventas/ciclo";
import { debePasarADevolucion, diferenciaCobro, excedeLimiteEfectivo, leerUmbrales, mesCerrado, MOTIVOS_FALLO, pideAprobacion, comisionPasarela } from "@/lib/ventas/operacion";
import { aplicarStock, faltaStock } from "@/lib/ventas/stock";

const RUTA = "/ventas-tiendas/pipeline";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export type ResultadoFase = { error: string } | { ok: true; aviso?: string };

export interface CambioFase {
  repartidorId?: string | null;
  transportista?: string | null;
  guia?: string | null;
  motivo?: string | null;
  cobrado?: number | null;
  motivoCodigo?: string | null;
  reprogramadaPara?: string | null;
  recibeNombre?: string | null;
  recibeDocumento?: string | null;
  codigo?: string | null;
  motivoDiferencia?: string | null;
  prometidaPara?: string | null;
  retiroEnPunto?: boolean;
}

/**
 * Mueve una orden de fase (solo por el camino permitido) y deja el evento. NO comprueba permisos: quien la llama (la acción con
 * sesión o el enlace de un mensajero) ya decidió que puede y dice en `quien` a nombre de quién queda.
 */
export async function moverFase(ordenId: string, fase: Fase, cambio: CambioFase, quien: string): Promise<ResultadoFase> {
  const supabase = createServiceClient();
  try {
    const { data: o, error } = await supabase.from("ven_ordenes").select("id, numero, fase, total, cod_esperado, intentos, unidad_id, fecha, congelada, congelada_motivo, stock_reservado, stock_descontado, repartidor_id, codigo_entrega").eq("id", ordenId).maybeSingle();
    if (error || !o) return { error: error?.message ?? "No encontré la orden." };
    const actual = o.fase as Fase | null;
    if (!actual) return { error: "Esta orden es anterior al ciclo y no se mueve desde aquí." };
    if (!puedePasar(actual, fase)) return { error: `Una orden ${actual.replace("_", " ")} no puede pasar a ${fase.replace("_", " ")}.` };

    if (o.congelada) return { error: `La orden está congelada${o.congelada_motivo ? `: ${o.congelada_motivo}` : ""}. Descongélala para moverla.` };
    const { data: cierres } = await supabase.from("ven_cierres").select("periodo");
    if (mesCerrado(String(o.fecha), ((cierres ?? []) as { periodo: string }[]).map((c) => c.periodo))) return { error: "El mes de esta orden está cerrado." };
    const { data: cfgU } = await supabase.from("ven_config").select("valor").eq("clave", "umbrales").maybeSingle();
    const umbrales = leerUmbrales(cfgU?.valor);
    const unidadId = String(o.unidad_id);
    let avisoFinal: string | undefined;

    const ahora = new Date().toISOString();
    const set: Record<string, unknown> = { fase, estado_entrega: ESTADO_DE_FASE[fase], actualizado_en: ahora };
    let detalle: string | null = texto(cambio.motivo, 300);
    if (fase === "confirmada") {
      const sinStock = await faltaStock(supabase, unidadId, ordenId);
      if (sinStock) return { error: sinStock };
      set.confirmada_en = ahora;
      set.confirmada_por = quien;
      // Al confirmar se puede dejar definido con quién se envía (se confirma de nuevo al despachar).
      if (cambio.repartidorId && UUID.test(cambio.repartidorId)) set.repartidor_id = cambio.repartidorId;
      const t = texto(cambio.transportista, 80);
      if (t) set.transportista = t;
      if (set.repartidor_id || t) {
        let con = t;
        if (set.repartidor_id) {
          const { data: rep } = await supabase.from("del_repartidores").select("nombre").eq("id", set.repartidor_id as string).maybeSingle();
          con = rep ? String(rep.nombre) : t;
        }
        detalle = `Envía ${con}`;
      }
    }
    if (fase === "despachada") {
      const d = { repartidorId: cambio.repartidorId ?? null, transportista: texto(cambio.transportista, 80), guia: texto(cambio.guia, 80) };
      if (d.repartidorId && !UUID.test(d.repartidorId)) return { error: "Mensajero inválido." };
      const e = validarDespacho(d);
      if (e) return { error: e };
      let nombre = d.transportista;
      if (d.repartidorId) {
        const { data: rep } = await supabase.from("del_repartidores").select("nombre, activo").eq("id", d.repartidorId).maybeSingle();
        if (!rep || !rep.activo) return { error: "Ese mensajero no existe o está inactivo." };
        nombre = String(rep.nombre);
      }
      if (d.repartidorId && Number(o.cod_esperado ?? 0) > 0) {
        const { data: cfgM } = await supabase.from("ven_mensajero_config").select("limite_efectivo, capacidad_diaria, comision_entrega").eq("repartidor_id", d.repartidorId).maybeSingle();
        if (cfgM?.limite_efectivo) {
          const { data: mano } = await supabase.from("ven_cod_saldo").select("pendiente").eq("repartidor_id", d.repartidorId).gt("pendiente", 0);
          const enMano = ((mano ?? []) as { pendiente: number | string }[]).reduce((a, x) => a + Number(x.pendiente), 0);
          if (excedeLimiteEfectivo(enMano, Number(cfgM.limite_efectivo))) return { error: `${nombre} ya tiene ${enMano.toFixed(2)} en efectivo sin devolver (su límite es ${Number(cfgM.limite_efectivo).toFixed(2)}). Que remita antes.` };
        }
        if (cfgM?.capacidad_diaria) {
          const { count } = await supabase.from("ven_ordenes").select("id", { count: "exact", head: true }).eq("repartidor_id", d.repartidorId).eq("fase", "despachada");
          if ((count ?? 0) >= Number(cfgM.capacidad_diaria)) avisoFinal = `${nombre} ya tiene ${count} órdenes en ruta (su capacidad es ${cfgM.capacidad_diaria}).`;
        }
        if (cfgM?.comision_entrega !== null && cfgM?.comision_entrega !== undefined) set.comision_mensajero = Number(cfgM.comision_entrega);
      }
      const { data: tc } = await supabase.from("ven_tiendas_conexion").select("pasarela_pct, pasarela_fijo").eq("unidad_id", unidadId).maybeSingle();
      if (tc && Number(tc.pasarela_pct) + Number(tc.pasarela_fijo) > 0 && o.cod_esperado === null) set.comision_pasarela = comisionPasarela(Number(o.total), Number(tc.pasarela_pct), Number(tc.pasarela_fijo));
      const prom = cambio.prometidaPara && /^\d{4}-\d{2}-\d{2}$/.test(cambio.prometidaPara) ? cambio.prometidaPara : null;
      if (prom) set.prometida_para = prom;
      if (cambio.retiroEnPunto) set.retiro_en_punto = true;
      Object.assign(set, { repartidor_id: d.repartidorId, transportista: d.transportista ?? nombre, guia: d.guia, despachada_en: ahora, fecha_envio: ahora.slice(0, 10), motivo_fallo: null });
      detalle = `Con ${nombre}${d.guia ? ` · guía ${d.guia}` : ""}`;
    }
    if (fase === "fallida") {
      const cod = MOTIVOS_FALLO.find((m) => m.codigo === cambio.motivoCodigo);
      if (!detalle && !cod) return { error: "Elige o anota por qué falló la entrega." };
      detalle = [cod?.etiqueta, detalle].filter(Boolean).join(": ");
      set.motivo_fallo = detalle;
      if (cod) set.motivo_fallo_codigo = cod.codigo;
      set.intentos = Number(o.intentos ?? 0) + 1;
      if (cambio.reprogramadaPara) {
        const t = Date.parse(cambio.reprogramadaPara);
        if (Number.isFinite(t)) set.reprogramada_para = new Date(t).toISOString();
      }
    }
    if (fase === "entregada") {
      set.entregada_en = ahora;
      if (Number(o.cod_esperado ?? 0) > 0) {
        const cobrado = cambio.cobrado === null || cambio.cobrado === undefined ? Number(o.cod_esperado) : Math.round(Number(cambio.cobrado) * 100) / 100;
        if (!Number.isFinite(cobrado) || cobrado < 0 || cobrado > Number(o.cod_esperado) * 2) return { error: "El monto cobrado no es válido." };
        const dif = diferenciaCobro(Number(o.cod_esperado), cobrado);
        if (dif.tipo !== "exacto" && !texto(cambio.motivoDiferencia, 200)) return { error: `Cobró ${dif.tipo === "faltante" ? "menos" : "más"} de lo esperado (${dif.diferencia.toFixed(2)}): anota el motivo.` };
        set.cod_cobrado = cobrado;
        detalle = dif.tipo !== "exacto" ? `Cobró ${cobrado.toFixed(2)} de ${Number(o.cod_esperado).toFixed(2)}: ${texto(cambio.motivoDiferencia, 200)}` : detalle;
      }
      const rn = texto(cambio.recibeNombre, 80);
      if (rn) {
        set.recibe_nombre = rn;
        set.recibe_documento = texto(cambio.recibeDocumento, 40);
        detalle = `${detalle ? detalle + " · " : ""}Recibió ${rn}`;
      }
      if (o.codigo_entrega) {
        if (!cambio.codigo || String(cambio.codigo).trim() !== String(o.codigo_entrega)) return { error: "El código de entrega no coincide." };
      }
    }
    if (fase === "devuelta" || fase === "cancelada") {
      if (!detalle) return { error: fase === "cancelada" ? "Anota por qué se cancela." : "Anota por qué volvió la orden." };
      if (fase === "cancelada" && pideAprobacion(Number(o.total), umbrales)) {
        const { data: ok } = await supabase.from("ven_aprobaciones").select("id").eq("accion", "cancelar_orden").eq("referencia", ordenId).eq("estado", "aprobada").maybeSingle();
        if (!ok) {
          const { data: pend } = await supabase.from("ven_aprobaciones").select("id").eq("accion", "cancelar_orden").eq("referencia", ordenId).eq("estado", "pendiente").maybeSingle();
          if (!pend) await supabase.from("ven_aprobaciones").insert({ accion: "cancelar_orden", referencia: ordenId, detalle, monto: Number(o.total), solicitada_por: quien });
          revalidatePath(RUTA);
          return { ok: true, aviso: "Por el monto, otra persona debe aprobar la cancelación. Quedó pendiente en Control." };
        }
      }
      set.motivo_cancelacion = detalle;
      set.cod_esperado = null;
    }
    if (fase === "fallida" && debePasarADevolucion(Number(set.intentos ?? 0), umbrales)) {
      // Agotó los intentos: la orden vuelve en vez de reprogramarse.
      set.fase = "devuelta";
      set.estado_entrega = ESTADO_DE_FASE.devuelta;
      set.motivo_cancelacion = `Agotó ${set.intentos} intentos de entrega (${detalle})`;
      set.cod_esperado = null;
      avisoFinal = `Llegó a ${set.intentos} intentos fallidos: la orden pasó a devuelta.`;
    }
    // Condición sobre la fase de antes: si otra persona la movió a la vez, no se pisa.
    const { data: hecho, error: eu } = await supabase.from("ven_ordenes").update(set).eq("id", ordenId).eq("fase", actual).select("id");
    if (eu) return { error: eu.message };
    if (!hecho?.length) return { error: "Otra persona acaba de mover esta orden. Recarga la página." };
    const faseFinal = (set.fase as Fase) ?? fase;
    // Inventario (solo si la tienda tiene bodega): reserva al confirmar, descuento al despachar, libera si se cancela.
    let errStock: string | null = null;
    if (faseFinal === "confirmada" && !o.stock_reservado) {
      errStock = await aplicarStock(supabase, unidadId, ordenId, String(o.numero), "reserva");
      if (!errStock) await supabase.from("ven_ordenes").update({ stock_reservado: true }).eq("id", ordenId);
    } else if (faseFinal === "despachada" && !o.stock_descontado) {
      if (!o.stock_reservado) errStock = await aplicarStock(supabase, unidadId, ordenId, String(o.numero), "reserva");
      if (!errStock) errStock = await aplicarStock(supabase, unidadId, ordenId, String(o.numero), "despacho");
      if (!errStock) await supabase.from("ven_ordenes").update({ stock_reservado: false, stock_descontado: true }).eq("id", ordenId);
    } else if (faseFinal === "cancelada" && o.stock_reservado && !o.stock_descontado) {
      errStock = await aplicarStock(supabase, unidadId, ordenId, String(o.numero), "liberacion");
      if (!errStock) await supabase.from("ven_ordenes").update({ stock_reservado: false }).eq("id", ordenId);
    }
    if (errStock) avisoFinal = `${avisoFinal ? avisoFinal + " " : ""}La orden cambió, pero el inventario no se movió: ${errStock}`;
    await supabase.from("ven_orden_eventos").insert({ orden_id: ordenId, tipo: "fase", fase_antes: actual, fase_despues: faseFinal, detalle, usuario: quien });
    await registrarAuditoria({ accion: "fase_orden_venta", entidad: "ven_ordenes", entidadId: ordenId, detalle: `${o.numero}: ${actual} → ${fase}${detalle ? ` (${detalle})` : ""}` });
    await avisoAutomaticoDeFase(supabase, ordenId, faseFinal);
    revalidatePath(RUTA);
    return { ok: true, aviso: avisoFinal };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
