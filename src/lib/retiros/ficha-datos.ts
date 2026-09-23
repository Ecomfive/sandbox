import { createServiceClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { ESTADO_ETIQUETA } from "./estados";
import type { FichaRetiro } from "./ficha";

/** Trae un retiro con todo lo que lleva su ficha. Devuelve null si no existe. */
export async function cargarFicha(id: string, generadoPor: string): Promise<FichaRetiro | null> {
  const supabase = createServiceClient();
  const { data: retiro } = await supabase
    .from("retiros")
    .select(
      "numero_correlativo, monto, comision, monto_neto, a_recibir, monto_recibido, estado, fecha, fecha_recibido, fecha_cierre, fecha_limite, notas, soporte_numero, estado_dropi, dropi_id, plataformas(nombre), cuentas_retiro(nombre, detalle), paises(codigo, nombre), perfiles(nombre, email)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!retiro) return null;

  const plataforma = retiro.plataformas as unknown as { nombre: string } | null;
  const cuenta = retiro.cuentas_retiro as unknown as { nombre: string; detalle: string | null } | null;
  const pais = retiro.paises as unknown as { codigo: string; nombre: string } | null;
  const asignado = retiro.perfiles as unknown as { nombre: string | null; email: string } | null;

  return {
    correlativo: Number(retiro.numero_correlativo),
    estado: ESTADO_ETIQUETA[retiro.estado] ?? retiro.estado,
    plataforma: plataforma?.nombre ?? "—",
    destino: cuenta?.nombre ?? "—",
    destinoDetalle: cuenta?.detalle ?? null,
    pais: pais?.nombre ?? "—",
    codigoPais: pais?.codigo ?? "PA",
    fecha: retiro.fecha,
    fechaLimite: retiro.fecha_limite,
    asignado: asignado ? (asignado.nombre || asignado.email) : null,
    estadoDropi: retiro.estado_dropi ? ETIQUETA_ESTADO_DROPI[retiro.estado_dropi as EstadoDropi] : null,
    dropiId: retiro.dropi_id === null ? null : Number(retiro.dropi_id),
    monto: Number(retiro.monto),
    comision: Number(retiro.comision),
    aRecibir: Number(retiro.a_recibir ?? retiro.monto_neto),
    montoRecibido: retiro.monto_recibido === null ? null : Number(retiro.monto_recibido),
    soporte: retiro.soporte_numero,
    fechaRecibido: retiro.fecha_recibido,
    fechaCierre: retiro.fecha_cierre,
    notas: retiro.notas,
    generadoPor,
    generadoEn: new Date().toISOString(),
  };
}
