"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getUsuarioActual } from "@/lib/auth";

export interface ResultadoBusqueda {
  tipo: "pedido" | "producto" | "dropshipper";
  etiquetaTipo: string;
  titulo: string;
  detalle: string;
  href: string;
}

const LIMITE_POR_TIPO = 5;

/** Busca por nombre/SKU/referencia en pedidos, productos y dropshippers, respetando los módulos del usuario. */
export async function buscarGlobal(consulta: string): Promise<ResultadoBusqueda[]> {
  const texto = consulta.trim();
  if (texto.length < 2) return [];

  const usuario = await getUsuarioActual();
  if (!usuario) return [];

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const resultados: ResultadoBusqueda[] = [];

  const tareas: PromiseLike<unknown>[] = [];

  if (usuario.modulos.includes("productos")) {
    tareas.push(
      supabase
        .from("productos")
        .select("sku, nombre")
        .eq("pais_id", pais.id)
        .or(`nombre.ilike.%${texto}%,sku.ilike.%${texto}%`)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const p of data ?? []) {
            resultados.push({
              tipo: "producto",
              etiquetaTipo: "Producto",
              titulo: p.nombre,
              detalle: p.sku,
              href: `/productos?buscar=${encodeURIComponent(p.sku)}`,
            });
          }
        })
    );
  }

  if (usuario.modulos.includes("pedidos-dropi")) {
    tareas.push(
      supabase
        .from("ordenes")
        .select("referencia_externa, estado, productos(nombre)")
        .eq("pais_id", pais.id)
        .ilike("referencia_externa", `%${texto}%`)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const o of data ?? []) {
            const producto = Array.isArray(o.productos) ? o.productos[0] : o.productos;
            resultados.push({
              tipo: "pedido",
              etiquetaTipo: "Pedido Dropi",
              titulo: `Orden ${o.referencia_externa}`,
              detalle: producto?.nombre ?? o.estado,
              href: "/pedidos-dropi",
            });
          }
        })
    );
  }

  if (usuario.modulos.includes("crm-dropshippers")) {
    tareas.push(
      supabase
        .from("dropshippers")
        .select("nombre, estado")
        .eq("pais_id", pais.id)
        .ilike("nombre", `%${texto}%`)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const d of data ?? []) {
            resultados.push({
              tipo: "dropshipper",
              etiquetaTipo: "Dropshipper",
              titulo: d.nombre,
              detalle: d.estado,
              href: "/crm-dropshippers",
            });
          }
        })
    );
  }

  await Promise.all(tareas);
  return resultados;
}
