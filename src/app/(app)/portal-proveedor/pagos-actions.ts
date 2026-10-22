"use server";

import { randomUUID } from "node:crypto";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { detectarAdjunto } from "@/lib/compras/adjuntos";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { cargarEspejo } from "@/lib/proveedor/datos";
import { diasEntre, hoyPanama } from "@/lib/proveedor/fechas";
import { estadoPagos } from "@/lib/proveedor/pagos-servidor";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

// Pagos a Chin, del lado de Ecomfive (fase 4 de PORTAL-PROVEEDOR.md): se avisa el pago (fecha, referencia, comprobante y a qué cuotas
// va) y el proveedor lo confirma en su portal; recién ahí cuenta como pagado. Lo pagado vive en `proveedor_pagos`, no en la compra.

const MAX_COMPROBANTE = 10 * 1024 * 1024;
const DIAS_ATRAS = 120;
const EXTENSIONES = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

async function proveedorActivo() {
  const { data } = await createServiceClient().from("proveedores").select("id, nombre").eq("activo", true).order("creado_en").limit(1).maybeSingle();
  return data as { id: string; nombre: string } | null;
}

/** Dirección firmada para subir el comprobante de un pago (imagen o PDF) directo al almacenamiento privado. */
export async function prepararSubidaComprobante(nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("portal-proveedor");
  const prov = await proveedorActivo();
  if (!prov) return { error: "No hay proveedor con portal." };
  const ext = (String(nombreArchivo ?? "").split(".").pop() ?? "").toLowerCase();
  const ruta = `${prov.id}/avisos/${randomUUID()}.${EXTENSIONES.has(ext) ? ext : "pdf"}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_PROVEEDOR).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/**
 * Avisa un pago a Chin: las cuotas que cubre (por su clave «pedido:cuota») con lo que falta de cada una, calculado aquí; la fecha del
 * pago, su referencia y, si hay, el comprobante (revisado por su contenido). Chin lo ve en su portal para confirmarlo.
 */
export async function crearAvisoPago(datos: { fecha: string; referencia: string; claves: string[]; comprobanteRuta?: string | null }): Promise<{ error?: string; avisoId?: string }> {
  const usuario = await requireModuloEscritura("portal-proveedor");
  if (!datos || !Array.isArray(datos.claves) || datos.claves.length === 0 || datos.claves.length > 200) return { error: "Marca las cuotas que pagaste." };
  const hoy = hoyPanama();
  const fecha = typeof datos.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : null;
  if (!fecha || diasEntre(fecha, hoy) < 0) return { error: "La fecha del pago no puede ser futura." };
  if (diasEntre(fecha, hoy) > DIAS_ATRAS) return { error: `La fecha del pago no puede ser de hace más de ${DIAS_ATRAS} días.` };
  const referencia = String(datos.referencia ?? "").trim().slice(0, 80);

  const supabase = createServiceClient();
  const prov = await proveedorActivo();
  if (!prov) return { error: "No hay proveedor con portal." };
  const espejo = await cargarEspejo(supabase, prov.id);
  if ("error" in espejo) return espejo;
  const estado = await estadoPagos(supabase, espejo);
  if ("error" in estado) return estado;
  const pedidosVisibles = new Set(espejo.pedidos.filter((p) => puedeVerPais(usuario.paisesPermitidos, p.paisCodigo)).map((p) => p.id));
  const pedidas = new Set(datos.claves.map(String));
  const cuotas = estado.porPagar.filter((c) => pedidas.has(c.clave) && !c.avisada && pedidosVisibles.has(c.pedidoId));
  if (cuotas.length !== pedidas.size) return { error: "Alguna cuota ya se pagó, ya está avisada o no la puedes ver. Recarga la página." };

  let comprobante: string | null = null;
  if (datos.comprobanteRuta) {
    const ruta = String(datos.comprobanteRuta);
    if (!new RegExp(`^${prov.id}/avisos/[0-9a-f-]{36}\\.[a-z]{3,4}$`).test(ruta)) return { error: "El comprobante no es válido." };
    const { data: archivo } = await supabase.storage.from(BUCKET_PROVEEDOR).download(ruta);
    const bytes = archivo ? new Uint8Array(await archivo.arrayBuffer()) : null;
    const tipo = bytes && bytes.length <= MAX_COMPROBANTE ? detectarAdjunto(bytes, ruta) : null;
    if (!tipo || (tipo.clase !== "foto" && tipo.extension !== "pdf")) {
      await supabase.storage.from(BUCKET_PROVEEDOR).remove([ruta]);
      return { error: "El comprobante debe ser una imagen o un PDF de hasta 10 MB." };
    }
    comprobante = ruta;
  }

  const monto = Math.round(cuotas.reduce((s, c) => s + c.monto, 0) * 100) / 100;
  const { data: aviso, error } = await supabase
    .from("proveedor_avisos_pago")
    .insert({ proveedor_id: prov.id, fecha, monto, referencia: referencia || null, comprobante_ruta: comprobante, avisado_por: usuario.id, avisado_por_nombre: usuario.nombre })
    .select("id")
    .single();
  if (error || !aviso) return { error: "No se pudo guardar el aviso." };
  const { error: errorCuotas } = await supabase.from("proveedor_aviso_cuotas").insert(cuotas.map((c) => ({ aviso_id: aviso.id, pedido_id: c.pedidoId, cuota: c.cuota, monto: c.monto })));
  if (errorCuotas) {
    await supabase.from("proveedor_avisos_pago").delete().eq("id", aviso.id);
    return { error: "No se pudo guardar el aviso." };
  }
  const dinero = `$${monto.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  await supabase.from("proveedor_novedades").insert({ proveedor_id: prov.id, lado: "ecomfive", tipo: "pago", texto: `Ecomfive avisó un pago de ${dinero}${referencia ? ` (${referencia})` : ""}: confírmalo en Pagos`, autor_nombre: usuario.nombre });
  await registrarAuditoria({ accion: "editar_campo_compra", entidad: "proveedor_avisos_pago", entidadId: aviso.id as string, detalle: `Aviso de pago a ${prov.nombre}: ${dinero} · ${cuotas.length} cuotas${referencia ? ` · ${referencia}` : ""}` });
  return { avisoId: aviso.id as string };
}

/** Cancela un aviso que el proveedor todavía no confirmó (se equivocaron de monto o de cuotas). */
export async function cancelarAvisoPago(avisoId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("portal-proveedor");
  if (!esUuid(avisoId)) return { error: "Aviso no válido." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("proveedor_avisos_pago").select("id, estado, comprobante_ruta, monto, referencia").eq("id", avisoId).maybeSingle();
  if (!data) return { error: "El aviso ya no existe." };
  if (data.estado !== "avisado") return { error: "El proveedor ya lo confirmó: no se puede cancelar." };
  const { error } = await supabase.from("proveedor_avisos_pago").delete().eq("id", avisoId).eq("estado", "avisado");
  if (error) return { error: "No se pudo cancelar el aviso." };
  if (data.comprobante_ruta) await supabase.storage.from(BUCKET_PROVEEDOR).remove([data.comprobante_ruta as string]);
  const prov = await proveedorActivo();
  if (prov) await supabase.from("proveedor_novedades").insert({ proveedor_id: prov.id, lado: "ecomfive", tipo: "pago", texto: `Ecomfive canceló el aviso de pago de $${data.monto}${data.referencia ? ` (${data.referencia})` : ""}`, autor_nombre: usuario.nombre });
  await registrarAuditoria({ accion: "editar_campo_compra", entidad: "proveedor_avisos_pago", entidadId: avisoId, detalle: `Canceló el aviso de pago de $${data.monto}${data.referencia ? ` (${data.referencia})` : ""} (${usuario.nombre})` });
  return {};
}
