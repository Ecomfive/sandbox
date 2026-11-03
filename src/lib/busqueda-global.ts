"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getUsuarioActual } from "@/lib/auth";
import { etiquetaCorrelativo, leerBusquedaRetiro } from "@/lib/paleta";
import { formatearMoneda } from "@/lib/formato";
import { etiquetaEstado as etiquetaEstadoTest } from "@/app/(app)/productos-test/def-productos-test";
import { VIGILADOS } from "@/lib/competencia/analisis";
import { nombrePais } from "@/app/(app)/scraping-proveedores/def-scraping";

export interface ResultadoBusqueda {
  tipo: "retiro" | "pedido" | "producto" | "producto-test" | "dropshipper" | "puesto" | "proveedor" | "competidor";
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

  // El texto entra en un filtro `.or()` de PostgREST, donde la coma, los paréntesis y los comodines tienen significado:
  // se quitan para que quien escribe no pueda agregar condiciones propias.
  const textoFiltro = texto.replace(/[,()*%_\\"'`]/g, " ").replace(/\s+/g, " ").trim();

  if (buscaTexto && textoFiltro.length >= 2 && usuario.modulos.includes("productos")) {
    tareas.push(
      supabase
        .from("productos")
        .select("sku, nombre")
        .eq("pais_id", pais.id)
        .or(`nombre.ilike.%${textoFiltro}%,sku.ilike.%${textoFiltro}%`)
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

  if (buscaTexto && usuario.modulos.includes("productos-test")) {
    tareas.push(
      supabase
        .from("wms_productos_test")
        .select("nombre, estado")
        .eq("pais_id", pais.id)
        .ilike("nombre", `%${texto}%`)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const p of data ?? []) {
            resultados.push({
              tipo: "producto-test",
              etiquetaTipo: "Producto Test",
              titulo: p.nombre,
              detalle: etiquetaEstadoTest(p.estado),
              // La lista de productos abre ya filtrada por el nombre (`?buscar=`).
              href: `/productos-test/productos?buscar=${encodeURIComponent(p.nombre)}`,
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
              href: `/crm-dropshippers?buscar=${encodeURIComponent(d.nombre)}`,
            });
          }
        })
    );
  }

  if (buscaTexto && usuario.modulos.includes("puestos")) {
    tareas.push(
      supabase
        .from("puestos")
        .select("id, nombre, area")
        .eq("activo", true)
        .ilike("nombre", `%${texto}%`)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const p of data ?? []) {
            resultados.push({ tipo: "puesto", etiquetaTipo: "Puesto", titulo: p.nombre, detalle: p.area, href: `/puestos?abrir=${encodeURIComponent(p.id)}` });
          }
        })
    );
  }

  // Proveedores (3 nov 2026, pedido de Hernán: «Oferfly» no salía en el buscador): los referentes de Scraping de proveedores, de
  // cualquier país, y los competidores del Análisis de competencia del país de la barra, también por el nombre con que vigilamos a uno
  // (`VIGILADOS`: Oferfly sale en Dropi como «IMPORTADORA»).
  if (buscaTexto && textoFiltro.length >= 2 && usuario.modulos.includes("scraping-proveedores")) {
    tareas.push(
      supabase
        .from("scraping_proveedores")
        .select("nombre, pais")
        .eq("activo", true)
        .ilike("nombre", `%${textoFiltro}%`)
        .limit(LIMITE_POR_TIPO)
        .then(({ data }) => {
          for (const p of data ?? []) {
            resultados.push({ tipo: "proveedor", etiquetaTipo: "Proveedor referente", titulo: p.nombre, detalle: `Scraping de proveedores · ${nombrePais(p.pais)}`, href: "/scraping-proveedores/proveedores" });
          }
        })
    );
  }

  if (buscaTexto && textoFiltro.length >= 2 && usuario.modulos.includes("analisis-competencia")) {
    const minusculas = textoFiltro.toLowerCase();
    const vigilados = Object.entries(VIGILADOS[pais.codigo.toLowerCase()] ?? {}).filter(([, nombre]) => nombre.toLowerCase().includes(minusculas));
    tareas.push(
      Promise.all([
        supabase.from("competencia_productos").select("proveedor_dropi_id, proveedor_nombre").eq("pais_id", pais.id).eq("es_nuestro", false).ilike("proveedor_nombre", `%${textoFiltro}%`).limit(200),
        vigilados.length
          ? supabase.from("competencia_productos").select("proveedor_dropi_id, proveedor_nombre").eq("pais_id", pais.id).in("proveedor_dropi_id", vigilados.map(([id]) => Number(id))).limit(50)
          : Promise.resolve({ data: [] as { proveedor_dropi_id: number; proveedor_nombre: string }[] }),
      ]).then(([porNombre, porVigilado]) => {
        const vistos = new Map<number, string>();
        for (const c of [...(porVigilado.data ?? []), ...(porNombre.data ?? [])]) if (!vistos.has(Number(c.proveedor_dropi_id))) vistos.set(Number(c.proveedor_dropi_id), c.proveedor_nombre);
        for (const [id, nombre] of [...vistos].slice(0, LIMITE_POR_TIPO)) {
          const vigilado = VIGILADOS[pais.codigo.toLowerCase()]?.[id];
          resultados.push({
            tipo: "competidor",
            etiquetaTipo: "Competidor",
            titulo: vigilado ? `${vigilado} (${nombre})` : nombre,
            detalle: `Análisis de competencia · ${pais.nombre}${vigilado ? " · vigilado" : ""}`,
            href: `/analisis-competencia?buscar=${encodeURIComponent(vigilado ?? nombre)}`,
          });
        }
      })
    );
  }

  await Promise.all(tareas);
  return resultados;
}
