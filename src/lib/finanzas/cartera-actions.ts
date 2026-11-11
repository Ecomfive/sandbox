"use server";

// Acciones de Cuentas por cobrar y Cuentas por pagar (Portal AF4 360°, migración 0905). Cada una recibe la cartera
// (`cobrar` / `pagar`) y comprueba el permiso de ESE módulo; los ids y los catálogos se vuelven a leer de la base. Los
// errores se devuelven como valor (`{ error }`): en producción Next.js oculta el mensaje de una excepción.

import { revalidatePath } from "next/cache";
import { dinero } from "@/lib/af4/formato";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoARegistros, sinAccesoAUnidades } from "./acceso-tienda";
import {
  CLASES,
  ESTADOS_MANUALES,
  ETIQUETA_ESTADO,
  MODULO_DE_CLASE,
  RUTA_DE_CLASE,
  TAMANO_LOTE_IMPORTACION,
  abonadoDe,
  estadoDe,
  fechaValida,
  hoyPanama,
  montoDeFormulario,
  normalizarMetodo,
  redondear,
  saldoDe,
  validarDocumentoImportado,
  type Clase,
  type DocumentoImportado,
  type EstadoManual,
} from "./cxc-cxp";
import {
  archivoDeNombre,
  cerrarImportacionCartera,
  existentesDeHojas,
  guardarLoteCartera,
  resumirContra,
  validarClaves,
  validarHojas,
  type ResultadoLoteCartera,
  type ResumenImportacion,
} from "./guardar-cartera";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esClase = (v: unknown): v is Clase => typeof v === "string" && (CLASES as string[]).includes(v);
const texto = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const textoLargo = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const usd = (n: number) => dinero(n, "USD", { decimales: 2 });
/** La entidad de la auditoría: una por cartera, para que cada módulo vea solo la suya. */
const entidad = (clase: Clase) => `fin_cartera_${clase}`;
const mensaje = (e: unknown, defecto: string) => (e instanceof Error ? e.message : defecto);

function refrescar(clase: Clase) {
  revalidatePath(RUTA_DE_CLASE[clase], "layout");
}

interface DocumentoGuardado {
  id: string;
  clase: Clase;
  contraparte: string;
  documento: string | null;
  unidad_id: string | null;
  fecha: string | null;
  vencimiento: string | null;
  monto: number | string;
  estado_manual: EstadoManual | null;
  notas: string | null;
  fin_cartera_abonos: { monto: number | string; fecha: string | null; origen: string }[] | null;
}

/** Lee un documento y comprueba que sea de la cartera que dice la acción. */
async function leerDocumento(id: unknown, clase: Clase): Promise<DocumentoGuardado | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await createServiceClient()
    .from("fin_cartera")
    .select("id, clase, contraparte, documento, unidad_id, fecha, vencimiento, monto, estado_manual, notas, fin_cartera_abonos(monto, fecha, origen)")
    .eq("id", id)
    .maybeSingle();
  return data && data.clase === clase ? (data as DocumentoGuardado) : null;
}

const comoBase = (d: DocumentoGuardado) => ({
  monto: Number(d.monto),
  fecha: d.fecha,
  vencimiento: d.vencimiento,
  estado_manual: d.estado_manual,
  abonos: (d.fin_cartera_abonos ?? []).map((a) => ({ fecha: a.fecha, monto: Number(a.monto) })),
});

const nombreDoc = (d: { documento: string | null; contraparte: string }) => (d.documento ? `${d.documento} · ${d.contraparte}` : d.contraparte);

async function unidadValida(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const { data } = await createServiceClient().from("fin_unidades").select("id").eq("id", id).maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------------------------

/** «Agregar»: un documento por cobrar o por pagar cargado a mano. */
export async function crearDocumentoCartera(formData: FormData): Promise<{ error?: string }> {
  try {
    const clase = formData.get("clase");
    if (!esClase(clase)) return { error: "Cartera no válida." };
    const usuario = await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    const contraparte = texto(formData.get("contraparte"), 160);
    if (!contraparte) return { error: clase === "cobrar" ? "Falta el cliente o deudor." : "Falta el acreedor." };
    const monto = montoDeFormulario(formData.get("monto"));
    if (monto === null) return { error: "El monto debe ser mayor a cero." };
    const fecha = fechaValida(texto(formData.get("fecha"), 10));
    if (!fecha) return { error: "Falta la fecha (o no es válida)." };
    const vencimientoTxt = texto(formData.get("vencimiento"), 10);
    const vencimiento = vencimientoTxt ? fechaValida(vencimientoTxt) : null;
    if (vencimientoTxt && !vencimiento) return { error: "El vencimiento no es una fecha válida." };
    if (vencimiento && vencimiento < fecha) return { error: "El vencimiento no puede ser anterior a la fecha." };
    const unidadId = texto(formData.get("unidad_id"), 64);
    if (unidadId && !(await unidadValida(unidadId))) return { error: "Tienda no válida." };
    const accesoNuevo = await sinAccesoAUnidades([unidadId || null]);
    if (accesoNuevo) return { error: accesoNuevo };
    const documento = texto(formData.get("documento"), 80) || null;
    const { data, error } = await createServiceClient()
      .from("fin_cartera")
      .insert({
        clase,
        contraparte,
        documento,
        unidad_id: unidadId || null,
        fecha,
        vencimiento,
        motivo: texto(formData.get("motivo"), 300) || null,
        monto,
        notas: textoLargo(formData.get("notas"), 1000) || null,
        origen: "manual",
        creado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "No se pudo crear el documento." };
    await registrarAuditoria({
      accion: "crear_documento_cartera",
      entidad: entidad(clase),
      entidadId: data.id as string,
      detalle: `${nombreDoc({ documento, contraparte })}: ${usd(monto)} del ${fecha}`,
    });
    refrescar(clase);
    return {};
  } catch (e) {
    return { error: mensaje(e, "No se pudo crear el documento.") };
  }
}

/** Guarda la tienda, el vencimiento y las notas de un documento desde su ficha. */
export async function actualizarDocumentoCartera(formData: FormData): Promise<{ error?: string }> {
  try {
    const clase = formData.get("clase");
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    const antes = await leerDocumento(formData.get("id"), clase);
    if (!antes) return { error: "El documento ya no existe." };
    const unidadId = texto(formData.get("unidad_id"), 64);
    const accesoDoc = await sinAccesoAUnidades([antes.unidad_id, unidadId || null]);
    if (accesoDoc) return { error: accesoDoc };
    if (unidadId && !(await unidadValida(unidadId))) return { error: "Tienda no válida." };
    const vencimientoTxt = texto(formData.get("vencimiento"), 10);
    const vencimiento = vencimientoTxt ? fechaValida(vencimientoTxt) : null;
    if (vencimientoTxt && !vencimiento) return { error: "El vencimiento no es una fecha válida." };
    if (vencimiento && antes.fecha && vencimiento < antes.fecha) return { error: "El vencimiento no puede ser anterior a la fecha." };
    const notas = textoLargo(formData.get("notas"), 1000) || null;
    const supabase = createServiceClient();
    const cambioTienda = (unidadId || null) !== antes.unidad_id;
    const { error } = await supabase
      .from("fin_cartera")
      .update({
        unidad_id: unidadId || null,
        vencimiento,
        notas,
        ...(cambioTienda ? { editado_a_mano: true } : {}),
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", antes.id);
    if (error) return { error: error.message };
    const nombres = new Map<string, string>();
    const idsTienda = [antes.unidad_id, unidadId].filter((x): x is string => !!x);
    if (idsTienda.length) {
      const { data } = await supabase.from("fin_unidades").select("id, nombre").in("id", idsTienda);
      for (const u of data ?? []) nombres.set(u.id as string, u.nombre as string);
    }
    const tienda = (id: string | null) => (id ? (nombres.get(id) ?? "—") : "Sin tienda");
    await registrarAuditoria({
      accion: "editar_documento_cartera",
      entidad: entidad(clase),
      entidadId: antes.id,
      antes: { Tienda: tienda(antes.unidad_id), Vencimiento: antes.vencimiento ?? "—", Notas: antes.notas ?? "—" },
      despues: { Tienda: tienda(unidadId || null), Vencimiento: vencimiento ?? "—", Notas: notas ?? "—" },
    });
    refrescar(clase);
    return {};
  } catch (e) {
    return { error: mensaje(e, "No se pudo guardar.") };
  }
}

/** Marca un documento como incobrable o anulado (o le quita la marca: `estado` null). Queda en la auditoría. */
export async function cambiarEstadoCartera(clase: Clase, id: string, estado: EstadoManual | null, motivo: string): Promise<{ error?: string }> {
  try {
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    if (estado !== null && !ESTADOS_MANUALES.includes(estado)) return { error: "Estado no válido." };
    if (estado === "incobrable" && clase !== "cobrar") return { error: "Solo una cuenta por cobrar puede ser incobrable." };
    const doc = await leerDocumento(id, clase);
    if (!doc) return { error: "El documento ya no existe." };
    const accesoDoc = await sinAccesoAUnidades([doc.unidad_id]);
    if (accesoDoc) return { error: accesoDoc };
    const limpio = typeof motivo === "string" ? motivo.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    if (estado && !limpio) return { error: "Escribe el motivo." };
    if (doc.estado_manual === estado) return {};
    const antes = estadoDe(comoBase(doc));
    const { error } = await createServiceClient()
      .from("fin_cartera")
      .update({ estado_manual: estado, motivo_estado: estado ? limpio : null, actualizado_en: new Date().toISOString() })
      .eq("id", doc.id);
    if (error) return { error: error.message };
    const despues = estadoDe({ ...comoBase(doc), estado_manual: estado });
    await registrarAuditoria({
      accion: "cambiar_estado_cartera",
      entidad: entidad(clase),
      entidadId: doc.id,
      detalle: limpio || undefined,
      antes: { Estado: ETIQUETA_ESTADO[antes] },
      despues: { Estado: `${ETIQUETA_ESTADO[despues]}${limpio ? ` (${limpio})` : ""}` },
    });
    refrescar(clase);
    return {};
  } catch (e) {
    return { error: mensaje(e, "No se pudo cambiar el estado.") };
  }
}

/** Borra un documento cargado a mano (los del Excel se borran quitándolos del Excel y reimportando). */
export async function eliminarDocumentoCartera(clase: Clase, id: string): Promise<{ error?: string }> {
  try {
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    const doc = await leerDocumento(id, clase);
    if (!doc) return { error: "El documento ya no existe." };
    const accesoDoc = await sinAccesoAUnidades([doc.unidad_id]);
    if (accesoDoc) return { error: accesoDoc };
    const supabase = createServiceClient();
    const { data: origen } = await supabase.from("fin_cartera").select("origen").eq("id", doc.id).single();
    if (origen?.origen !== "manual") return { error: "Este documento viene del Excel: para quitarlo, bórralo del Excel y vuelve a importarlo, o márcalo como anulado." };
    const { error } = await supabase.from("fin_cartera").delete().eq("id", doc.id);
    if (error) return { error: error.message };
    await registrarAuditoria({
      accion: "eliminar_documento_cartera",
      entidad: entidad(clase),
      entidadId: doc.id,
      detalle: `${nombreDoc(doc)}: ${usd(Number(doc.monto))}`,
    });
    refrescar(clase);
    return {};
  } catch (e) {
    return { error: mensaje(e, "No se pudo eliminar.") };
  }
}

// ---------------------------------------------------------------------------------------------
// Abonos
// ---------------------------------------------------------------------------------------------

/** «Registrar abono» de la ficha: fecha, monto (hasta el saldo), método, referencia y cuenta. */
export async function registrarAbonoCartera(formData: FormData): Promise<{ error?: string }> {
  try {
    const clase = formData.get("clase");
    if (!esClase(clase)) return { error: "Cartera no válida." };
    const usuario = await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    const doc = await leerDocumento(formData.get("documento_id"), clase);
    if (!doc) return { error: "El documento ya no existe." };
    const accesoDoc = await sinAccesoAUnidades([doc.unidad_id]);
    if (accesoDoc) return { error: accesoDoc };
    const base = comoBase(doc);
    const estado = estadoDe(base);
    if (estado === "anulado" || estado === "incobrable") return { error: `El documento está ${ETIQUETA_ESTADO[estado].toLowerCase()}: quita la marca antes de abonar.` };
    const saldo = saldoDe(base);
    if (saldo <= 0.005) return { error: "El documento ya está pagado." };
    const monto = montoDeFormulario(formData.get("monto"));
    if (monto === null) return { error: "El monto debe ser mayor a cero." };
    if (monto > saldo + 0.005) return { error: `El abono pasa el saldo (${usd(saldo)}).` };
    const fecha = fechaValida(texto(formData.get("fecha"), 10));
    if (!fecha) return { error: "Falta la fecha del abono." };
    if (fecha > hoyPanama()) return { error: "La fecha del abono no puede ser futura." };
    const cuentaId = texto(formData.get("cuenta_id"), 64);
    const supabase = createServiceClient();
    if (cuentaId) {
      if (!UUID.test(cuentaId)) return { error: "Cuenta no válida." };
      const { data } = await supabase.from("fin_cuentas").select("id").eq("id", cuentaId).maybeSingle();
      if (!data) return { error: "Cuenta no válida." };
    }
    const metodo = normalizarMetodo(texto(formData.get("metodo"), 40));
    const { error } = await supabase.from("fin_cartera_abonos").insert({
      documento_id: doc.id,
      fecha,
      monto,
      metodo,
      referencia: texto(formData.get("referencia"), 120) || null,
      cuenta_id: cuentaId || null,
      notas: textoLargo(formData.get("notas"), 500) || null,
      origen: "manual",
      creado_por: usuario.id,
    });
    if (error) return { error: error.message };
    const despues = { ...base, abonos: [...base.abonos, { fecha, monto }] };
    await registrarAuditoria({
      accion: "registrar_abono_cartera",
      entidad: entidad(clase),
      entidadId: doc.id,
      detalle: `${usd(monto)} del ${fecha}${metodo ? ` (${metodo})` : ""}`,
      antes: { Saldo: usd(saldo), Estado: ETIQUETA_ESTADO[estado] },
      despues: { Saldo: usd(redondear(saldo - monto)), Estado: ETIQUETA_ESTADO[estadoDe(despues)] },
    });
    refrescar(clase);
    return {};
  } catch (e) {
    return { error: mensaje(e, "No se pudo registrar el abono.") };
  }
}

/** Quita un abono registrado en el portal (los del Excel se corrigen en el Excel). */
export async function eliminarAbonoCartera(clase: Clase, abonoId: string): Promise<{ error?: string }> {
  try {
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    if (typeof abonoId !== "string" || !UUID.test(abonoId)) return { error: "Abono no válido." };
    const supabase = createServiceClient();
    const { data: abono } = await supabase.from("fin_cartera_abonos").select("id, documento_id, fecha, monto, origen").eq("id", abonoId).maybeSingle();
    if (!abono) return { error: "El abono ya no existe." };
    if (abono.origen !== "manual") return { error: "Este abono viene del Excel: corrígelo en el Excel y vuelve a importarlo." };
    const doc = await leerDocumento(abono.documento_id, clase);
    if (!doc) return { error: "El documento ya no existe." };
    const accesoDoc = await sinAccesoAUnidades([doc.unidad_id]);
    if (accesoDoc) return { error: accesoDoc };
    const base = comoBase(doc);
    const { error } = await supabase.from("fin_cartera_abonos").delete().eq("id", abono.id);
    if (error) return { error: error.message };
    const sin = { ...base, abonos: base.abonos.filter((_, i) => i !== base.abonos.findIndex((a) => a.monto === Number(abono.monto) && a.fecha === abono.fecha)) };
    await registrarAuditoria({
      accion: "eliminar_abono_cartera",
      entidad: entidad(clase),
      entidadId: doc.id,
      detalle: `${usd(Number(abono.monto))} del ${abono.fecha ?? "—"}`,
      antes: { Saldo: usd(saldoDe(base)), Abonado: usd(abonadoDe(base)) },
      despues: { Saldo: usd(saldoDe(sin)), Abonado: usd(abonadoDe(sin)) },
    });
    refrescar(clase);
    return {};
  } catch (e) {
    return { error: mensaje(e, "No se pudo quitar el abono.") };
  }
}

/** La actividad de un documento para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialCobrar(id: string) {
  return historial("cobrar", id);
}

export async function obtenerHistorialPagar(id: string) {
  return historial("pagar", id);
}

async function historial(clase: Clase, id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO_DE_CLASE[clase]);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Documento no válido." };
  const acceso = await sinAccesoARegistros(createServiceClient(), "fin_cartera", [id]);
  if (acceso) return { error: acceso };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", entidad(clase))
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

// ---------------------------------------------------------------------------------------------
// Importar el Excel (lectura en el navegador, lotes validados aquí)
// ---------------------------------------------------------------------------------------------

/** Qué va a pasar si se carga: cuántos documentos son nuevos, cuántos se actualizan, cuántos se borran o se conservan. */
export async function resumirImportacionCartera(clase: Clase, hojas: string[], claves: string[]): Promise<{ error: string } | ResumenImportacion> {
  try {
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    const h = validarHojas(hojas);
    if (!h.length) return { error: "El archivo no trae hojas de esta cartera." };
    const existentes = await existentesDeHojas(createServiceClient(), clase, h);
    return resumirContra(existentes, validarClaves(claves));
  } catch (e) {
    return { error: mensaje(e, "No se pudo revisar el archivo.") };
  }
}

/** Guarda un lote de documentos con sus abonos (se llama una vez por lote). */
export async function importarLoteCartera(clase: Clase, archivo: string, docs: unknown[]): Promise<{ error: string } | (ResultadoLoteCartera & { rechazados: number })> {
  try {
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    if (!Array.isArray(docs) || docs.length === 0 || docs.length > TAMANO_LOTE_IMPORTACION) return { error: "Lote inválido." };
    const buenos: DocumentoImportado[] = [];
    let rechazados = 0;
    for (const d of docs) {
      const r = validarDocumentoImportado(d, clase);
      if (r.ok) buenos.push(r.doc);
      else rechazados++;
    }
    const r = await guardarLoteCartera(createServiceClient(), clase, archivoDeNombre(archivo), buenos);
    return { ...r, rechazados };
  } catch (e) {
    return { error: mensaje(e, "No se pudo guardar el lote.") };
  }
}

/** Termina la importación: borra lo de esas hojas que ya no vino (si nadie lo tocó) y deja la auditoría. */
export async function terminarImportacionCartera(
  clase: Clase,
  archivo: string,
  hojas: string[],
  claves: string[],
  resumen: { documentos: number; saldo: number },
): Promise<{ error: string } | { borrados: number; conservados: number }> {
  try {
    if (!esClase(clase)) return { error: "Cartera no válida." };
    await requireModuloEscritura(MODULO_DE_CLASE[clase]);
    const h = validarHojas(hojas);
    const c = validarClaves(claves);
    // Sin documentos válidos no se borra nada: evita vaciar la cartera por un envío roto.
    if (!h.length || c.size === 0) return { error: "El archivo no trae documentos válidos." };
    const r = await cerrarImportacionCartera(createServiceClient(), clase, h, c);
    const saldo = Number(resumen?.saldo);
    await registrarAuditoria({
      accion: "importar_cartera",
      entidad: entidad(clase),
      detalle: `${archivoDeNombre(archivo)} (${h.join(", ")}): ${c.size} documentos${Number.isFinite(saldo) ? `, saldo ${usd(saldo)}` : ""}, ${r.borrados} borrados${r.conservados ? `, ${r.conservados} conservados` : ""}`,
    });
    refrescar(clase);
    return r;
  } catch (e) {
    return { error: mensaje(e, "No se pudo terminar la importación.") };
  }
}
