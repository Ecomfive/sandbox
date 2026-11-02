"use server";

import { montoDePais } from "@/lib/moneda/simbolo";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { normalizarDatosCrear } from "@/lib/publicaciones/crear-dropi";
import { normalizarDatosPrivatizar } from "@/lib/publicaciones/privatizar-dropi";
import { normalizarDatosStock } from "@/lib/publicaciones/stock-dropi";
import { republicacionSinTocarDropi } from "@/lib/publicaciones/republicar-dropi";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const RUTA = "/publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Da formato a los montos de un país con el símbolo de su moneda («$8.99», «₡5 499», «MX$37»). */
const formatoDe = (codigo: string) => (n: number) => montoDePais(n, codigo);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Un cambio que espera «Aplicar en Dropi», para la lista de la barra de la página: qué es, qué pasaría al deshacerlo y si todavía se puede. */
export interface CambioPendienteVista {
  id: string;
  tipo: "cambio" | "republicar" | "apagar" | "archivar" | "crear" | "privatizar" | "stock";
  publicacion: string;
  /** Lo que lleva el cambio, una línea por dato («Nombre: «A» → «B»», «Precio $5.00 → $6.00»…). */
  lineas: string[];
  /** Lo que pasa en el sistema al deshacerlo. */
  alDeshacer: string;
  /** Con error (se reintenta al aplicar) o pendiente. */
  error: string | null;
  creadoPor: string | null;
  creadoEn: string;
  deshacible: boolean;
  motivoNo: string | null;
}

type Fila = Record<string, unknown>;

const COLUMNAS = "id, tipo, estado, error, intentos, publicacion_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes, nuevo_dropi_id, quitar_privados, creado_por_nombre, creado_en";
/** Lo que agregó la migración 0151: archivar, descripción, fotos y publicar. */
const COLUMNAS_0151 = "restaurar, estado_antes, estado_publicacion_antes, descripcion, descripcion_antes, fotos, datos";

/** Los cambios pendientes y con error de un país, con el nombre de la publicación y lo que hay hoy en ella (para describir el antes). */
async function leerPendientes(paisId: string, soloIds?: string[]): Promise<{ filas: Fila[]; error?: string }> {
  const supabase = createServiceClient();
  // `!publicacion_id`: la tabla tiene dos llaves hacia `dropi_publicaciones` (publicacion_id y nueva_publicacion_id, migración 0145) y sin decir
  // cuál, PostgREST rechaza el pedido por ambiguo.
  const leer = (columnas: string, descripcionDePub = false) => {
    const q = supabase.from("dropi_cambios_pendientes").select(`${columnas}, dropi_publicaciones!publicacion_id(nombre, precio_venta${descripcionDePub ? ", descripcion, estado, estado_publicacion" : ""})` as "*").eq("pais_id", paisId).in("estado", ["pendiente", "error"]);
    return (soloIds ? q.in("id", soloIds) : q).order("creado_en").limit(200);
  };
  // Con la migración 0151 se leen también archivar, descripción, fotos y publicar.
  const nueva = await leer(`${COLUMNAS}, nombre_antes, ${COLUMNAS_0151}`, true);
  if (!nueva.error) return { filas: (nueva.data ?? []) as unknown as Fila[] };
  // Sin las migraciones 0145, 0148 o 0149 faltan columnas: se lee con lo que haya.
  const intentos = [`${COLUMNAS}, nombre_antes`, COLUMNAS, "id, estado, error, intentos, publicacion_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes, creado_por_nombre, creado_en", "id, estado, error, intentos, publicacion_id, nombre, nombre_guia, creado_por_nombre, creado_en"];
  for (const columnas of intentos) {
    const r = await leer(columnas);
    if (!r.error) return { filas: (r.data ?? []) as unknown as Fila[] };
  }
  return { filas: [], error: "No se pudieron leer los cambios pendientes." };
}

const pubDe = (f: Fila) => {
  const p = f.dropi_publicaciones;
  return (Array.isArray(p) ? p[0] : p) as { nombre?: string; precio_venta?: number | string | null; descripcion?: string | null; estado?: string | null; estado_publicacion?: string | null } | null;
};
const TIPOS_COLA = ["cambio", "republicar", "apagar", "archivar", "crear", "privatizar", "stock"] as const;
const tipoDe = (f: Fila) => ((TIPOS_COLA as readonly unknown[]).includes(f.tipo) ? (f.tipo as (typeof TIPOS_COLA)[number]) : "cambio");
const cantidadFotos = (f: Fila) => (Array.isArray(f.fotos) ? f.fotos.length : 0);

/** Los cambios que esperan «Aplicar en Dropi» en el país de la barra, con lo que pasaría al deshacer cada uno. Lo ve quien puede modificar el módulo. */
export async function listarCambiosPendientes(): Promise<{ error?: string; cambios?: CambioPendienteVista[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return { cambios: [] };
  const { filas, error } = await leerPendientes(pais.id);
  if (error) return { error };
  const usd = formatoDe(pais.codigo);
  return {
    cambios: filas.map((f): CambioPendienteVista => {
      const tipo = tipoDe(f);
      const pub = pubDe(f);
      const intentos = Number(f.intentos ?? 0);
      const lineas: string[] = [];
      let alDeshacer = "";
      let deshacible = true;
      let motivoNo: string | null = null;
      if (tipo === "archivar") {
        const restaurar = f.restaurar === true;
        lineas.push(restaurar ? "Sacar de Archivados en Dropi" : "Archivar en Dropi");
        alDeshacer = "La publicación vuelve a estar como antes en el sistema. Dropi no se había tocado.";
        if (intentos > 0) {
          deshacible = false;
          motivoNo = "Ya se intentó en Dropi: no se puede deshacer desde aquí.";
        }
      } else if (tipo === "crear") {
        const d = normalizarDatosCrear(f.datos);
        lineas.push(`Publicar en Dropi: «${d.nombre || pub?.nombre || "Publicación"}»${d.precio != null ? ` · ${usd(d.precio)}` : ""} · ${d.fotos.length} ${d.fotos.length === 1 ? "foto" : "fotos"}`);
        alDeshacer = "Vuelve a «Sin publicar»: se queda guardada con todos sus datos, sin borrar nada.";
        if (intentos > 0 || f.nuevo_dropi_id) {
          deshacible = false;
          motivoNo = "Ya se empezó a publicar en Dropi (puede existir el producto): no se puede deshacer desde aquí.";
        }
      } else if (tipo === "privatizar") {
        const d = normalizarDatosPrivatizar(f.datos);
        lineas.push(`Privatizar a ${d.dropshipper || d.correo} (${d.correo}): producto privado «${d.nombre}» · ${d.unidades.toLocaleString("es-PA")} u. pasan del público al privado · ${usd(d.precio)}`);
        alDeshacer = "Se quita de la cola; no cambia nada en el sistema. Dropi no se había tocado.";
        if (f.nuevo_dropi_id) {
          deshacible = false;
          motivoNo = `Ya se creó el producto privado en Dropi (ID ${f.nuevo_dropi_id}): no se puede deshacer desde aquí.`;
        }
      } else if (tipo === "stock") {
        const d = normalizarDatosStock(f.datos);
        lineas.push(`Stock en ${codigoBodega(d.bodega)}${d.nombreBodega ? ` · ${d.nombreBodega}` : ""}: ${d.antes !== null ? `${d.antes.toLocaleString("es-PA")} → ` : ""}${d.unidades.toLocaleString("es-PA")} u. · «${d.concepto}»`);
        alDeshacer = "Se quita de la cola; el stock del sistema no cambia (es el que lee Dropi). Dropi no se había tocado.";
        if (intentos > 0) {
          deshacible = false;
          motivoNo = "Ya se intentó en Dropi (el stock pudo haber cambiado): no se puede deshacer desde aquí.";
        }
      } else if (tipo === "apagar") {
        lineas.push(`Apagar: sacar todo el stock${f.quitar_privados === true ? ", quitar la privatización" : ""} y archivar`);
        alDeshacer = "Vuelve a verse como antes en el sistema (sale de Archivados). Dropi no se había tocado.";
        if (intentos > 0) {
          deshacible = false;
          motivoNo = "Ya se intentó en Dropi (el stock puede estar en cero): no se puede deshacer desde aquí.";
        }
      } else if (tipo === "republicar") {
        lineas.push("Republicar: crear el producto de nuevo en Dropi y archivar el actual sin stock");
        alDeshacer = "Se quita de la cola; no cambia nada en el sistema.";
        // Si se detuvo antes de crear nada (variaciones, la B280…), Dropi no se tocó: se quita de la cola y se republica a mano.
        if (intentos > 0 && republicacionSinTocarDropi(f.error as string | null, f.nuevo_dropi_id)) {
          alDeshacer = "Se quita de la cola; no cambia nada en el sistema. Dropi no se tocó: el intento se detuvo antes de crear nada, así que se republica a mano en Dropi.";
        } else if (intentos > 0 || f.nuevo_dropi_id) {
          deshacible = false;
          motivoNo = "Ya se empezó en Dropi (puede haber un producto nuevo): no se puede deshacer desde aquí.";
        }
      } else {
        const antes = (f.nombre_antes as string | null | undefined) ?? null;
        const precioAntes = num(f.precio_antes);
        const partes: string[] = [];
        if (f.nombre) {
          lineas.push(antes ? `Nombre: «${antes}» → «${f.nombre}»` : `Nombre: «${f.nombre}»`);
          partes.push(antes ? `el nombre vuelve a «${antes}»` : "el nombre se queda como está (no estaba guardado el anterior)");
        }
        if (f.precio != null) {
          lineas.push(`Precio ${precioAntes !== null ? `${usd(precioAntes)} → ` : ""}${usd(Number(f.precio))}`);
          partes.push(precioAntes !== null ? `el precio vuelve a ${usd(precioAntes)}` : "el precio se queda como está (no estaba guardado el anterior)");
        }
        if (f.precio_sugerido != null) lineas.push(`Precio sugerido ${num(f.precio_sugerido_antes) !== null ? `${usd(Number(f.precio_sugerido_antes))} → ` : ""}${usd(Number(f.precio_sugerido))}`);
        if (typeof f.descripcion === "string" && f.descripcion) {
          const largo = f.descripcion.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().length;
          lineas.push(`Descripción nueva (${largo} caracteres)`);
          partes.push(f.descripcion_antes ? "la descripción vuelve a la anterior" : "la descripción deja de ser la nueva");
        }
        if (cantidadFotos(f) > 0) lineas.push(`${cantidadFotos(f)} ${cantidadFotos(f) === 1 ? "foto" : "fotos"} por subir`);
        alDeshacer = partes.length ? `En el sistema: ${partes.join(" y ")}.` : "Se quita de la cola.";
      }
      return {
        id: f.id as string,
        tipo,
        publicacion: pub?.nombre ?? "Publicación",
        lineas,
        alDeshacer,
        error: (f.error as string | null) ?? null,
        creadoPor: (f.creado_por_nombre as string | null) ?? null,
        creadoEn: f.creado_en as string,
        deshacible,
        motivoNo,
      };
    }),
  };
}

/**
 * Deshace un cambio pendiente (pedido de Hernán, 23 oct 2026): lo quita de la cola de «Aplicar en Dropi» y deja el sistema como estaba antes
 * del cambio: un nombre vuelve al anterior, un precio vuelve al anterior, un apagado deja de verse apagado. Solo mientras Dropi no se haya
 * tocado (un apagado o una republicación que ya se intentó no se deshace desde aquí). Un nombre o un precio solo se devuelve si el sistema
 * todavía tiene el valor del cambio (si alguien lo volvió a cambiar, no se pisa).
 */
export async function deshacerCambioPendiente(cambioId: string): Promise<{ error?: string; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof cambioId !== "string" || !UUID.test(cambioId)) return { error: "Cambio no válido." };
  const supabase = createServiceClient();
  const { data: base } = await supabase.from("dropi_cambios_pendientes").select("pais_id").eq("id", cambioId).maybeSingle();
  if (!base || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, base.pais_id as string))) return { error: "Cambio no válido." };
  const { filas, error } = await leerPendientes(base.pais_id as string, [cambioId]);
  const { data: paisCambio } = await supabase.from("paises").select("codigo").eq("id", base.pais_id as string).maybeSingle();
  const usd = formatoDe(String(paisCambio?.codigo ?? "PA"));
  const f = filas[0];
  if (error || !f) return { error: "Ese cambio ya no está pendiente." };
  const tipo = tipoDe(f);
  const intentos = Number(f.intentos ?? 0);
  const pubId = f.publicacion_id as string;
  const pub = pubDe(f);
  const nombrePub = pub?.nombre ?? "Publicación";

  if (tipo === "apagar" && intentos > 0) return { error: "Ya se intentó en Dropi (el stock puede estar en cero): no se puede deshacer desde aquí." };
  const republicarSinTocar = tipo === "republicar" && intentos > 0 && republicacionSinTocarDropi(f.error as string | null, f.nuevo_dropi_id);
  if (tipo === "republicar" && !republicarSinTocar && (intentos > 0 || f.nuevo_dropi_id)) return { error: "Ya se empezó en Dropi (puede haber un producto nuevo): no se puede deshacer desde aquí." };
  if (tipo === "archivar" && intentos > 0) return { error: "Ya se intentó en Dropi: no se puede deshacer desde aquí." };
  if (tipo === "stock" && intentos > 0) return { error: "Ya se intentó en Dropi (el stock pudo haber cambiado): no se puede deshacer desde aquí." };
  if (tipo === "crear" && (intentos > 0 || f.nuevo_dropi_id)) return { error: "Ya se empezó a publicar en Dropi (puede existir el producto): no se puede deshacer desde aquí." };
  // Una privatización que falló antes de crear nada en Dropi (un correo equivocado, por ejemplo) sí se puede deshacer: el stock solo se mueve después de crear el privado.
  if (tipo === "privatizar" && f.nuevo_dropi_id) return { error: `Ya se creó el producto privado en Dropi (ID ${f.nuevo_dropi_id}): no se puede deshacer desde aquí.` };

  const restaurado: string[] = [];
  const antes: Record<string, string> = {};
  const despues: Record<string, string> = {};
  if (tipo === "cambio") {
    const cambios: Record<string, unknown> = {};
    const nombreAntes = (f.nombre_antes as string | null | undefined) ?? null;
    if (f.nombre && nombreAntes && pub?.nombre === f.nombre) {
      cambios.nombre = nombreAntes;
      antes["Nombre en Dropi"] = String(f.nombre);
      despues["Nombre en Dropi"] = nombreAntes;
      restaurado.push(`el nombre vuelve a «${nombreAntes}»`);
    }
    const precioAntes = num(f.precio_antes);
    const precioHoy = num(pub?.precio_venta);
    if (f.precio != null && precioAntes !== null && precioHoy !== null && Math.abs(precioHoy - Number(f.precio)) < 0.005) {
      cambios.precio_venta = precioAntes;
      antes["Precio"] = usd(Number(f.precio));
      despues["Precio"] = usd(precioAntes);
      restaurado.push(`el precio vuelve a ${usd(precioAntes)}`);
    }
    // La descripción vuelve a la anterior solo si el sistema todavía tiene la del cambio (si alguien la volvió a tocar, no se pisa).
    if (typeof f.descripcion === "string" && f.descripcion && pub?.descripcion === f.descripcion) {
      cambios.descripcion = (f.descripcion_antes as string | null) ?? null;
      antes["Descripción"] = "la nueva";
      despues["Descripción"] = f.descripcion_antes ? "la anterior" : "sin descripción guardada";
      restaurado.push(f.descripcion_antes ? "la descripción vuelve a la anterior" : "la descripción deja de ser la nueva");
    }
    if (Object.keys(cambios).length) {
      const { error: errorPub } = await supabase.from("dropi_publicaciones").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", pubId);
      if (errorPub) return { error: "No se pudo devolver la publicación a como estaba." };
    }
  }

  // «Archivar»: la publicación vuelve a como estaba antes de pedirlo (solo si sigue como la dejó el pedido).
  if (tipo === "archivar") {
    const volverA = { estado: (f.estado_antes as string | null) ?? null, estado_publicacion: (f.estado_publicacion_antes as string | null) ?? null };
    const sigue = f.restaurar === true ? pub?.estado_publicacion !== "archivado" : pub?.estado_publicacion === "archivado" || pub?.estado === "archivado";
    if (sigue && (volverA.estado || volverA.estado_publicacion)) {
      const { error: errorPub } = await supabase.from("dropi_publicaciones").update({ ...(volverA.estado ? { estado: volverA.estado } : {}), estado_publicacion: volverA.estado_publicacion, actualizado_en: new Date().toISOString() }).eq("id", pubId);
      if (errorPub) return { error: "No se pudo devolver la publicación a como estaba." };
      restaurado.push(f.restaurar === true ? "vuelve a Archivados" : "sale de Archivados");
    }
  }

  // Se quita de la cola (con «reemplazado», que ya sale de las listas y libera los índices); solo si Dropi sigue sin tocarse.
  const q = supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("id", cambioId).in("estado", ["pendiente", "error"]);
  // Una republicación detenida antes de tocar Dropi: solo si nadie la volvió a intentar mientras tanto (mismos intentos, sin producto nuevo).
  const { error: errorCola } = await (tipo === "cambio" ? q : tipo === "privatizar" ? q.is("nuevo_dropi_id", null) : republicarSinTocar ? q.is("nuevo_dropi_id", null).eq("intentos", intentos) : q.eq("intentos", 0));
  if (errorCola) return { error: "No se pudo quitar el cambio de la cola." };
  await registrarAuditoria({
    accion: tipo === "apagar" ? "dropi_apagar_cancelado" : tipo === "republicar" ? "dropi_republicar_cancelado" : tipo === "archivar" ? "dropi_archivar_cancelado" : tipo === "crear" ? "dropi_crear_cancelado" : tipo === "privatizar" ? "dropi_privatizar_cancelado" : tipo === "stock" ? "dropi_stock_cancelado" : "dropi_cambio_deshecho",
    entidad: "dropi_publicaciones",
    entidadId: pubId,
    detalle: `${nombrePub} · deshecho antes de aplicarse en Dropi${restaurado.length ? `: ${restaurado.join(" y ")}` : ""}`,
    ...(Object.keys(antes).length ? { antes, despues } : {}),
  });
  revalidatePath(RUTA);
  const resumen =
    tipo === "apagar"
      ? "vuelve a verse como antes"
      : tipo === "republicar" || tipo === "privatizar" || tipo === "stock"
        ? "se quitó de la cola"
        : tipo === "crear"
          ? "queda «Sin publicar», guardada con todos sus datos"
          : restaurado.length
            ? restaurado.join(" y ")
            : "se quitó de la cola; el sistema se queda como está";
  return { detalle: `Deshecho: ${resumen}. Dropi no se tocó.` };
}
