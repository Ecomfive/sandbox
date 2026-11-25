"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioSesion } from "@/lib/auth";
import { cargarRuta } from "@/lib/despacho/datos-repartidor";
import { rangoDespacho } from "@/lib/despacho/datos";
import { FORMAS_PAGO, MOTIVOS, esFormaPago, nombreRepartidor, puedeMarcar, sumarDias } from "@/lib/despacho/panel-repartidor";
import { cuentaRepartidorActual } from "@/lib/despacho/sesion-repartidor";
import type { CuentaRepartidor } from "@/lib/despacho/cuenta-repartidor";
import { grupoDeEstado, leerReglasEstado } from "@/lib/monday/columnas";
import { hechoDesdeDespacho } from "@/lib/postventa/servidor";
import { ipDeLaPeticion, limitar } from "@/lib/seguridad/limite";
import { cerrarIntento, revisarIngreso } from "@/lib/seguridad/limite-ingreso";
import { claveLimite, DEMASIADAS_ACCIONES, DEMASIADOS_INTENTOS, LIMITES } from "@/lib/seguridad/limite-reglas";
import { createAnonClient, createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { actualizarEntregas } from "@/lib/tienda/actualizar-entregas";

// Panel del repartidor (24 nov 2026, prototipo aprobado https://claude.ai/artifact/TyFwhvTgvLJjsN6cM5GyEc). Lo que marca escribe en la misma fila de
// Envíos Delivery (`mon_despachos`), con las mismas reglas que el tablero: ENTREGADO actualiza el pedido, el cobro y su solicitud de Cambios. Cada acción
// vuelve a comprobar que la fila es suya (por su nombre de repartidor) y de hoy o de los dos días anteriores; nada se toma del navegador.

type Resultado = { error?: string };
type Supabase = ReturnType<typeof createServiceClient>;

const SIN_SESION = { error: "Tu sesión terminó. Vuelve a entrar." };
const BUCKET = "despacho-comprobantes";
const RUTAS = ["/repartidor", "/despacho-ciudad"];
const esItem = (v: unknown): v is string => typeof v === "string" && /^([0-9]{1,20}|S[0-9a-f]{32})$/.test(v);
const esDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
const quien = (c: CuentaRepartidor) => `${c.nombre} (su panel)`;

/** Hoy en Panamá. Se marca hoy y los dos días anteriores, sin salir de la semana en curso (`puedeMarcar`). */
function hoyPanama(): string {
  return rangoDespacho(1).hoy;
}

async function conCuenta(): Promise<CuentaRepartidor | null> {
  const cuenta = await cuentaRepartidorActual();
  if (!cuenta) return null;
  return cuenta;
}

/** Tope de acciones por cuenta e IP, como el del mensajero. */
async function frenado(cuenta: CuentaRepartidor): Promise<boolean> {
  return !(await limitar(claveLimite("repartidor", cuenta.id, (await ipDeLaPeticion()) ?? "sin-ip"), LIMITES.mensajero));
}

/** La fila, solo si es del repartidor de la sesión, de Envíos Delivery, sin archivar y de un día permitido. */
async function filaDelRepartidor(itemId: string): Promise<{ supabase: Supabase; cuenta: CuentaRepartidor; fila: Record<string, unknown> } | { error: string }> {
  const cuenta = await conCuenta();
  if (!cuenta) return SIN_SESION as { error: string };
  if (await frenado(cuenta)) return { error: DEMASIADAS_ACCIONES };
  if (!esItem(itemId)) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("mon_despachos").select("*").eq("item_id", itemId).maybeSingle();
  if (!fila || fila.clase !== "ciudad" || fila.archivado_en || nombreRepartidor(fila.courier as string | null) !== nombreRepartidor(cuenta.courier)) return { error: "Ese pedido no está en tu ruta." };
  const dia = (fila.fecha_despacho as string | null) ?? "";
  if (!puedeMarcar(dia, hoyPanama())) return { error: "Ese día ya no se puede marcar desde el panel: pídele a Soporte que lo cambie." };
  return { supabase, cuenta, fila };
}

/** Sube las fotos (comprobante o evidencia) y devuelve la lista de la fila con las nuevas, o el error. */
async function subirFotos(supabase: Supabase, itemId: string, actuales: string[], datos: FormData): Promise<{ lista: string[]; nuevas: number } | { error: string }> {
  const archivos = datos.getAll("foto").filter((a): a is File => a instanceof File && a.size > 0).slice(0, 4);
  const lista = [...actuales];
  for (const archivo of archivos) {
    const ext = TIPOS[archivo.type];
    if (!ext) return { error: "Solo fotos (JPG, PNG, WEBP, HEIC) o PDF." };
    if (archivo.size > 10 * 1024 * 1024) return { error: "Una foto pasa de 10 MB." };
    const ruta = `${itemId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
    if (error) return { error: "No se pudo subir la foto. Revisa la señal y vuelve a probar." };
    lista.push(`storage:${ruta}`);
  }
  return { lista: lista.slice(-10), nuevas: archivos.length };
}

/** La ubicación del celular al marcar (si la dio). */
function ubicacion(datos: FormData): { marcado_lat: number | null; marcado_lng: number | null } {
  const lat = Number(datos.get("lat"));
  const lng = Number(datos.get("lng"));
  const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) && datos.get("lat") !== null;
  return ok ? { marcado_lat: Math.round(lat * 1e6) / 1e6, marcado_lng: Math.round(lng * 1e6) / 1e6 } : { marcado_lat: null, marcado_lng: null };
}

async function estadoGrupo(supabase: Supabase, estado: string): Promise<string> {
  const { data: cfg } = await supabase.from("mon_config").select("estados").eq("id", 1).maybeSingle();
  return grupoDeEstado(estado, leerReglasEstado(cfg?.estados));
}

async function registrar(supabase: Supabase, itemId: string, cuenta: CuentaRepartidor, texto: string) {
  await supabase.from("despacho_actividad").insert({ item_id: itemId, texto: texto.slice(0, 500), autor_id: null, autor_nombre: quien(cuenta) });
}

const sello = () => {
  const ahora = new Date().toISOString();
  return { editado_en: ahora, editado_por: null, actualizado_monday: ahora, marcado_desde: "panel", marcado_en: ahora };
};

function actualizarPedidosDespues(cuenta: CuentaRepartidor) {
  after(async () => {
    await actualizarEntregas(createServiceClient(), `${quien(cuenta)} (Envíos Delivery)`, Date.now() + 25_000).catch(() => null);
  });
}

/**
 * «Confirmar entrega»: ENTREGADO, PAGADO, la forma de pago y lo cobrado, con la foto del comprobante (obligatoria si no es efectivo) y su número; la
 * hora y la ubicación se guardan solas.
 */
export async function entregarPedido(itemId: string, datos: FormData): Promise<Resultado> {
  const r = await filaDelRepartidor(itemId);
  if ("error" in r) return r;
  const { supabase, cuenta, fila } = r;
  const forma = datos.get("forma");
  if (!esFormaPago(forma)) return { error: "Elige cómo pagó el cliente." };
  const t = String(datos.get("monto") ?? "").trim().replace(/[$\s,]/g, "");
  const monto = t ? Number(t) : NaN;
  if (!Number.isFinite(monto) || monto < 0 || monto > 100_000) return { error: "Escribe el monto cobrado." };
  const numero = String(datos.get("numero") ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || null;
  const fotos = await subirFotos(supabase, itemId, (fila.comprobantes as string[] | null) ?? [], datos);
  if ("error" in fotos) return fotos;
  if (forma !== "efectivo" && fotos.lista.length === 0) return { error: "Toma la foto del comprobante." };
  const etiqueta = FORMAS_PAGO.find((f) => f.id === forma)!.etiqueta;
  const { error } = await supabase
    .from("mon_despachos")
    .update({
      ...sello(),
      ...ubicacion(datos),
      estado: "ENTREGADO",
      estado_grupo: await estadoGrupo(supabase, "ENTREGADO"),
      edo_pago: "PAGADO",
      forma_pago: etiqueta,
      monto_cobrado: Math.round(monto * 100) / 100,
      comprobante_numero: numero,
      comprobantes: fotos.lista,
    })
    .eq("item_id", itemId);
  if (error) return { error: "No se pudo guardar. Vuelve a probar." };
  await registrar(supabase, itemId, cuenta, `Entregado · ${etiqueta} · $${monto.toFixed(2)}${numero ? ` · comprobante ${numero}` : ""}${fotos.nuevas ? ` · ${fotos.nuevas} foto${fotos.nuevas === 1 ? "" : "s"}` : ""}`);
  // Un reparto de Cambios y reembolsos entregado pasa su solicitud a Hecho (como en el tablero).
  await hechoDesdeDespacho(supabase, itemId, { id: null, nombre: quien(cuenta) }).catch(() => null);
  actualizarPedidosDespues(cuenta);
  for (const p of RUTAS) revalidatePath(p);
  return {};
}

/**
 * «Pospuesto» o «Fallido»: el motivo (de la lista) y el comentario; un fallido lleva evidencia (sin ella no se paga el envío). Un pospuesto pasa al día
 * elegido: la fila de hoy queda POSPUESTO (cuenta en el cierre de hoy) y se crea la del día nuevo, para el mismo repartidor y el mismo pedido.
 */
export async function noEntregarPedido(itemId: string, datos: FormData): Promise<Resultado> {
  const r = await filaDelRepartidor(itemId);
  if ("error" in r) return r;
  const { supabase, cuenta, fila } = r;
  const tipo = datos.get("tipo") === "FALLIDO" ? "FALLIDO" : "POSPUESTO";
  const motivo = String(datos.get("motivo") ?? "");
  if (!(MOTIVOS as readonly string[]).includes(motivo)) return { error: "Elige el motivo." };
  const comentario = String(datos.get("comentario") ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const fecha = tipo === "POSPUESTO" ? String(datos.get("fecha") ?? "") : "";
  const hoy = hoyPanama();
  if (tipo === "POSPUESTO" && (!esDia(fecha) || fecha <= (fila.fecha_despacho as string) || fecha > sumarDias(hoy, 60))) return { error: "Elige para cuándo queda." };
  const fotos = await subirFotos(supabase, itemId, (fila.comprobantes as string[] | null) ?? [], datos);
  if ("error" in fotos) return fotos;
  if (tipo === "FALLIDO" && fotos.lista.length === 0) return { error: "Un fallido lleva evidencia: toma la foto de la llamada, del chat o de la puerta." };
  const texto = [motivo, comentario && comentario !== motivo ? comentario : ""].filter(Boolean).join(" · ") + (tipo === "POSPUESTO" ? ` · pasa al ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : "");
  const { error } = await supabase
    .from("mon_despachos")
    .update({
      ...sello(),
      ...ubicacion(datos),
      estado: tipo,
      estado_grupo: await estadoGrupo(supabase, tipo),
      comentario: texto.slice(0, 1000),
      comprobantes: fotos.lista,
      reprogramado_para: tipo === "POSPUESTO" ? fecha : null,
    })
    .eq("item_id", itemId);
  if (error) return { error: "No se pudo guardar. Vuelve a probar." };
  await registrar(supabase, itemId, cuenta, `${tipo === "POSPUESTO" ? "Pospuesto" : "Fallido"}: ${texto}${fotos.nuevas ? ` · ${fotos.nuevas} foto${fotos.nuevas === 1 ? "" : "s"}` : ""}`);
  if (tipo === "POSPUESTO") {
    // El pedido sigue en la ruta del día nuevo (mismo repartidor y pedido), salvo que ya esté ahí.
    const { data: ya } = await supabase.from("mon_despachos").select("item_id").eq("clase", "ciudad").is("archivado_en", null).eq("fecha_despacho", fecha).eq("numero_pedido", fila.numero_pedido as string).limit(1);
    if (!ya?.length && fila.numero_pedido) {
      const nuevo = `S${crypto.randomUUID().replace(/-/g, "")}`;
      const ahora = new Date().toISOString();
      const { error: e2 } = await supabase.from("mon_despachos").insert({
        item_id: nuevo,
        tablero_id: "sistema",
        clase: "ciudad",
        origen: "sistema",
        nombre: fila.nombre ?? null,
        numero_pedido: fila.numero_pedido,
        orden_id: fila.orden_id ?? null,
        unidad_id: fila.unidad_id ?? null,
        tienda_texto: fila.tienda_texto ?? null,
        courier: fila.courier,
        por_cobrar: fila.por_cobrar ?? null,
        coste_envio: fila.coste_envio ?? null,
        estado_grupo: "sin_estado",
        edo_pago: "PENDIENTE",
        fecha_despacho: fecha,
        periodo: `${fecha.slice(0, 7)}-01`,
        comentario: `Pospuesto del ${String(fila.fecha_despacho).slice(8, 10)}/${String(fila.fecha_despacho).slice(5, 7)}: ${motivo}`,
        editado_en: ahora,
        actualizado_monday: ahora,
        leido_en: ahora,
      });
      if (!e2) await registrar(supabase, nuevo, cuenta, `Creada por un pospuesto del ${fila.fecha_despacho}`);
    }
  }
  actualizarPedidosDespues(cuenta);
  for (const p of RUTAS) revalidatePath(p);
  return {};
}

/**
 * «Enviar cierre a Soporte»: el resumen del día lo arma el servidor con las filas (no el navegador). No se envía con pedidos en ruta; cada tienda con
 * efectivo puede llevar la foto de su depósito. Si Soporte lo devolvió, se vuelve a enviar; uno validado ya no se cambia.
 */
export async function enviarCierre(dia: string, datos: FormData): Promise<Resultado> {
  const cuenta = await conCuenta();
  if (!cuenta) return SIN_SESION;
  if (await frenado(cuenta)) return { error: DEMASIADAS_ACCIONES };
  if (!esDia(dia) || !puedeMarcar(dia, hoyPanama())) return { error: "Ese día ya no se puede cerrar desde el panel." };
  const supabase = createServiceClient();
  const ruta = await cargarRuta(supabase, cuenta, dia);
  if (ruta.faltaMigracion) return { error: "Falta correr en Supabase la migración 0362 (panel del repartidor)." };
  if (!ruta.pedidos.length) return { error: "No tienes pedidos ese día." };
  if (ruta.resumen.enRuta > 0) return { error: `Todavía tienes ${ruta.resumen.enRuta} pedido${ruta.resumen.enRuta === 1 ? "" : "s"} en ruta.` };
  if (ruta.cierre?.estado === "validado") return { error: "Soporte ya validó este cierre." };
  const depositos: { tienda: string; monto: number; archivo: string | null }[] = [];
  for (const e of ruta.resumen.efectivo) {
    const archivo = datos.get(`deposito:${e.tienda}`);
    const anterior = ruta.cierre?.depositos.find((d) => d.tienda === e.tienda)?.archivo ?? null;
    let guardado = anterior;
    if (archivo instanceof File && archivo.size > 0) {
      const ext = TIPOS[archivo.type];
      if (!ext) return { error: "Solo fotos (JPG, PNG, WEBP, HEIC) o PDF." };
      if (archivo.size > 10 * 1024 * 1024) return { error: "Una foto pasa de 10 MB." };
      const rutaArchivo = `cierres/${cuenta.id}/${dia}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(rutaArchivo, archivo, { contentType: archivo.type, upsert: false });
      if (error) return { error: "No se pudo subir la foto del depósito." };
      guardado = `storage:${rutaArchivo}`;
    }
    depositos.push({ tienda: e.tienda, monto: e.monto, archivo: guardado });
  }
  const fila = {
    courier: cuenta.courier,
    dia,
    repartidor_id: cuenta.id,
    estado: "enviado",
    resumen: ruta.resumen,
    depositos,
    nota: null,
    enviado_en: new Date().toISOString(),
    revisado_por: null,
    revisado_por_nombre: null,
    revisado_en: null,
  };
  const { error } = await supabase.from("despacho_cierres").upsert(fila, { onConflict: "courier,dia" });
  if (error) return { error: "No se pudo enviar el cierre." };
  for (const p of [...RUTAS, "/repartidor/cierre"]) revalidatePath(p);
  return {};
}

/** El repartidor cambia su clave (la temporal que le dio un administrador, o la suya), como la cuenta del proveedor. */
export async function cambiarClaveRepartidor(actual: string, nueva: string, repetida: string): Promise<Resultado> {
  const cuenta = await cuentaRepartidorActual();
  const usuario = await getUsuarioSesion();
  if (!cuenta || !usuario?.email || usuario.id !== cuenta.usuarioId) return SIN_SESION;
  const claveActual = String(actual ?? "");
  const claveNueva = String(nueva ?? "");
  if (claveNueva.length < 8) return { error: "La clave nueva debe tener al menos 8 caracteres." };
  if (claveNueva.length > 72) return { error: "La clave nueva es muy larga." };
  if (claveNueva !== String(repetida ?? "")) return { error: "Las claves nuevas no coinciden." };
  if (claveNueva === claveActual) return { error: "La clave nueva debe ser distinta de la actual." };
  const { intento, frenado: muchos } = await revisarIngreso(usuario.email);
  if (muchos) return { error: DEMASIADOS_INTENTOS };
  const comprobar = createAnonClient();
  const { error: errorActual } = await comprobar.auth.signInWithPassword({ email: usuario.email, password: claveActual });
  await cerrarIntento(intento, errorActual);
  if (errorActual) return { error: "La clave actual no es correcta." };
  await comprobar.auth.signOut({ scope: "local" });
  const { error } = await createServiceClient().auth.admin.updateUserById(cuenta.usuarioId, { password: claveNueva, app_metadata: { clave_temporal: false } });
  if (error) return { error: "No se pudo cambiar la clave." };
  await (await createSessionClient()).auth.signInWithPassword({ email: usuario.email, password: claveNueva });
  await registrarAuditoria({ accion: "cambiar_contrasena", entidad: "despacho_repartidores", entidadId: cuenta.usuarioId, detalle: `${cuenta.nombre} (repartidor) cambió su clave del panel` });
  revalidatePath("/repartidor");
  return {};
}
