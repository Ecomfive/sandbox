"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { MODULO_ATENCION } from "@/lib/crm/areas";
import { CAMPOS_DATO, esCampoDato, normalizarDato, NUMERO_REGISTRADO } from "@/lib/crm/dato-dropshipper";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { leerCiudades, textoParaBuscar, type CiudadSugerida } from "@/lib/crm/ciudades";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { enlazarChatsPorTelefono, telefonoDeOtro } from "@/lib/whatsapp/vinculo";
import { etiquetaEstado } from "./def-crm";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Cambia un dato del bloque «Datos» de la ficha (nombre, estado, WhatsApp, tiendas, ciudad, ingreso, productos o correo), con un clic en el lápiz.
 * Devuelve el error como valor y, si sale bien, el valor guardado (ya limpio; en las listas, separado por comas). Queda en la Actividad del
 * dropshipper con el antes y el después. El WhatsApp se guarda en formato internacional (sin prefijo se asume el primer país donde vende), no se
 * puede repetir en otro dropshipper, enlaza los chats de ese número y **nunca se escribe en la auditoría ni vuelve a la pantalla**.
 */
export async function cambiarDatoDropshipper(id: string, campo: string, valor: string): Promise<{ error: string } | { valor: string | null }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  if (!ES_ID(String(id))) return { error: "Dropshipper no válido." };
  if (!esCampoDato(campo)) return { error: "Ese dato no se puede cambiar aquí." };
  const limpio = normalizarDato(campo, String(valor ?? ""), hoyPanama());
  if ("error" in limpio) return limpio;

  const { columna, etiqueta } = CAMPOS_DATO[campo];
  const supabase = createServiceClient();
  const { data: actual, error: errorLeer } = await supabase
    .from("dropshippers")
    .select("nombre, estado, contacto_telefono, tiendas, productos, ciudad, fecha_ingreso, contacto_email, dropshipper_paises(paises(codigo))")
    .eq("id", id)
    .maybeSingle();
  if (errorLeer) return { error: "No se pudo leer el dropshipper." };
  if (!actual) return { error: "No se encontró el dropshipper." };
  const fila = actual as unknown as Record<string, unknown>;

  // El WhatsApp: se normaliza y se comprueba contra los demás dropshippers antes de tocar nada.
  let telefono: { e164: string; pais: string | null } | null = null;
  if (campo === "telefono") {
    const primero = ((actual.dropshipper_paises ?? []) as unknown as { paises: { codigo: string } | { codigo: string }[] | null }[])
      .map((p) => (Array.isArray(p.paises) ? p.paises[0]?.codigo : p.paises?.codigo))
      .find(Boolean);
    const tel = normalizarTelefono(limpio.valor, primero);
    if (!tel) return { error: "El teléfono no es válido. Escríbelo con el prefijo del país, p. ej. +57 300 111 2233." };
    if (tel.e164 === fila.contacto_telefono) return { valor: NUMERO_REGISTRADO };
    if (await telefonoDeOtro(supabase, tel.e164, id)) return { error: "Ya hay un dropshipper con ese WhatsApp." };
    telefono = { e164: tel.e164, pais: tel.pais };
  }

  const lista = limpio.valor ? limpio.valor.split(", ") : [];

  // Los correos (30 oct 2026, pedido de Alcides; migración 0206): el primero es el principal (`contacto_email`) y los demás van en `dropshipper_correos`.
  // Cada correo es de un solo dropshipper, para poder reconocer con él sus cuentas en cada plataforma.
  let otrosCorreos: string[] | null = null;
  if (campo === "correo") {
    const guardados = await supabase.from("dropshipper_correos").select("correo").eq("dropshipper_id", id).order("creado_en");
    otrosCorreos = guardados.error ? null : (guardados.data ?? []).map((c) => c.correo as string);
    if (otrosCorreos === null && lista.length > 1) return { error: "Para guardar más de un correo falta correr la migración 0206 en Supabase." };
    if (lista.length) {
      const [principalAjeno, otroAjeno] = await Promise.all([
        supabase.from("dropshippers").select("contacto_email").in("contacto_email", lista).neq("id", id).limit(1),
        otrosCorreos === null ? Promise.resolve({ data: [] as { correo: string }[] }) : supabase.from("dropshipper_correos").select("correo").in("correo", lista).neq("dropshipper_id", id).limit(1),
      ]);
      const ajeno = (principalAjeno.data?.[0]?.contacto_email as string | undefined) ?? (otroAjeno.data?.[0]?.correo as string | undefined);
      if (ajeno) return { error: `«${ajeno}» ya es el correo de otro dropshipper.` };
    }
  }
  const antesCorreos = campo === "correo" ? [fila.contacto_email as string | null, ...(otrosCorreos ?? [])].filter(Boolean).join(", ") || null : null;
  const antesTexto = campo === "correo" ? antesCorreos : campo === "telefono" ? null : Array.isArray(fila[columna]) ? (fila[columna] as string[]).join(", ") || null : ((fila[columna] as string | null) ?? null) || null;
  if (campo !== "telefono" && antesTexto === limpio.valor) return { valor: limpio.valor };

  const cambio: Record<string, unknown> =
    campo === "telefono"
      ? { contacto_telefono: telefono!.e164, pais_origen: telefono!.pais }
      : campo === "tiendas"
        ? { tienda: lista[0] ?? null, tiendas: lista }
        : campo === "productos"
          ? { productos: lista }
          : campo === "correo"
            ? { contacto_email: lista[0] ?? null }
            : { [columna]: limpio.valor };
  const { error } = await supabase.from("dropshippers").update(cambio).eq("id", id);
  if (error) return { error: error.code === "23505" ? "Ya hay un dropshipper con ese WhatsApp." : "No se pudo guardar." };

  // Los demás correos se reemplazan por los de la lista (sin el principal).
  if (campo === "correo" && otrosCorreos !== null) {
    const borrar = await supabase.from("dropshipper_correos").delete().eq("dropshipper_id", id);
    if (borrar.error) return { error: "No se pudieron guardar los demás correos." };
    const otros = lista.slice(1);
    if (otros.length) {
      const poner = await supabase.from("dropshipper_correos").insert(otros.map((correo) => ({ dropshipper_id: id, correo, creado_por: usuario.nombre || usuario.email })));
      if (poner.error) return { error: poner.error.code === "23505" ? "Uno de los correos ya es de otro dropshipper." : "No se pudieron guardar los demás correos." };
    }
  }

  // Los chats sin enlazar de ese número quedan enlazados desde ahora, sin esperar a su próximo mensaje.
  if (telefono && (await enlazarChatsPorTelefono(supabase, id, telefono.e164)) > 0) revalidatePath("/crm-dropshippers/bandeja");

  const queEra = campo === "estado" ? etiquetaEstado(String(fila.estado)) : (antesTexto ?? "—");
  const queQueda = campo === "estado" ? etiquetaEstado(String(limpio.valor)) : (limpio.valor ?? "—");
  await registrarAuditoria({
    accion: campo === "estado" ? "cambiar_estado_dropshipper" : "editar_dropshipper",
    entidad: "dropshippers",
    entidadId: id,
    ...(campo === "telefono" ? { detalle: "Cambió el WhatsApp" } : { antes: { [etiqueta]: queEra }, despues: { [etiqueta]: queQueda } }),
  });
  revalidatePath("/crm-dropshippers", "layout");
  return { valor: campo === "telefono" ? NUMERO_REGISTRADO : limpio.valor };
}

// Lo ya buscado, en memoria del servidor (son ciudades, no datos de nadie): «Cali» no se vuelve a pedir en cada letra ni por cada persona.
const ciudadesBuscadas = new Map<string, CiudadSugerida[]>();

/**
 * Las ciudades del mundo que se llaman como lo escrito, con su país, para el dato «Ciudad» de la ficha (30 oct 2026, pedido de Alcides: «Cali» →
 * «Santiago de Cali, Colombia»). Las da el buscador público de Open-Meteo (sin clave; solo viaja lo escrito) y `leerCiudades` pone primero las de los
 * países donde trabajamos. Devuelve el error como valor; sin respuesta, la persona puede escribir la ciudad igual.
 */
export async function buscarCiudades(escrito: string): Promise<{ ciudades: CiudadSugerida[] } | { error: string }> {
  await requireModuloEscritura(MODULO_ATENCION);
  const texto = textoParaBuscar(String(escrito ?? ""));
  if (!texto) return { ciudades: [] };
  const clave = texto.toLowerCase();
  const guardadas = ciudadesBuscadas.get(clave);
  if (guardadas) return { ciudades: guardadas };
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(texto)}&count=10&language=es&format=json`;
  const r = await descargarPublico(url, 200_000);
  if ("error" in r) return { error: "No se pudo buscar la ciudad. Escríbela con su país, por ejemplo: Cali, Colombia." };
  let json: unknown = null;
  try {
    json = JSON.parse(new TextDecoder().decode(r.bytes));
  } catch {
    return { error: "No se pudo buscar la ciudad. Escríbela con su país, por ejemplo: Cali, Colombia." };
  }
  const ciudades = leerCiudades(json);
  if (ciudadesBuscadas.size > 500) ciudadesBuscadas.clear();
  ciudadesBuscadas.set(clave, ciudades);
  return { ciudades };
}
