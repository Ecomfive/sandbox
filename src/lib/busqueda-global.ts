"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getUsuarioActual } from "@/lib/auth";
import { etiquetaCorrelativo, leerBusquedaRetiro } from "@/lib/paleta";
import { formatearMoneda } from "@/lib/formato";

export interface ResultadoBusqueda {
  tipo: "retiro" | "pedido" | "producto" | "dropshipper";
  etiquetaTipo: string;
  titulo: string;
  detalle: string;
  href: string;
}

const LIMITE_POR_TIPO = 5;

/**
 * Busca por correlativo de retiro (#0007 o 7), nombre/SKU/referencia en pedidos, productos y
 * dropshippers, respetando los módulos del usuario.
 */
export async function buscarGlobal(consulta: string): Promise<ResultadoBusqueda[]> {
  const texto = consulta.trim();
  const correlativo = leerBusquedaRetiro(texto);
  // Un número suelto ("7") busca un retiro aunque tenga un solo dígito; el resto pide al menos 2 letras.
  if (texto.length < 2 && correlativo === null) return [];

  const usuario = await getUsuarioActual();
  if (!usuario) return [];

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const resultados: ResultadoBusqueda[] = [];

  const tareas: PromiseLike<unknown>[] = [];

  if (correlativo !== null && usuario.modulos.includes("retiros")) {
    tareas.push(
      supabase
        .from("retiros")
        .select("id, numero_correlativo, monto, estado, plataformas(nombre)")
        .eq("pais_id", pais.id)
        .eq("numero_correlativo", correlativo)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const r of data ?? []) {
            const plataforma = Array.isArray(r.plataformas) ? r.plataformas[0] : r.plataformas;
            resultados.unshift({
              tipo: "retiro",
              etiquetaTipo: "Retiro",
              titulo: `Retiro ${etiquetaCorrelativo(r.numero_correlativo)}`,
              detalle: [plataforma?.nombre, formatearMoneda(Number(r.monto), pais.codigo), r.estado].filter(Boolean).join(" · "),
              href: `/retiros/${r.id}`,
            });
          }
        })
    );
  }

  const buscaTexto = texto.length >= 2;

  if (buscaTexto && usuario.modulos.includes("productos")) {
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

  if (buscaTexto && usuario.modulos.includes("pedidos-dropi")) {
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

  if (buscaTexto && usuario.modulos.includes("crm-dropshippers")) {
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
