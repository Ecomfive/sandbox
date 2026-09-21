"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { leerDatosBinance, type DatosBinance } from "@/lib/retiros/datos-binance";

/** Arma el bloque de comisión sugerida a partir del formulario: según el tipo elegido, se
 * queda solo con el/los valor(es) que aplican y anula el resto, para que nunca quede un
 * porcentaje sobrante guardado cuando el tipo es "monto fijo", por ejemplo. */
function leerComision(formData: FormData) {
  const tipo = (formData.get("comision_tipo") as string) || null;
  const pctTexto = formData.get("comision_porcentaje") as string | null;
  const montoTexto = formData.get("comision_monto_fijo") as string | null;
  const pct = pctTexto && pctTexto !== "" ? Number(pctTexto) : null;
  const monto = montoTexto && montoTexto !== "" ? Number(montoTexto) : null;

  return {
    comision_tipo: tipo,
    comision_porcentaje: tipo === "porcentaje" || tipo === "ambos" ? pct : null,
    comision_monto_fijo: tipo === "monto_fijo" || tipo === "ambos" ? monto : null,
  };
}

/**
 * Para una cuenta Binance, los datos en el formato de Dropi (país, banco, identificación, tipo y número de cuenta).
 * `null` si el formulario no los trae (el formulario viejo de Configuración solo manda «Detalle»): entonces se
 * guarda como siempre. El número de cuenta también va en `detalle`, que es lo que muestran las listas.
 */
function leerBinance(formData: FormData): { datos: DatosBinance } | { error: string } | null {
  if (formData.get("tipo") !== "binance" || !formData.has("binance_numero_cuenta")) return null;
  return leerDatosBinance(formData);
}

const AVISO_MIGRACION =
  "Falta correr la migración 0039 en Supabase para guardar los datos de Binance (ver supabase/migrations).";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearCuentaRetiro(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("retiros");
  const pais_id = formData.get("pais_id") as string;
  const tipo = formData.get("tipo") as string;
  const nombre = formData.get("nombre") as string;
  let detalle = (formData.get("detalle") as string) || null;

  const binance = leerBinance(formData);
  if (binance && "error" in binance) return { error: binance.error };
  if (binance) detalle = binance.datos.numero_cuenta;

  const supabase = createServiceClient();

  // Numeración simple por país (Cuenta 1, Cuenta 2...) — estas cuentas se crean muy de vez
  // en cuando, así que no hace falta una función de correlativo a prueba de carreras.
  const { data: ultima } = await supabase
    .from("cuentas_retiro")
    .select("numero")
    .eq("pais_id", pais_id)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numero = (ultima?.numero ?? 0) + 1;

  const { error } = await supabase.from("cuentas_retiro").insert({
    pais_id,
    tipo,
    nombre,
    detalle,
    numero,
    ...(binance ? { datos_binance: binance.datos } : {}),
    ...leerComision(formData),
  });
  if (error) return { error: error.message.includes("datos_binance") ? AVISO_MIGRACION : error.message };

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
  return {};
}

/** Edita a mano cualquier dato de una cuenta ya creada — nombre, cuenta/detalle, tipo o
 * comisión sugerida — todo junto, desde la ficha de "Modificar". Cambiar esto no toca los
 * retiros ya creados: cada uno guarda su propia comisión en su propia fila. */
export async function actualizarCuentaRetiro(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;

  const cambios: Record<string, string | number | DatosBinance | null> = {};
  if (formData.has("nombre")) cambios.nombre = (formData.get("nombre") as string).trim();
  if (formData.has("detalle")) cambios.detalle = (formData.get("detalle") as string).trim() || null;
  if (formData.has("tipo")) cambios.tipo = formData.get("tipo") as string;

  const binance = leerBinance(formData);
  if (binance && "error" in binance) return { error: binance.error };
  if (binance) {
    cambios.datos_binance = binance.datos;
    cambios.detalle = binance.datos.numero_cuenta;
  } else if (formData.get("tipo") !== "binance" && formData.get("binance_previo") === "1") {
    // Dejó de ser Binance: se quitan sus datos (solo si los tenía, para no tocar la columna de más).
    cambios.datos_binance = null;
  }

  if (formData.has("comision_tipo")) Object.assign(cambios, leerComision(formData));
  if (Object.keys(cambios).length === 0) return {};

  const supabase = createServiceClient();
  const { error } = await supabase.from("cuentas_retiro").update(cambios).eq("id", id);
  if (error) return { error: error.message.includes("datos_binance") ? AVISO_MIGRACION : error.message };

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
  return {};
}

/** Borra la cuenta, salvo que ya tenga retiros asociados — ahí se bloquea con un mensaje claro
 * en vez de romper el historial de esos retiros (que muestran su destino desde esta tabla).
 * Devuelve el error como valor en vez de lanzarlo: en producción, Next.js oculta el mensaje
 * de cualquier excepción de un server action, y este mensaje sí lo necesita ver la persona. */
export async function eliminarCuentaRetiro(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("retiros")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_retiro_id", id);
  if (count && count > 0) {
    return {
      error: `No se puede eliminar: tiene ${count} retiro${count === 1 ? "" : "s"} asociado${count === 1 ? "" : "s"}. Desactívala en vez de eliminarla.`,
    };
  }

  const { error } = await supabase.from("cuentas_retiro").delete().eq("id", id);
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "eliminar_cuenta_retiro",
    entidad: "cuentas_retiro",
    entidadId: id,
    detalle: "Cuenta de retiro eliminada",
  });

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
  return {};
}

export async function alternarActivaCuenta(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;
  const activa = formData.get("activa") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase.from("cuentas_retiro").update({ activa }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "activar_cuenta_retiro",
    entidad: "cuentas_retiro",
    entidadId: id,
    antes: { Estado: activa ? "Inactiva" : "Activa" },
    despues: { Estado: activa ? "Activa" : "Inactiva" },
  });

  revalidatePath("/retiros/cuentas");
  revalidatePath("/retiros");
}
