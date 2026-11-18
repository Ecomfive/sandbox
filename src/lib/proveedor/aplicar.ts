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
import { validarCajas } from "./cajas";
import { validarCotizacion } from "./cotizacion";
import type { EtapaPortal } from "./espejo";
import { diasEntre, hoyPanama } from "./fechas";
import { puedePasar } from "./permisos-proveedor";
import { BUCKET_PROVEEDOR, MAX_BYTES_FOTO, MAX_ETIQUETAS, rutaEsDelPedido, rutaEsEtiquetaDelPedido } from "./rutas";

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

/** Novedad del proveedor, aviso en la campana (lleva a la compra) y línea en la auditoría. */
async function avisarAEcomfive(supabase: Supabase, cuenta: CuentaProveedor, p: Pedido, tipo: "cotizacion" | "envio", texto: string, detalle: string) {
  await Promise.all([
    supabase.from("proveedor_novedades").insert({ proveedor_id: cuenta.proveedor.id, pedido_id: p.id, lado: "proveedor", tipo, texto, detalle, autor_nombre: cuenta.nombre }),
    cuenta.proveedor.notificarA
      ? supabase.from("notificaciones_usuario").insert({ usuario_id: cuenta.proveedor.notificarA, tipo: "proveedor", titulo: texto, texto: detalle, href: `/compras/lista?ver=todos&abrir=${p.compra_id}`, autor_nombre: autorDe(cuenta) })
      : Promise.resolve(),
    supabase.from("historial_auditoria").insert({ usuario_id: null, usuario_nombre: autorDe(cuenta), accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: p.compra_id, detalle: `${texto}. ${detalle}` }),
  ]);
}

/** Un cambio de etapa en la compra: el evento (de ahí salen los tiempos por etapa) con el proveedor como autor. */
async function anotarEtapa(supabase: Supabase, cuenta: CuentaProveedor, compraId: string, antes: string, despues: string) {
  if (antes === despues) return;
  await supabase.from("wms_compra_eventos").insert({ compra_id: compraId, campo: "etapa", valor_antes: antes, valor_despues: despues, autor: autorDe(cuenta), origen: "proveedor" });
}

/**
 * Revisa la imagen subida (por su contenido, no por su nombre) y la copia a las fotos de la compra. Devuelve su ruta en Compras. `tipo`: la foto real del producto o la
 * etiqueta de las cajas (16 nov 2026): cada una vive en su carpeta del pedido y una no vale como la otra.
 */
async function revisarFoto(
  supabase: Supabase,
  cuenta: CuentaProveedor,
  p: Pedido,
  ruta: string,
  tipo: "foto" | "etiqueta" = "foto",
): Promise<{ rutaCompra: string; nombre: string; extension: string; tamano: number } | { error: string }> {
  const esDelPedido = tipo === "foto" ? rutaEsDelPedido(ruta, cuenta.proveedor.id, p.id) : rutaEsEtiquetaDelPedido(ruta, cuenta.proveedor.id, p.id);
  if (!esDelPedido) return { error: tipo === "foto" ? "La foto no es de este pedido." : "La etiqueta no es de este pedido." };
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
  const nombre = tipo === "foto" ? `Foto real (${cuenta.proveedor.nombre}).${imagen.extension}` : `Etiqueta de las cajas (${cuenta.proveedor.nombre}).${imagen.extension}`;
  return { rutaCompra, nombre, extension: imagen.extension, tamano: bytes.length };
}

const SIN_MIGRACION_CAJAS = "Falta correr la migración 0299 (cajas y etiquetas del proveedor) en Supabase.";

/**
 * Las cajas («Cartons») de un envío y la etiqueta de las cajas (16 nov 2026, pedido de Hernán). Las cajas y las imágenes quedan en el espejo (`proveedor_pedidos`) para el portal y,
 * para Compras, en la Actividad de la compra: un comentario del proveedor con las etiquetas adjuntas (copiadas a las fotos de la compra) y el cambio de «Cajas». `nuevas` son rutas
 * recién subidas al bucket del portal y `quitar` rutas que ya tenía y se retiran (la copia que ya está en Compras se queda como historia). Devuelve las rutas que quedan.
 */
async function guardarCajas(
  supabase: Supabase,
  cuenta: CuentaProveedor,
  p: Pedido,
  entrada: { cajas: unknown; nuevas?: unknown; quitar?: unknown },
  opciones: { avisar: boolean; /** Lo anotó Ecomfive (no el proveedor): su nombre y el origen «sistema». */ ecomfive?: string },
): Promise<{ cajas: number; etiquetas: string[] } | { error: string }> {
  const autor = opciones.ecomfive ?? autorDe(cuenta);
  const origen = opciones.ecomfive ? "sistema" : "proveedor";
  const valida = validarCajas(entrada.cajas);
  if ("error" in valida) return valida;
  const nuevas = Array.isArray(entrada.nuevas) ? entrada.nuevas.map(String) : [];
  const quitar = Array.isArray(entrada.quitar) ? entrada.quitar.map(String) : [];
  const { data: fila, error: errorLectura } = await supabase.from("proveedor_pedidos").select("cajas, etiquetas_rutas").eq("id", p.id).maybeSingle();
  if (errorLectura || !fila) return { error: /cajas|etiquetas_rutas|schema cache/i.test(errorLectura?.message ?? "") ? SIN_MIGRACION_CAJAS : "No se pudieron guardar las cajas." };
  const actuales = ((fila.etiquetas_rutas as string[] | null) ?? []).map(String);
  if (quitar.some((r) => !actuales.includes(r))) return { error: "Esa etiqueta ya no está en el pedido." };
  if (new Set(nuevas).size !== nuevas.length || nuevas.some((r) => actuales.includes(r))) return { error: "La etiqueta no es de este pedido." };
  const quedan = [...actuales.filter((r) => !quitar.includes(r)), ...nuevas];
  if (quedan.length > MAX_ETIQUETAS) return { error: `Un pedido lleva hasta ${MAX_ETIQUETAS} imágenes de etiqueta.` };

  const revisadas: { rutaCompra: string; nombre: string; extension: string; tamano: number }[] = [];
  for (const ruta of nuevas) {
    const r = await revisarFoto(supabase, cuenta, p, ruta, "etiqueta");
    if ("error" in r) {
      // Lo ya copiado a Compras en esta vuelta no se deja suelto.
      if (revisadas.length) await supabase.storage.from(BUCKET_COMPRAS).remove(revisadas.map((x) => x.rutaCompra));
      return r;
    }
    revisadas.push(r);
  }

  const { error } = await supabase.from("proveedor_pedidos").update({ cajas: valida.cajas, etiquetas_rutas: quedan }).eq("id", p.id);
  if (error) {
    if (revisadas.length) await supabase.storage.from(BUCKET_COMPRAS).remove(revisadas.map((x) => x.rutaCompra));
    return { error: "No se pudieron guardar las cajas." };
  }
  if (quitar.length) await supabase.storage.from(BUCKET_PROVEEDOR).remove(quitar);

  const cajasAntes = fila.cajas == null ? null : Number(fila.cajas);
  const cambioCajas = cajasAntes !== valida.cajas;
  if (cambioCajas) {
    await supabase
      .from("wms_compra_eventos")
      .insert({ compra_id: p.compra_id, campo: "cajas", valor_antes: cajasAntes == null ? null : String(cajasAntes), valor_despues: String(valida.cajas), autor, origen });
  }
  if (cambioCajas || revisadas.length) {
    const texto = `${opciones.ecomfive ? `Cajas de ${cuenta.proveedor.nombre} (anotadas por Ecomfive)` : `Cajas de ${cuenta.proveedor.nombre}`}: ${entero(valida.cajas)} ${valida.cajas === 1 ? "caja" : "cajas"}${revisadas.length ? ` · etiqueta de las cajas adjunta (${revisadas.length})` : ""}`;
    const { data: nota } = await supabase.from("wms_compra_comentarios").insert({ compra_id: p.compra_id, autor, texto }).select("id").single();
    if (nota && revisadas.length) {
      await supabase
        .from("wms_compra_adjuntos")
        .insert(revisadas.map((f) => ({ compra_id: p.compra_id, comentario_id: nota.id, nombre: f.nombre, extension: f.extension, tamano: f.tamano, clase: "foto", origen, ruta: f.rutaCompra, subido_por: autor })));
    }
    if (opciones.avisar) {
      await avisarAEcomfive(
        supabase,
        cuenta,
        p,
        "envio",
        `${cuenta.proveedor.nombre} ${cambioCajas ? "anotó las cajas de" : "subió la etiqueta de las cajas de"} ${p.producto}`,
        `${entero(valida.cajas)} ${valida.cajas === 1 ? "caja" : "cajas"}${revisadas.length ? ` · ${revisadas.length} ${revisadas.length === 1 ? "imagen de etiqueta" : "imágenes de etiqueta"}` : ""}`,
      );
    }
  }
  return { cajas: valida.cajas, etiquetas: quedan };
}

/** Anotar o corregir las cajas y la etiqueta de un pedido que está en producción o ya enviado. */
export async function aplicarCajas(
  cuenta: CuentaProveedor,
  pedidoId: string,
  entrada: { cajas: unknown; nuevas?: unknown; quitar?: unknown },
): Promise<{ error: string } | { cajas: number; etiquetas: string[] }> {
  const supabase = createServiceClient();
  const p = await pedidoDe(supabase, cuenta, pedidoId);
  if ("error" in p) return p;
  if (p.etapa !== "produccion" && p.etapa !== "enviado") return { error: "Las cajas se anotan cuando el pedido está en producción o ya salió." };
  return guardarCajas(supabase, cuenta, p, entrada, { avisar: true });
}

/**
 * Ecomfive anota o corrige a mano las cajas y la etiqueta de las cajas de una compra (16 nov 2026, pedido de Hernán: los envíos viejos no las traen y las pone el equipo). Se escribe en el
 * mismo espejo (`proveedor_pedidos`) que lee el portal del proveedor, así que él lo ve igual que lo que anota él; vale en cualquier etapa. `cajas` vacío deja las que ya tenía (para subir solo
 * la etiqueta); sin cajas anotadas todavía, hay que escribirlas. El proveedor recibe una novedad en «Lo nuevo de Ecomfive».
 */
export async function aplicarCajasEcomfive(
  compraId: string,
  persona: { id: string; nombre: string },
  entrada: { cajas?: unknown; nuevas?: unknown; quitar?: unknown },
): Promise<{ error: string } | { cajas: number; etiquetas: string[]; pedidoId: string }> {
  const supabase = createServiceClient();
  const { data, error: errorLectura } = await supabase
    .from("proveedor_pedidos")
    .select("id, compra_id, proveedor_id, producto, etapa, visible, foto_real_ruta, cajas, proveedores(id, nombre, notificar_a)")
    .eq("compra_id", compraId)
    .maybeSingle();
  if (errorLectura) return { error: /cajas|schema cache/i.test(errorLectura.message) ? SIN_MIGRACION_CAJAS : "No se pudo leer el pedido del proveedor." };
  if (!data || !data.visible) return { error: "Esta compra no está en el portal de un proveedor: no lleva cajas ni etiqueta." };
  const prov = (Array.isArray(data.proveedores) ? data.proveedores[0] : data.proveedores) as { id: string; nombre: string; notificar_a: string | null } | null;
  if (!prov) return { error: "No se encontró el proveedor de esta compra." };
  const vacio = entrada.cajas === undefined || entrada.cajas === null || String(entrada.cajas).trim() === "";
  if (vacio && data.cajas == null) return { error: "Escribe cuántas cajas lleva el envío." };
  const pedido: Pedido = { id: data.id as string, compra_id: data.compra_id as string, proveedor_id: data.proveedor_id as string, producto: data.producto as string, etapa: data.etapa as EtapaPortal, visible: true, foto_real_ruta: (data.foto_real_ruta as string | null) ?? null };
  // La «cuenta» solo sirve para saber de qué proveedor es la carpeta de las imágenes; lo que queda escrito lleva el nombre de la persona.
  const cuenta: CuentaProveedor = { cuentaId: persona.id, usuarioId: persona.id, nombre: persona.nombre, proveedor: { id: prov.id, nombre: prov.nombre, notificarA: prov.notificar_a, diasAnticipo: 0, porcentajeAnticipo: 0 } };
  const r = await guardarCajas(supabase, cuenta, pedido, { cajas: vacio ? data.cajas : entrada.cajas, nuevas: entrada.nuevas, quitar: entrada.quitar }, { avisar: false, ecomfive: persona.nombre });
  if ("error" in r) return r;
  // Para el proveedor: lo que Ecomfive anotó, en «Lo nuevo de Ecomfive» de su portal.
  await supabase.from("proveedor_novedades").insert({
    proveedor_id: prov.id,
    pedido_id: pedido.id,
    lado: "ecomfive",
    tipo: "envio",
    texto: `Ecomfive anotó las cajas y la etiqueta de ${pedido.producto}`,
    detalle: `${entero(r.cajas)} ${r.cajas === 1 ? "caja" : "cajas"} · ${r.etiquetas.length} ${r.etiquetas.length === 1 ? "imagen de etiqueta" : "imágenes de etiqueta"}`,
    autor_nombre: persona.nombre,
  });
  return { ...r, pedidoId: pedido.id };
}

/**
 * Cotizar (o corregir la cotización mientras Ecomfive no decide): unidades (las de la caja), costo por unidad o total, foto real y
 * comentario. La compra pasa a «Cotizado» con esas unidades y ese monto en un solo cambio (así el espejo conserva las unidades que
 * pidió Ecomfive para mostrar «pediste 1,000»). Ya en producción (Ecomfive confirmó otras unidades y falta su costo) también se edita,
 * pero la compra sigue en producción (27 oct 2026). Cada cotización queda en la Actividad (campo `cotizacion`, antes → después).
 */
export async function aplicarCotizacion(
  cuenta: CuentaProveedor,
  pedidoId: string,
  entrada: { unidades: unknown; montoTotal?: unknown; comentario?: unknown; fotoRuta?: unknown },
): Promise<Resultado> {
  const supabase = createServiceClient();
  const p = await pedidoDe(supabase, cuenta, pedidoId);
  if ("error" in p) return p;
  const enProduccion = p.etapa === "produccion";
  if (!puedePasar("proveedor", p.etapa, enProduccion ? "produccion" : "cotizado")) return { error: "Este pedido ya no se puede cotizar: Ecomfive ya decidió." };
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
    .update({ qty_total: cot.unidades, monto_total: cot.montoTotal, ...(enProduccion ? {} : { etapa: "cotizado" }), actualizado_en: new Date().toISOString() })
    .eq("id", p.compra_id);
  if (errorCompra) return { error: "No se pudo guardar la cotización." };

  if (!enProduccion) await anotarEtapa(supabase, cuenta, p.compra_id, compra.etapa as string, "cotizado");
  const resumen = `${entero(cot.unidades)} u. · ${dinero(cot.costoUnitario)} por unidad · ${dinero(cot.montoTotal)}`;
  // El historial del pedido: lo que había (si ya había unidades) y lo que quedó.
  const qtyAntes = compra.qty_total == null ? null : Number(compra.qty_total);
  const montoAntes = compra.monto_total == null ? 0 : Number(compra.monto_total);
  const antes = p.etapa === "por_cotizar" || qtyAntes == null ? null : `${entero(qtyAntes)} u.${montoAntes > 0 ? ` · ${dinero(montoAntes)}` : ""}`;
  await supabase
    .from("wms_compra_eventos")
    .insert({ compra_id: p.compra_id, campo: "cotizacion", valor_antes: antes, valor_despues: `${entero(cot.unidades)} u. · ${dinero(cot.montoTotal)}`, autor: autorDe(cuenta), origen: "proveedor" });
  const { data: nota } = await supabase
    .from("wms_compra_comentarios")
    .insert({ compra_id: p.compra_id, autor: autorDe(cuenta), texto: `${enProduccion ? "Cotización corregida en producción" : "Cotización"} de ${cuenta.proveedor.nombre}: ${resumen}${comentario ? `\n${comentario}` : ""}` })
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

  const corrigio = p.etapa === "cotizado" || enProduccion;
  await avisarAEcomfive(
    supabase,
    cuenta,
    p,
    "cotizacion",
    `${cuenta.proveedor.nombre} ${corrigio ? "corrigió la cotización de" : "cotizó"} ${p.producto}${enProduccion ? " (ya en producción)" : ""}`,
    `${resumen}${foto ? " · subió la foto real" : ""}${comentario ? ` · «${comentario}»` : ""}`,
  );
  return {};
}

/** Marcar enviado: la compra pasa a «Tracking» con su fecha de envío (y su planificación, como en Compras). Empiezan los plazos de pago. */
export async function aplicarEnvio(
  cuenta: CuentaProveedor,
  pedidoId: string,
  fecha: unknown,
  cajas?: { cajas: unknown; nuevas?: unknown },
): Promise<Resultado & { fechaEnvio?: string; cajas?: number; etiquetas?: string[] }> {
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
  // Las cajas y la etiqueta primero: si algo falla, el pedido sigue en producción y se corrige sin haber marcado el envío. El aviso del envío ya las menciona.
  let guardadas: { cajas: number; etiquetas: string[] } | null = null;
  if (cajas) {
    const r = await guardarCajas(supabase, cuenta, p, { cajas: cajas.cajas, nuevas: cajas.nuevas }, { avisar: false });
    if ("error" in r) return r;
    guardadas = r;
  }
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
  await avisarAEcomfive(
    supabase,
    cuenta,
    p,
    "envio",
    `${cuenta.proveedor.nombre} marcó ${p.producto} como enviado el ${fechaCorta(f)}`,
    `El anticipo vence el ${fechaCorta(vence)}${guardadas ? ` · ${entero(guardadas.cajas)} ${guardadas.cajas === 1 ? "caja" : "cajas"}${guardadas.etiquetas.length ? " · con etiqueta" : ""}` : ""}`,
  );
  return { fechaEnvio: f, ...(guardadas ?? {}) };
}
