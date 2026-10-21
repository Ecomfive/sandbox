// Portal del proveedor: lo que hace el proveedor (cotizar, marcar enviado) se aplica a la COMPRA, que es la fuente; el disparador de la
// migración 0124 trae el cambio de vuelta al espejo. Cada cambio deja su evento y su línea en la Actividad de la compra, la
// auditoría, una novedad para Ecomfive y el aviso en la campana de quien recibe los avisos del proveedor (Francis). Solo servidor:
// quien llama ya comprobó la cuenta (`cuentaProveedorActual`).

import { randomUUID } from "node:crypto";
import { nuevaPlanificacion } from "@/lib/compras/planificacion";
import { cargarTiempos, claveTransito } from "@/lib/compras/tiempos-datos";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";
import type { CuentaProveedor } from "./cuenta";
import { validarCotizacion } from "./cotizacion";
import type { EtapaPortal } from "./espejo";
import { diasEntre, hoyPanama } from "./fechas";
import { puedePasar } from "./permisos-proveedor";
import { BUCKET_PROVEEDOR, MAX_BYTES_FOTO, rutaEsDelPedido } from "./rutas";

const BUCKET_COMPRAS = "wms-compras";
const MAX_COMENTARIO = 600;
/** Hasta cuántos días atrás se acepta una fecha de envío (un envío que se olvidó marcar). */
const DIAS_ENVIO_ATRAS = 60;

type Resultado = { error?: string };
type Supabase = ReturnType<typeof createServiceClient>;

interface Pedido {
  id: string;
  compra_id: string;
  proveedor_id: string;
  producto: string;
  etapa: EtapaPortal;
  visible: boolean;
  foto_real_ruta: string | null;
}

const dinero = (n: number, d = 2) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;

async function pedidoDe(supabase: Supabase, cuenta: CuentaProveedor, pedidoId: string): Promise<Pedido | { error: string }> {
  const { data } = await supabase.from("proveedor_pedidos").select("id, compra_id, proveedor_id, producto, etapa, visible, foto_real_ruta").eq("id", pedidoId).maybeSingle();
  // Un pedido de otro proveedor responde igual que uno que no existe.
  if (!data || data.proveedor_id !== cuenta.proveedor.id || !data.visible) return { error: "Ese pedido ya no está en tu portal." };
  return data as Pedido;
}

const autorDe = (cuenta: CuentaProveedor) => `${cuenta.proveedor.nombre} (proveedor)`;

/** Novedad para «Novedades del proveedor», aviso en la campana y línea en la auditoría. */
async function avisarAEcomfive(supabase: Supabase, cuenta: CuentaProveedor, p: Pedido, tipo: "cotizacion" | "envio", texto: string, detalle: string, pestana: string) {
  await Promise.all([
    supabase.from("proveedor_novedades").insert({ proveedor_id: cuenta.proveedor.id, pedido_id: p.id, lado: "proveedor", tipo, texto, detalle, autor_nombre: cuenta.nombre }),
    cuenta.proveedor.notificarA
      ? supabase.from("notificaciones_usuario").insert({ usuario_id: cuenta.proveedor.notificarA, tipo: "proveedor", titulo: texto, texto: detalle, href: `/portal-proveedor?tab=${pestana}`, autor_nombre: autorDe(cuenta) })
      : Promise.resolve(),
    supabase.from("historial_auditoria").insert({ usuario_id: null, usuario_nombre: autorDe(cuenta), accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: p.compra_id, detalle: `${texto}. ${detalle}` }),
  ]);
}

/** Un cambio de etapa en la compra: el evento (de ahí salen los tiempos por etapa) con el proveedor como autor. */
async function anotarEtapa(supabase: Supabase, cuenta: CuentaProveedor, compraId: string, antes: string, despues: string) {
  if (antes === despues) return;
  await supabase.from("wms_compra_eventos").insert({ compra_id: compraId, campo: "etapa", valor_antes: antes, valor_despues: despues, autor: autorDe(cuenta), origen: "proveedor" });
}

/** Revisa la foto subida (por su contenido, no por su nombre) y la copia a las fotos de la compra. Devuelve su ruta en Compras. */
async function revisarFoto(supabase: Supabase, cuenta: CuentaProveedor, p: Pedido, ruta: string): Promise<{ rutaCompra: string; nombre: string; extension: string; tamano: number } | { error: string }> {
  if (!rutaEsDelPedido(ruta, cuenta.proveedor.id, p.id)) return { error: "La foto no es de este pedido." };
  const { data: archivo, error } = await supabase.storage.from(BUCKET_PROVEEDOR).download(ruta);
  if (error || !archivo) return { error: "No se encontró la foto subida. Vuelve a elegirla." };
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const imagen = bytes.length <= MAX_BYTES_FOTO ? detectarImagen(bytes) : null;
  if (!imagen) {
    await supabase.storage.from(BUCKET_PROVEEDOR).remove([ruta]);
    return { error: bytes.length > MAX_BYTES_FOTO ? "La foto pesa más de 10 MB." : "La foto debe ser una imagen JPG, PNG, WebP o GIF." };
  }
  const rutaCompra = `comentarios/${p.compra_id}/proveedor-${randomUUID()}.${imagen.extension}`;
  const { error: errorCopia } = await supabase.storage.from(BUCKET_COMPRAS).upload(rutaCompra, bytes, { contentType: imagen.tipo, upsert: false });
  if (errorCopia) return { error: "No se pudo guardar la foto. Inténtalo de nuevo." };
  return { rutaCompra, nombre: `Foto real (${cuenta.proveedor.nombre}).${imagen.extension}`, extension: imagen.extension, tamano: bytes.length };
}

/**
 * Cotizar (o corregir la cotización mientras Ecomfive no decide): unidades (las de la caja), costo por unidad o total, foto real y
 * comentario. La compra pasa a «Cotizado» con esas unidades y ese monto en un solo cambio (así el espejo conserva las unidades que
 * pidió Ecomfive para mostrar «pediste 1,000»).
 */
export async function aplicarCotizacion(
  cuenta: CuentaProveedor,
  pedidoId: string,
  entrada: { unidades: unknown; costoUnitario?: unknown; montoTotal?: unknown; comentario?: unknown; fotoRuta?: unknown },
): Promise<Resultado> {
  const supabase = createServiceClient();
  const p = await pedidoDe(supabase, cuenta, pedidoId);
  if ("error" in p) return p;
  if (!puedePasar("proveedor", p.etapa, "cotizado")) return { error: "Este pedido ya no se puede cotizar: Ecomfive ya decidió." };
  const cot = validarCotizacion(entrada);
  if ("error" in cot) return cot;
  const comentario = typeof entrada.comentario === "string" ? entrada.comentario.trim().slice(0, MAX_COMENTARIO) : "";

  const { data: compra } = await supabase.from("wms_compras").select("id, etapa, qty_total, monto_total, anulada_en").eq("id", p.compra_id).maybeSingle();
  if (!compra || compra.anulada_en) return { error: "Este pedido ya no está activo." };
  const foto = entrada.fotoRuta ? await revisarFoto(supabase, cuenta, p, String(entrada.fotoRuta)) : null;
  if (foto && "error" in foto) return foto;

  // Con un solo producto en la compra, la cantidad y el costo van en su línea (de ahí salen la QTY y el monto de la compra).
  const { data: lineas } = await supabase.from("wms_compra_items").select("id").eq("compra_id", p.compra_id);
  if ((lineas ?? []).length === 1) {
    const { error } = await supabase.from("wms_compra_items").update({ cantidad_pedida: cot.unidades, costo_unitario: cot.costoUnitario }).eq("id", lineas![0].id);
    if (error) return { error: "No se pudo guardar la cotización." };
  }
  const { error: errorCompra } = await supabase
    .from("wms_compras")
    .update({ qty_total: cot.unidades, monto_total: cot.montoTotal, etapa: "cotizado", actualizado_en: new Date().toISOString() })
    .eq("id", p.compra_id);
  if (errorCompra) return { error: "No se pudo guardar la cotización." };

  await anotarEtapa(supabase, cuenta, p.compra_id, compra.etapa as string, "cotizado");
  const resumen = `${entero(cot.unidades)} u. · ${dinero(cot.costoUnitario)} por unidad · ${dinero(cot.montoTotal)}`;
  const { data: nota } = await supabase
    .from("wms_compra_comentarios")
    .insert({ compra_id: p.compra_id, autor: autorDe(cuenta), texto: `Cotización de ${cuenta.proveedor.nombre}: ${resumen}${comentario ? `\n${comentario}` : ""}` })
    .select("id")
    .single();
  if (foto && nota) {
    await supabase.from("wms_compra_adjuntos").insert({ compra_id: p.compra_id, comentario_id: nota.id, nombre: foto.nombre, extension: foto.extension, tamano: foto.tamano, clase: "foto", origen: "proveedor", ruta: foto.rutaCompra, subido_por: autorDe(cuenta) });
  }
  await supabase
    .from("proveedor_pedidos")
    .update({ comentario_proveedor: comentario || null, cotizado_en: new Date().toISOString(), ...(foto ? { foto_real_ruta: String(entrada.fotoRuta) } : {}) })
    .eq("id", p.id);
  // La foto anterior, si se reemplazó.
  if (foto && p.foto_real_ruta && p.foto_real_ruta !== entrada.fotoRuta) await supabase.storage.from(BUCKET_PROVEEDOR).remove([p.foto_real_ruta]);

  const corrigio = p.etapa === "cotizado";
  await avisarAEcomfive(
    supabase,
    cuenta,
    p,
    "cotizacion",
    `${cuenta.proveedor.nombre} ${corrigio ? "corrigió la cotización de" : "cotizó"} ${p.producto}`,
    `${resumen}${foto ? " · subió la foto real" : ""}${comentario ? ` · «${comentario}»` : ""}`,
    "decidir",
  );
  return {};
}

/** Marcar enviado: la compra pasa a «Tracking» con su fecha de envío (y su planificación, como en Compras). Empiezan los plazos de pago. */
export async function aplicarEnvio(cuenta: CuentaProveedor, pedidoId: string, fecha: unknown): Promise<Resultado & { fechaEnvio?: string }> {
  const supabase = createServiceClient();
  const p = await pedidoDe(supabase, cuenta, pedidoId);
  if ("error" in p) return p;
  if (!puedePasar("proveedor", p.etapa, "enviado")) return { error: "Solo se marca enviado lo que está en producción." };
  const hoy = hoyPanama();
  const f = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  if (!f || diasEntre(f, hoy) < 0) return { error: "La fecha de envío no puede ser futura." };
  if (diasEntre(f, hoy) > DIAS_ENVIO_ATRAS) return { error: `La fecha de envío no puede ser de hace más de ${DIAS_ENVIO_ATRAS} días.` };

  const { data: compra } = await supabase.from("wms_compras").select("id, etapa, tipo, pais_id, via_envio, fecha_envio, planificacion, anulada_en").eq("id", p.compra_id).maybeSingle();
  if (!compra || compra.anulada_en) return { error: "Este pedido ya no está activo." };
  const planificacion = nuevaPlanificacion(
    await cargarTiempos(),
    { fechaEnvio: compra.fecha_envio as string | null, planificacion: compra.planificacion as string | null },
    { clave: claveTransito(compra.tipo as string, compra.pais_id as string | null), vias: (compra.via_envio as string[] | null) ?? [], fechaEnvio: f },
  );
  const { error } = await supabase.from("wms_compras").update({ etapa: "tracking", fecha_envio: f, planificacion, actualizado_en: new Date().toISOString() }).eq("id", p.compra_id);
  if (error) return { error: "No se pudo marcar el envío." };
  await anotarEtapa(supabase, cuenta, p.compra_id, compra.etapa as string, "tracking");
  await supabase.from("wms_compra_eventos").insert({ compra_id: p.compra_id, campo: "fechaEnvio", valor_antes: (compra.fecha_envio as string | null) ?? null, valor_despues: f, autor: autorDe(cuenta), origen: "proveedor" });
  await supabase.from("proveedor_pedidos").update({ enviado_marcado_en: new Date().toISOString() }).eq("id", p.id);

  const vence = new Date(Date.parse(f) + cuenta.proveedor.diasAnticipo * 864e5).toISOString().slice(0, 10);
  await avisarAEcomfive(supabase, cuenta, p, "envio", `${cuenta.proveedor.nombre} marcó ${p.producto} como enviado el ${fechaCorta(f)}`, `El anticipo vence el ${fechaCorta(vence)}`, "transito");
  return { fechaEnvio: f };
}
