"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { leerMonto } from "@/lib/ia/monto";
import { ETIQUETA_PROVEEDOR, type ProveedorConsumo } from "@/lib/ia/precios";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const PROVEEDORES: ProveedorConsumo[] = ["openai", "gemini", "anthropic"];
const SIN_MIGRACION = "Falta correr en Supabase la migración 0134.";

/**
 * Registra el crédito de un proveedor: su **saldo** de hoy (lo que muestra su consola; el consumo se cuenta desde ahora) o una **recarga**
 * (se suma al saldo). Con eso se estima cuánto queda y se avisa cuando baja del monto de aviso. Solo quien puede modificar el módulo.
 * Devuelve el error como valor.
 */
export async function registrarCreditoIA(entrada: { proveedor: string; tipo: string; monto: string; nota: string }): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const proveedor = PROVEEDORES.find((p) => p === entrada.proveedor);
  if (!proveedor) return { error: "Proveedor no válido." };
  if (entrada.tipo !== "saldo" && entrada.tipo !== "recarga") return { error: "Elige si es el saldo de hoy o una recarga." };
  const monto = leerMonto(entrada.monto);
  if (monto === null) return { error: "Escribe el monto en dólares, por ejemplo 20 o 12,50." };
  if (entrada.tipo === "recarga" && monto === 0) return { error: "Una recarga debe ser mayor a cero." };
  const nota = String(entrada.nota ?? "").trim().slice(0, 200);
  const { error } = await createServiceClient()
    .from("ia_creditos")
    .insert({ proveedor, tipo: entrada.tipo, monto_usd: monto, nota: nota || null, usuario_id: usuario.id, usuario_nombre: usuario.nombre || usuario.email });
  if (error) return { error: /does not exist|schema cache|relation/i.test(error.message) ? SIN_MIGRACION : "No se pudo guardar." };
  await registrarAuditoria({ accion: "registrar_credito_ia", entidad: "ia_creditos", detalle: `${ETIQUETA_PROVEEDOR[proveedor]}: ${entrada.tipo === "saldo" ? "saldo" : "recarga"} de $${monto.toFixed(2)}${nota ? ` · ${nota}` : ""}` });
  revalidatePath("/publicaciones-dropi/consumo");
  return {};
}

/** El monto de aviso de un proveedor: cuando el saldo estimado baja de ahí, sale el aviso en Hoy y Avisos. */
export async function guardarUmbralIA(proveedorTexto: string, monto: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const proveedor = PROVEEDORES.find((p) => p === proveedorTexto);
  if (!proveedor) return { error: "Proveedor no válido." };
  const umbral = leerMonto(monto);
  if (umbral === null) return { error: "Escribe el monto en dólares, por ejemplo 5." };
  const { error } = await createServiceClient()
    .from("ia_consumo_config")
    .upsert({ proveedor, umbral_usd: umbral, actualizado_en: new Date().toISOString(), actualizado_por_nombre: usuario.nombre || usuario.email }, { onConflict: "proveedor" });
  if (error) return { error: /does not exist|schema cache|relation/i.test(error.message) ? SIN_MIGRACION : "No se pudo guardar." };
  await registrarAuditoria({ accion: "cambiar_aviso_credito_ia", entidad: "ia_creditos", detalle: `${ETIQUETA_PROVEEDOR[proveedor]}: avisar con menos de $${umbral.toFixed(2)}` });
  revalidatePath("/publicaciones-dropi/consumo");
  return {};
}
