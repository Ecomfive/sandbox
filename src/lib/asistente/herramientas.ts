import "server-only";

// Las herramientas del asistente del sistema (14 nov 2026, pedido de Hernán). Todas **solo leen**, y cada una pide el mismo módulo que la pantalla de donde
// sale el dato: la IA ve lo que la persona que pregunta puede abrir, nada más (por eso reusan las mismas lecturas de las pantallas). Nada se escribe ni
// se manda. El resultado va en texto JSON corto para la IA.

import type Anthropic from "@anthropic-ai/sdk";
import type { UsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { cargarManuales, construirIndice } from "@/app/(app)/ayuda/datos-ayuda";
import { obtenerStockDeSku } from "@/app/(app)/inventario/stock-actions";
import { leerStockPlataformas } from "@/app/(app)/inventario/datos-plataformas";
import { obtenerComprasProducto } from "@/app/(app)/producto/compras-actions";
import { obtenerPedidoTienda } from "@/app/(app)/tienda-pedidos/ficha-actions";
import { buscarParaAsistente } from "./buscar-ayuda";

const texto = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ID = /^[0-9a-f-]{36}$/i;

/** Las herramientas, en orden fijo (el orden forma parte del prefijo que se guarda en caché). */
export const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_ayuda",
    description:
      "Busca en el Centro de ayuda del sistema (guías de cada módulo, glosario, cursos y manuales) lo que esa persona puede ver. Úsala para toda pregunta de cómo se hace algo, qué significa un término o dónde está una pantalla. Devuelve los textos y su enlace.",
    input_schema: { type: "object", properties: { consulta: { type: "string", description: "Palabras clave en español, p. ej. «remisión Dunamixfy» o «bodega B81»." } }, required: ["consulta"], additionalProperties: false },
  },
  {
    name: "buscar_producto",
    description: "Busca productos del sistema (módulo Producto) por nombre, código/SKU, N.º o código de barras. Devuelve su id, código, nombre, estado y si es variante. Úsala antes de pedir stock o compras de un producto.",
    input_schema: { type: "object", properties: { texto: { type: "string", description: "Nombre, código, N.º o código de barras." } }, required: ["texto"], additionalProperties: false },
  },
  {
    name: "stock_producto",
    description: "El stock de un producto en el país elegido arriba (módulo Inventario): por bodega (físico, reservado, disponible, en camino) y lo que dicen las plataformas (Dropi, Effi, Drop, Dunamixfy).",
    input_schema: { type: "object", properties: { producto_id: { type: "string", description: "El id que devolvió buscar_producto." } }, required: ["producto_id"], additionalProperties: false },
  },
  {
    name: "compras_producto",
    description: "Las compras (órdenes de Compras) de un producto: número, país, etapa, unidades, cuándo se pidió y cuándo llega o llegó. Pide el módulo Producto o Inventario.",
    input_schema: { type: "object", properties: { producto_id: { type: "string", description: "El id que devolvió buscar_producto." } }, required: ["producto_id"], additionalProperties: false },
  },
  {
    name: "pedido_tienda",
    description: "Un pedido de tienda (Gestión de tienda › Pedidos, Shopify) del país elegido, por su número (p. ej. «1257» o «#1257»): estado, recorrido, cliente, productos, total, entrega (Monday o Servientrega) y el asistente de confirmación.",
    input_schema: { type: "object", properties: { numero: { type: "string", description: "El número del pedido." } }, required: ["numero"], additionalProperties: false },
  },
];

/** Qué está haciendo la herramienta, para mostrarlo mientras responde. */
export const AVISO_HERRAMIENTA: Record<string, string> = {
  buscar_ayuda: "Buscando en el Centro de ayuda…",
  buscar_producto: "Buscando el producto…",
  stock_producto: "Revisando el stock…",
  compras_producto: "Revisando las compras…",
  pedido_tienda: "Buscando el pedido…",
};

const tiene = (u: UsuarioActual, ...modulos: string[]) => modulos.some((m) => u.modulos.includes(m));
const sinAcceso = (que: string) => JSON.stringify({ error: `Esta persona no tiene acceso a ${que} en su rol. Dile que se lo pida a un administrador.` });

/** Corre una herramienta con los permisos de la persona que pregunta. Siempre devuelve texto (un error también, para que la IA lo explique). */
export async function correrHerramienta(nombre: string, entrada: unknown, usuario: UsuarioActual): Promise<string> {
  const e = (entrada ?? {}) as Record<string, unknown>;
  try {
    switch (nombre) {
      case "buscar_ayuda": {
        const consulta = texto(e.consulta, 200);
        if (!consulta) return JSON.stringify({ error: "Falta la consulta." });
        const indice = construirIndice(usuario, await cargarManuales(usuario));
        const r = buscarParaAsistente(indice, consulta);
        return JSON.stringify(r.length ? { resultados: r } : { resultados: [], nota: "No hay nada en el Centro de ayuda con esas palabras: prueba con otras." });
      }
      case "buscar_producto": {
        if (!tiene(usuario, "producto", "inventario")) return sinAcceso("Producto");
        const q = texto(e.texto, 80).replace(/[%,()]/g, " ").trim();
        if (!q) return JSON.stringify({ error: "Falta qué buscar." });
        const supabase = createServiceClient();
        const numero = /^#?\d{1,6}$/.test(q) ? Number(q.replace("#", "")) : null;
        let consulta = supabase.from("skus_maestros").select("id, codigo, nombre, clase, numero, codigo_barras, padre_id").limit(10);
        consulta = numero !== null ? consulta.or(`numero.eq.${numero},codigo_barras.eq.${q}`) : consulta.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,codigo_barras.eq.${q}`);
        const { data, error } = await consulta;
        if (error) return JSON.stringify({ error: "No se pudo buscar el producto." });
        return JSON.stringify({ productos: (data ?? []).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.clase, numero: p.numero, barras: p.codigo_barras, esVariante: !!p.padre_id })) });
      }
      case "stock_producto": {
        if (!tiene(usuario, "inventario")) return sinAcceso("Inventario");
        const id = texto(e.producto_id, 40);
        if (!ID.test(id)) return JSON.stringify({ error: "Producto no válido: búscalo primero con buscar_producto." });
        const supabase = createServiceClient();
        const pais = await getPaisActual(supabase);
        const [r, plataformas] = await Promise.all([obtenerStockDeSku(id), leerStockPlataformas(supabase, pais.id).catch(() => null)]);
        if ("error" in r) return JSON.stringify({ error: r.error });
        const p = plataformas?.porProducto.get(id) ?? null;
        return JSON.stringify({
          pais: pais.nombre,
          bodegas: r.bodegas.map((b) => ({ bodega: b.nombre, externa: b.tipo === "externa", fisico: b.fisico, reservado: b.reservado, disponible: b.disponible, enCamino: b.enCamino, danado: b.danado, vencido: b.vencido })),
          plataformas: p ? { dropi: p.dropi, effi: p.effi, drop: p.drop, dunamixfy: p.dunamixfy, total: p.total, detalle: p.lineas.slice(0, 10).map((l) => ({ plataforma: l.plataforma, id: l.id, unidades: l.unidades, ...(l.aparte ? { [l.plataforma === "effi" ? "enGarantias" : "enBodegaProveedorReferencial"]: l.aparte } : {}), ...(l.exclusivo ? { exclusivasDeClientes: l.exclusivo } : {}) })) } : null,
          notaPlataformas: "unidades = stock que cuenta. enBodegaProveedorReferencial (Dropi) = lo que Dropi muestra en nuestra bodega de proveedor (B81 en Panamá): se pone a mano para la publicación, es solo referencia y no suma al stock. enGarantias (Effi) = la bodega de garantías. exclusivasDeClientes (Drop) = lo guardado para un cliente, ya incluido en unidades.",
          lotes: r.lotes.slice(0, 10),
        });
      }
      case "compras_producto": {
        if (!tiene(usuario, "producto", "inventario")) return sinAcceso("Producto o Inventario");
        const id = texto(e.producto_id, 40);
        if (!ID.test(id)) return JSON.stringify({ error: "Producto no válido: búscalo primero con buscar_producto." });
        const r = await obtenerComprasProducto(id);
        if ("error" in r) return JSON.stringify({ error: r.error });
        return JSON.stringify({ compras: r.compras.slice(0, 15).map((c) => ({ orden: c.codigo ?? c.numero, pais: c.pais, etapa: c.etapa, unidades: c.unidades, sku: c.sku, pedida: c.fecha, llego: c.llegada, llegaAprox: c.llegadaAprox, costoUnitario: c.costoUnitario })) });
      }
      case "pedido_tienda": {
        if (!tiene(usuario, "tienda-pedidos", "tienda-confirmacion", "tienda-logistica")) return sinAcceso("Gestión de tienda");
        const n = texto(e.numero, 20).replace(/^#/, "");
        if (!/^[A-Za-z0-9-]{1,20}$/.test(n)) return JSON.stringify({ error: "Número de pedido no válido." });
        const supabase = createServiceClient();
        const { data } = await supabase.from("ven_ordenes").select("id, numero, fin_unidades!inner(nombre, clase)").in("numero", [`#${n}`, n]).eq("fin_unidades.clase", "tienda").limit(5);
        if (!data?.length) return JSON.stringify({ error: `No hay ningún pedido de tienda con el número ${n}.` });
        const encontrados = [];
        for (const o of data) {
          const r = await obtenerPedidoTienda(String(o.id));
          if ("error" in r) continue;
          const x = r.orden;
          encontrados.push({
            numero: x.o.numero,
            tienda: x.tienda,
            fecha: x.o.fecha,
            fase: x.o.fase,
            etiquetas: x.o.etiquetas,
            cliente: x.cliente ? { nombre: x.cliente.nombre, corregimiento: x.cliente.corregimiento, direccion: x.cliente.direccion } : null,
            productos: x.lineas.map((l) => ({ producto: l.producto, cantidad: l.cantidad, precio: l.precio })),
            total: x.o.total,
            pago: x.o.estado_pago,
            entrega: x.entrega,
            asistente: x.asistente ? { riesgo: x.asistente.riesgo, resumen: x.asistente.resumen } : null,
            ultimosCambios: x.eventos.slice(0, 5).map((v) => ({ a: v.fase_despues, detalle: v.detalle, quien: v.usuario, cuando: v.creado_en })),
            enlace: `/tienda-pedidos?pedido=${x.id}`,
          });
        }
        return JSON.stringify(encontrados.length ? { pedidos: encontrados } : { error: "Ese pedido es de una tienda de otro país (cambia el país arriba para verlo)." });
      }
      default:
        return JSON.stringify({ error: `No existe la herramienta ${nombre}.` });
    }
  } catch {
    return JSON.stringify({ error: "La consulta falló. Intenta de nuevo en un momento." });
  }
}
