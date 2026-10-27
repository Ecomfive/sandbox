"use server";

import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { guardarCeldaRegistro } from "@/lib/proveedor/registro-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoAlTablero } from "../acceso-compras";
import { campoOculto, restriccionesDe } from "../permisos-compras";

/**
 * «Pagos a Shen Zhen» › Registro de pagos: alguien de Ecomfive cambia una celda (vacía, vuelve al valor de siempre). No toca la compra
 * (Compras lo actualiza Francis a mano); Shen Zhen recibe el aviso en «Lo nuevo de Ecomfive». Pide modificar Compras y ver sus montos, y
 * solo filas de los países que la persona ve. Devuelve el error como valor.
 */
export async function guardarCeldaRegistroEcomfive(fila: string, campo: string, valor: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  const sinTablero = sinAccesoAlTablero(usuario);
  if (sinTablero) return { error: sinTablero };
  if (campoOculto(restriccionesDe(usuario.afinado.compras), "monto")) return { error: "No tienes permiso para ver los pagos." };
  const supabase = createServiceClient();
  const { data: proveedor } = await supabase.from("proveedores").select("id, nombre").eq("activo", true).order("creado_en").limit(1).maybeSingle();
  if (!proveedor) return { error: "No hay proveedor activo." };
  return guardarCeldaRegistro(
    supabase,
    proveedor.id as string,
    fila,
    campo,
    valor,
    { lado: "ecomfive", nombre: usuario.nombre || usuario.email || "Ecomfive", usuarioId: usuario.id, proveedor: proveedor.nombre as string },
    (codigo) => puedeVerPais(usuario.paisesPermitidos, codigo),
  );
}
