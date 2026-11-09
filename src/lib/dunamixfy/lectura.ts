/**
 * Dunamixfy (dunamixfy.cr, Costa Rica; 9 nov 2026, pedido de Hernán): lo que manda la pestaña de Dunamixfy con la cuenta de proveedor (extension/ecomfive-dropi/lectores/dunamixfy.js),
 * revisado. La lectura viene de una página de internet: nada se da por bueno sin revisarlo. Sin base ni red, con prueba (lectura.test.ts).
 * - **Productos** (`/api/products`): cada uno con sus inventarios. Solo cuentan los inventarios activos y sin borrar (Dunamixfy deja filas apagadas, como una de 200
 *   unidades creada y apagada el 9 nov 2026): su stock se suma y el precio es el del inventario de la bodega principal.
 * - **Pedidos** (`/api/orders`): sin nada del cliente. Las **salidas** son lo de cada pedido despachado (salió de la bodega), el día del despacho; las **devueltas**, lo de
 *   cada pedido en «DEVOLUCION», el día en que quedó así. Un pedido cancelado o anulado no cuenta.
 */

export interface LecturaProductosDunamixfy {
  tipo: "dunamixfy";
  pais: string;
  inicio: string;
  productos: unknown[];
}

export interface LecturaPedidosDunamixfy {
  tipo: "dunamixfy-pedidos";
  pais: string;
  inicio: string;
  pedidos: unknown[];
}

export interface ProductoLeidoDunamixfy {
  /** El número del producto («837»). */
  dunamixfyId: string;
  interno: string | null;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  precio: number | null;
  precioSugerido: number | null;
  stock: number;
  reservado: number;
  activo: boolean;
  privado: boolean;
  borrado: boolean;
  fotoUrl: string | null;
  creado: string | null;
}

export interface PedidoLeidoDunamixfy {
  id: string;
  numero: number | null;
  /** El estado del envío («ENTREGADO», «DEVOLUCION»…). */
  envio: string | null;
  creado: string | null;
  despachado: string | null;
  /** Cuándo quedó en «DEVOLUCION» (del historial del envío) o cuándo se recibió de vuelta. */
  devuelto: string | null;
  vendedor: { id: string; nombre: string; tienda: string | null } | null;
  productos: { id: string; nombre: string; cantidad: number }[];
}

export interface VentaDiaDunamixfy {
  producto_id: string;
  dia: string;
  salidas: number;
  devueltas: number;
}

/** Los estados de envío de un pedido que no salió de verdad. */
const NO_CUENTA = new Set(["CANCELADO", "ANULADO"]);
export const ENVIO_DEVUELTO = "DEVOLUCION";
export const ENVIO_ENTREGADO = "ENTREGADO";

const NUMERO = /^[0-9]{1,9}$/;
const ID = /^[a-z0-9]{10,40}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}T/;
/** Las fotos de Dunamixfy: el servidor solo baja de https (el dominio se revisa al bajar). */
const FOTO = /^https:\/\/[a-z0-9.-]+\/[^\s"'<>]{1,500}$/i;

const texto = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fecha = (v: unknown): string | null => (typeof v === "string" && FECHA.test(v) && Number.isFinite(Date.parse(v)) ? v : null);
const monto = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
};

/** El día en Costa Rica (UTC−6, sin horario de verano) de una fecha ISO. */
export const diaCostaRica = (iso: string) => new Date(Date.parse(iso) - 6 * 3600_000).toISOString().slice(0, 10);

/** Los productos de la lectura, revisados: uno por número, con el stock de sus inventarios activos. */
export function productosDeLectura(crudos: unknown[]): ProductoLeidoDunamixfy[] {
  const salida = new Map<string, ProductoLeidoDunamixfy>();
  for (const c of Array.isArray(crudos) ? crudos : []) {
    if (!c || typeof c !== "object") continue;
    const p = c as Record<string, unknown>;
    const id = String(p.productNumberId ?? "");
    const nombre = texto(p.name);
    if (!NUMERO.test(id) || !nombre || salida.has(id)) continue;
    const inventarios = (Array.isArray(p.inventories) ? p.inventories : []).filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
    const activos = inventarios.filter((i) => i.isActive !== false && !i.deletedAt && !i.privateUserId);
    const principal = activos.find((i) => (i.warehouse as { isPrincipal?: boolean } | null)?.isPrincipal) ?? activos[0] ?? null;
    const fotos = Array.isArray(p.images) ? p.images : [];
    const foto = fotos.find((f): f is string => typeof f === "string" && FOTO.test(f)) ?? null;
    salida.set(id, {
      dunamixfyId: id,
      interno: typeof p.id === "string" && ID.test(p.id) ? p.id : null,
      nombre,
      sku: texto(p.sku, 80),
      categoria: texto(p.category, 80),
      precio: principal ? monto(principal.price) : null,
      precioSugerido: principal ? (monto(principal.suggestedPrice) || null) : null,
      stock: activos.reduce((t, i) => t + Math.max(0, Math.trunc(Number(i.stock) || 0)), 0),
      reservado: activos.reduce((t, i) => t + Math.max(0, Math.trunc(Number(i.reserved) || 0)), 0),
      activo: p.isActive !== false,
      privado: p.isPrivate === true,
      borrado: !!p.deletedAt,
      fotoUrl: foto,
      creado: fecha(p.createdAt),
    });
  }
  return [...salida.values()];
}

/** Los pedidos de la lectura, revisados: id, estado del envío, fechas, quién lo vendió y sus productos (cantidades enteras de 1 a 1.000). */
export function pedidosDeLectura(crudos: unknown[]): PedidoLeidoDunamixfy[] {
  const vistos = new Set<string>();
  const salida: PedidoLeidoDunamixfy[] = [];
  for (const c of Array.isArray(crudos) ? crudos : []) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!ID.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    const productos = (Array.isArray(o.productos) ? o.productos : []).flatMap((x) => {
      const p = (x ?? {}) as Record<string, unknown>;
      const pid = String(p.id ?? "");
      const cantidad = Number(p.cantidad);
      return NUMERO.test(pid) && Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 1000 ? [{ id: pid, nombre: String(p.nombre ?? "").slice(0, 200), cantidad }] : [];
    });
    const v = (o.vendedor ?? null) as Record<string, unknown> | null;
    const vendedor = v && typeof v.id === "string" && ID.test(v.id) ? { id: v.id, nombre: texto(v.nombre) ?? v.id, tienda: texto(v.tienda) } : null;
    const numero = Number(o.numero);
    salida.push({
      id,
      numero: Number.isInteger(numero) && numero > 0 ? numero : null,
      envio: texto(o.envio, 40),
      creado: fecha(o.creado),
      despachado: fecha(o.despachado),
      devuelto: fecha(o.devuelto),
      vendedor,
      productos,
    });
  }
  return salida;
}

/** Las unidades por producto de Dunamixfy y día: salidas el día del despacho, devueltas el día en que quedó en devolución. */
export function ventasPorDiaDunamixfy(pedidos: readonly PedidoLeidoDunamixfy[]): VentaDiaDunamixfy[] {
  const filas = new Map<string, VentaDiaDunamixfy>();
  const sumar = (producto: string, dia: string, campo: "salidas" | "devueltas", n: number) => {
    const k = `${producto}|${dia}`;
    const f = filas.get(k) ?? { producto_id: producto, dia, salidas: 0, devueltas: 0 };
    f[campo] += n;
    filas.set(k, f);
  };
  for (const p of pedidos) {
    if (!p.despachado || (p.envio && NO_CUENTA.has(p.envio))) continue;
    const diaSalida = diaCostaRica(p.despachado);
    const devuelto = p.envio === ENVIO_DEVUELTO ? (p.devuelto ?? p.despachado) : null;
    for (const x of p.productos) {
      sumar(x.id, diaSalida, "salidas", x.cantidad);
      if (devuelto) sumar(x.id, diaCostaRica(devuelto), "devueltas", x.cantidad);
    }
  }
  return [...filas.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.producto_id.localeCompare(b.producto_id));
}

export interface VendedorDunamixfy {
  vendedorId: string;
  nombre: string;
  tienda: string | null;
  pedidos: number;
  entregados: number;
  devueltos: number;
  primerPedido: string | null;
  ultimoPedido: string | null;
}

/** Los dropshippers que vendieron nuestros productos, con sus pedidos (los cancelados o anulados no cuentan), del que más pidió al que menos. */
export function vendedoresDePedidos(pedidos: readonly PedidoLeidoDunamixfy[]): VendedorDunamixfy[] {
  const porId = new Map<string, VendedorDunamixfy>();
  for (const p of pedidos) {
    if (!p.vendedor || (p.envio && NO_CUENTA.has(p.envio))) continue;
    const v = porId.get(p.vendedor.id) ?? { vendedorId: p.vendedor.id, nombre: p.vendedor.nombre, tienda: p.vendedor.tienda, pedidos: 0, entregados: 0, devueltos: 0, primerPedido: null, ultimoPedido: null };
    v.pedidos++;
    if (p.envio === ENVIO_ENTREGADO) v.entregados++;
    if (p.envio === ENVIO_DEVUELTO) v.devueltos++;
    if (p.creado) {
      if (!v.primerPedido || p.creado < v.primerPedido) v.primerPedido = p.creado;
      if (!v.ultimoPedido || p.creado > v.ultimoPedido) {
        v.ultimoPedido = p.creado;
        if (p.vendedor.tienda) v.tienda = p.vendedor.tienda;
      }
    }
    porId.set(p.vendedor.id, v);
  }
  return [...porId.values()].sort((a, b) => b.pedidos - a.pedidos || a.nombre.localeCompare(b.nombre));
}

/** Para comparar nombres de productos (sin acentos, mayúsculas ni signos). */
export const nombreComparable = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
