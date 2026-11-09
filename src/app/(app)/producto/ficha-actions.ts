"use server";

import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { puedeUnirProductos } from "@/lib/permisos/unir-productos";
import { cargarProductos } from "./datos-producto";
import type { FilaProducto, ReferenciasTest } from "./def-producto";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

export interface ProductoParaFicha {
  producto: FilaProducto;
  codigoPais: string;
  puedeEscribir: boolean;
  puedeEliminar: boolean;
  puedeUnir: boolean;
  referenciasTest: ReferenciasTest;
}

/**
 * Lo que hace falta para abrir la ficha de un producto desde otro módulo (la de una publicación de Dropi): su fila ya armada y
 * lo que decide qué puede hacer la persona. Hay que poder abrir Producto. Devuelve el error como valor.
 */
export async function obtenerProductoParaFicha(id: string): Promise<ProductoParaFicha | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("producto")) return { error: "No tienes acceso a Producto." };
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { filas, referenciasTest } = await cargarProductos(usuario, supabase, pais.codigo);
  const producto = filas.find((f) => f.id === id);
  if (!producto) return { error: "No se encontró el producto." };
  const puedeEscribir = !usuario.modulosSoloLectura.includes("producto");
  return { producto, codigoPais: pais.codigo, puedeEscribir, puedeEliminar: puedeEscribir && esAdministrador(usuario), puedeUnir: puedeUnirProductos(usuario), referenciasTest };
}
