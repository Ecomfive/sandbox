import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { KpiGroup } from "@/components/ui/kpi-card";
import type { Asociacion, FilaProducto } from "./def-producto";
import { TablaProducto } from "./tabla-producto";
import { TarjetasClase } from "./tarjetas-clase";

export const metadata = { title: "Producto" };

export const dynamic = "force-dynamic";

interface ProductoBd {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  clase: string;
  creado_en: string;
}

const unoDe = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Producto: aquí se crea todo lo que se vende. Un producto es simple o compuesto (una combinación de simples: al venderlo se
 * descuenta cada componente) y físico o test (se está probando, todavía no se compra y no tiene stock). Su SKU es la llave
 * con la que una venta de Dropi o de Shopify lo encuentra. Todos se ven en Inventario.
 */
export default async function ProductoPage() {
  const usuario = await requireModulo("producto");
  const supabase = createServiceClient();
  // El producto es igual para todos los países; el país solo da formato a las fechas de su actividad.
  const pais = await getPaisActual(supabase);

  const { data: productos } = await supabase
    .from("skus_maestros")
    .select("id, codigo, nombre, tipo, clase, creado_en")
    .order("creado_en", { ascending: false });
  const lista: ProductoBd[] = productos ?? [];

  // Los componentes de cada compuesto y lo enlazado a cada producto. Se trae lo que tiene enlace (no un `in` con todos los
  // ids: la dirección sería enorme).
  const [componentesFilas, variantes, dropi, enPedidos] = await Promise.all([
    supabase.from("sku_maestro_componentes").select("combo_id, cantidad, componente:componente_id(codigo)"),
    supabase
      .from("wms_producto_variantes")
      .select("sku_maestro_id, opciones, wms_productos(id, titulo, estado, paises(codigo))")
      .not("sku_maestro_id", "is", null),
    supabase.from("wms_dropi_productos").select("sku_maestro_id, nombre, publicacion, archivado, paises(codigo)").not("sku_maestro_id", "is", null),
    supabase.from("productos").select("sku_maestro_id, nombre, paises(codigo)").not("sku_maestro_id", "is", null),
  ]);

  const componentesPorCombo = new Map<string, string[]>();
  for (const fila of componentesFilas.data ?? []) {
    const componente = unoDe(fila.componente as unknown as { codigo: string } | { codigo: string }[] | null);
    if (!componente) continue;
    componentesPorCombo.set(fila.combo_id, [...(componentesPorCombo.get(fila.combo_id) ?? []), `${fila.cantidad}× ${componente.codigo}`]);
  }

  const asociacionesPorSku = new Map<string, Asociacion[]>();
  const agregar = (id: string, a: Asociacion) => asociacionesPorSku.set(id, [...(asociacionesPorSku.get(id) ?? []), a]);
  for (const v of variantes.data ?? []) {
    const p = unoDe(v.wms_productos as unknown as { id: string; titulo: string; estado: string; paises: { codigo: string } | { codigo: string }[] | null } | null);
    if (!p) continue;
    const opciones = Object.values((v.opciones ?? {}) as Record<string, string>).join(" / ");
    agregar(v.sku_maestro_id as string, {
      tipo: "shopify",
      nombre: opciones ? `${p.titulo} (${opciones})` : p.titulo,
      detalle: `${unoDe(p.paises)?.codigo ?? "—"} · ${p.estado}`,
      href: `/wms-productos/${p.id}`,
    });
  }
  for (const p of dropi.data ?? []) {
    agregar(p.sku_maestro_id as string, {
      tipo: "dropi",
      nombre: p.nombre as string,
      detalle: `${unoDe(p.paises as unknown as { codigo: string } | { codigo: string }[] | null)?.codigo ?? "—"} · ${p.archivado ? "archivado" : p.publicacion}`,
      href: "/wms-productos-dropi",
    });
  }
  for (const p of enPedidos.data ?? []) {
    agregar(p.sku_maestro_id as string, {
      tipo: "pedidos",
      nombre: p.nombre as string,
      detalle: unoDe(p.paises as unknown as { codigo: string } | { codigo: string }[] | null)?.codigo ?? "—",
      href: null,
    });
  }

  const filas: FilaProducto[] = lista.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    tipo: p.tipo,
    clase: p.clase,
    componentes: p.tipo === "combo" ? (componentesPorCombo.get(p.id) ?? []).join(", ") : "",
    creado: p.creado_en.slice(0, 10),
    asociaciones: asociacionesPorSku.get(p.id) ?? [],
  }));

  const conteo = { fisico: 0, test: 0 };
  for (const p of lista) conteo[p.clase === "test" ? "test" : "fisico"]++;
  const opcionesSimples = lista
    .filter((p) => p.tipo === "simple")
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
    .map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Producto" oculto />

      <KpiGroup titulo="Productos">
        <TarjetasClase conteo={conteo} />
      </KpiGroup>

      <TablaProducto
        productos={filas}
        opcionesSimples={opcionesSimples}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("producto")}
      />
    </Pagina>
  );
}
