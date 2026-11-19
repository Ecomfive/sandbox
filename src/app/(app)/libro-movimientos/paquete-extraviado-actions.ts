"use server";

// «Paquete extraviado» del Libro de movimientos (migración 0985): la mercadería perdida como merma y lo que paga el
// repartidor como otros ingresos, en dos movimientos. Repetir el mismo pedido actualiza en vez de duplicar (llave por
// tienda + pedido). Devuelve el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { dinero } from "@/lib/af4/formato";
import { hoyPanama } from "@/lib/af4/fecha";
import { sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";
import {
  ORIGEN_EXTRAVIADO,
  TIPO_INDEMNIZACION,
  TIPO_MERCADERIA_EXTRAVIADA,
  claveExtraviado,
  leerExtraviado,
  movimientosExtraviado,
  perdidaNeta,
} from "@/lib/finanzas/paquete-extraviado";
import { createServiceClient } from "@/lib/supabase/server";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

export async function registrarPaqueteExtraviado(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("libro-movimientos");
    const d = leerExtraviado((k) => formData.get(k));
    if ("error" in d) return d;
    const acceso = await sinAccesoAUnidades([d.unidadId]);
    if (acceso) return { error: acceso };
    const supabase = createServiceClient();
    const claves = [claveExtraviado(d.unidadId, d.pedido, "merma"), claveExtraviado(d.unidadId, d.pedido, "pago")];
    const [unidad, tipos, cuenta, previos] = await Promise.all([
      supabase.from("fin_unidades").select("nombre").eq("id", d.unidadId).maybeSingle(),
      supabase.from("fin_tipos").select("id, nombre").in("nombre", [TIPO_MERCADERIA_EXTRAVIADA, TIPO_INDEMNIZACION]),
      d.cuentaId ? supabase.from("fin_cuentas").select("nombre").eq("id", d.cuentaId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("fin_movimientos").select("id, origen_clave, editado_a_mano, monto").in("origen_clave", claves),
    ]);
    if (!unidad.data) return { error: "La tienda no existe." };
    if (d.cuentaId && !cuenta.data) return { error: "La cuenta no existe." };
    const idTipo = new Map((tipos.data ?? []).map((t) => [t.nombre as string, t.id as string]));
    if (idTipo.size < 2) return { error: "Falta correr la migración 0985 en Supabase (tipos del paquete extraviado)." };
    const previo = new Map((previos.data ?? []).map((p) => [p.origen_clave as string, p]));
    if ((previos.data ?? []).some((p) => p.editado_a_mano)) return { error: "Ese pedido ya está registrado y se corrigió a mano en el libro: cámbialo ahí." };

    const movs = movimientosExtraviado(d);
    const ahora = new Date().toISOString();
    for (const m of movs) {
      const fila = {
        periodo: m.periodo,
        unidad_id: d.unidadId,
        tipo_id: idTipo.get(m.tipo)!,
        descripcion: m.descripcion,
        monto: m.monto,
        en_eerr: m.en_eerr,
        en_flujo: m.en_flujo,
        cuenta_id: m.cuenta_id,
        fecha_pago: m.fecha_pago,
        fecha_servicio: d.fecha,
      };
      const p = previo.get(m.origen_clave);
      const { error } = p
        ? await supabase.from("fin_movimientos").update({ ...fila, actualizado_en: ahora }).eq("id", p.id)
        : await supabase.from("fin_movimientos").insert({ ...fila, fecha_registro: hoyPanama(), origen: ORIGEN_EXTRAVIADO, origen_clave: m.origen_clave, creado_por: usuario.id });
      if (error) return { error: error.message.includes("está cerrado") ? error.message : `No se pudo guardar: ${error.message}` };
    }
    // Una parte que antes existía y ahora va en cero se quita (p. ej., el repartidor al final no pagó).
    const quedan = new Set(movs.map((m) => m.origen_clave));
    const sobran = (previos.data ?? []).filter((p) => !quedan.has(p.origen_clave as string)).map((p) => p.id as string);
    if (sobran.length) {
      const { error } = await supabase.from("fin_movimientos").delete().in("id", sobran);
      if (error) return { error: error.message.includes("está cerrado") ? error.message : "No se pudo quitar la parte que ya no va." };
    }

    await registrarAuditoria({
      accion: "paquete_extraviado_libro",
      entidad: "fin_movimientos",
      detalle: `Pedido ${d.pedido} · ${unidad.data.nombre}${d.repartidor ? ` · ${d.repartidor}` : ""}`,
      antes: previos.data?.length ? { Movimientos: String(previos.data.length) } : undefined,
      despues: {
        "Mercadería perdida": usd(d.costo),
        "Pagó el repartidor": usd(d.indemnizacion),
        "Pérdida neta": usd(perdidaNeta(d)),
        ...(cuenta.data ? { Cuenta: cuenta.data.nombre as string } : {}),
      },
    });
    revalidatePath("/libro-movimientos", "layout");
    revalidatePath("/estado-resultados");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el paquete extraviado." };
  }
}
