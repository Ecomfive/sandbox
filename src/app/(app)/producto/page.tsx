import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { puedeVerPais } from "@/lib/paises-permitidos";
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
  codigo_barras: string | null;
  codigo_barras_origen: string | null;
  maneja_vencimiento: boolean;
  dias_aviso_vencimiento: number | null;
  es_fisico: boolean;
  embalaje: string | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  unidad_medida: string;
  peso: number | null;
  unidad_peso: string;
  pais_origen: string | null;
  codigo_sa: string | null;
  creado_en: string;
  padre_id: string | null;
  opciones: Record<string, string> | null;
  opciones_variantes: { nombre: string; valores: string[] }[] | null;
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
    .select("id, codigo, nombre, tipo, clase, codigo_barras, codigo_barras_origen, maneja_vencimiento, dias_aviso_vencimiento, es_fisico, embalaje, largo, ancho, alto, unidad_medida, peso, unidad_peso, pais_origen, codigo_sa, creado_en, padre_id, opciones, opciones_variantes")
    .order("creado_en", { ascending: false });
  const lista: ProductoBd[] = productos ?? [];

  // Los componentes de cada compuesto y lo enlazado a cada producto. Se trae lo que tiene enlace (no un `in` con todos los
  // ids: la dirección sería enorme).
  const [componentesFilas, variantes, dropi, enPedidos, fotos, numeros, lineasCompra] = await Promise.all([
    supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad, componente:componente_id(codigo)"),
    supabase
      .from("wms_producto_variantes")
      .select("sku_maestro_id, opciones, wms_productos(id, titulo, estado, paises(codigo))")
      .not("sku_maestro_id", "is", null),
    supabase.from("wms_dropi_productos").select("sku_maestro_id, nombre, publicacion, archivado, paises(codigo)").not("sku_maestro_id", "is", null),
    supabase.from("productos").select("sku_maestro_id, nombre, paises(codigo)").not("sku_maestro_id", "is", null),
    // La foto va aparte: sin la migración 0086 la columna no existe y la lista se carga igual, sin fotos.
    supabase.from("skus_maestros").select("id, foto_url").not("foto_url", "is", null),
    // El N.º correlativo va aparte: sin la migración 0089 la columna no existe y la lista se carga igual.
    supabase.from("skus_maestros").select("id, numero"),
    traerTodasLasFilas<{ sku_maestro_id: string; compra_id: string; cantidad_pedida: number; wms_compras: unknown }>((desde, hasta) =>
      supabase.from("wms_compra_items").select("sku_maestro_id, compra_id, cantidad_pedida, wms_compras(numero, creado_en, anulada_en, paises(codigo))").order("id").range(desde, hasta),
    ),
  ]);
  const numeroPorId = new Map(numeros.error ? [] : ((numeros.data ?? []) as { id: string; numero: number }[]).map((n) => [n.id, Number(n.numero)]));
  const fotoPorId = new Map(((fotos.data ?? []) as { id: string; foto_url: string }[]).map((f) => [f.id, f.foto_url]));
  // Unidades compradas por producto (las líneas vinculadas en Compras); un producto con variantes suma las de sus variantes.
  const padreDe = new Map(lista.filter((p) => p.padre_id).map((p) => [p.id as string, p.padre_id as string]));
  const compradoPorId = new Map<string, number>();
  // En qué órdenes está cada producto y la última (por su fecha de creación), para la tarjeta de la lista.
  const ordenesPorId = new Map<string, Map<string, { numero: number; fecha: string }>>();
  for (const l of lineasCompra) {
    // Solo lo comprado en los países que la persona puede ver (migración 0087).
    const compra = (Array.isArray(l.wms_compras) ? l.wms_compras[0] : l.wms_compras) as { numero: number; creado_en: string; anulada_en: string | null; paises: { codigo: string } | { codigo: string }[] | null } | null;
    // Una compra anulada no cuenta.
    if (compra?.anulada_en) continue;
    const paisCompra = compra ? ((Array.isArray(compra.paises) ? compra.paises[0] : compra.paises)?.codigo ?? null) : null;
    if (!puedeVerPais(usuario.paisesPermitidos, paisCompra)) continue;
    const n = Number(l.cantidad_pedida);
    const padre = padreDe.get(l.sku_maestro_id);
    for (const id of padre ? [l.sku_maestro_id, padre] : [l.sku_maestro_id]) {
      compradoPorId.set(id, (compradoPorId.get(id) ?? 0) + n);
      if (compra) {
        const m = ordenesPorId.get(id) ?? new Map<string, { numero: number; fecha: string }>();
        m.set(l.compra_id, { numero: Number(compra.numero), fecha: compra.creado_en });
        ordenesPorId.set(id, m);
      }
    }
  }
  const comprasDe = (id: string): FilaProducto["compras"] => {
    const ordenes = [...(ordenesPorId.get(id)?.values() ?? [])];
    const ultima = ordenes.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    return { ordenes: ordenes.length, ultima: ultima ? { oc: `OC-${String(ultima.numero).padStart(4, "0")}`, fecha: ultima.fecha.slice(0, 10) } : null };
  };

  const componentesPorCombo = new Map<string, string[]>();
  const listaPorCombo = new Map<string, FilaProducto["listaComponentes"]>();
  const nombrePorId = new Map(lista.map((p) => [p.id as string, p.nombre as string]));
  for (const fila of componentesFilas.data ?? []) {
    const componente = unoDe(fila.componente as unknown as { codigo: string } | { codigo: string }[] | null);
    if (!componente) continue;
    componentesPorCombo.set(fila.combo_id, [...(componentesPorCombo.get(fila.combo_id) ?? []), `${fila.cantidad}× ${componente.codigo}`]);
    const idComponente = fila.componente_id as string;
    listaPorCombo.set(fila.combo_id, [
      ...(listaPorCombo.get(fila.combo_id) ?? []),
      { id: idComponente, codigo: componente.codigo, nombre: nombrePorId.get(idComponente) ?? componente.codigo, foto: null, cantidad: Number(fila.cantidad) },
    ]);
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

  // Las variantes de cada producto y el padre de cada variante.
  const porId = new Map(lista.map((p) => [p.id as string, p]));
  const variantesPorPadre = new Map<string, FilaProducto["variantes"]>();
  for (const p of lista) {
    if (!p.padre_id) continue;
    const v = { id: p.id as string, codigo: p.codigo as string, nombre: p.nombre as string, opciones: (p.opciones ?? {}) as Record<string, string> };
    variantesPorPadre.set(p.padre_id, [...(variantesPorPadre.get(p.padre_id) ?? []), v]);
  }

  const filas: FilaProducto[] = lista.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    tipo: p.tipo,
    clase: p.clase,
    codigoBarras: p.codigo_barras,
    codigoBarrasOrigen: p.codigo_barras_origen,
    manejaVencimiento: p.maneja_vencimiento,
    diasAvisoVencimiento: p.dias_aviso_vencimiento,
    envio: {
      esFisico: p.es_fisico,
      embalaje: p.embalaje,
      largo: p.largo === null ? null : Number(p.largo),
      ancho: p.ancho === null ? null : Number(p.ancho),
      alto: p.alto === null ? null : Number(p.alto),
      unidadMedida: p.unidad_medida,
      peso: p.peso === null ? null : Number(p.peso),
      unidadPeso: p.unidad_peso,
      paisOrigen: p.pais_origen,
      codigoSa: p.codigo_sa,
    },
    numero: numeroPorId.get(p.id) ?? null,
    foto: fotoPorId.get(p.id) ?? null,
    unidadesCompradas: compradoPorId.get(p.id) ?? 0,
    componentes: p.tipo === "combo" ? (componentesPorCombo.get(p.id) ?? []).join(", ") : "",
    listaComponentes: p.tipo === "combo" ? (listaPorCombo.get(p.id) ?? []).map((c) => ({ ...c, foto: fotoPorId.get(c.id) ?? null })) : [],
    compras: comprasDe(p.id),
    creado: p.creado_en.slice(0, 10),
    asociaciones: asociacionesPorSku.get(p.id) ?? [],
    padre: p.padre_id && porId.get(p.padre_id) ? { id: p.padre_id, codigo: porId.get(p.padre_id)!.codigo, nombre: porId.get(p.padre_id)!.nombre } : null,
    opciones: (p.opciones ?? null) as Record<string, string> | null,
    opcionesVariantes: (p.opciones_variantes ?? []) as { nombre: string; valores: string[] }[],
    variantes: (variantesPorPadre.get(p.id) ?? []).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })),
  }));

  const conteo = { fisico: 0, test: 0 };
  for (const p of lista) conteo[p.clase === "test" ? "test" : "fisico"]++;
  // Un compuesto se arma con productos simples y variantes, nunca con un producto que tiene variantes (no lleva stock:
  // al vender el compuesto se descuenta la variante elegida).
  const opcionesSimples = lista
    .filter((p) => p.tipo === "simple" && !variantesPorPadre.has(p.id))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
    .map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.clase, numero: numeroPorId.get(p.id) ?? null, foto: fotoPorId.get(p.id) ?? null }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Producto" oculto />

      <KpiGroup titulo="Productos">
        <TarjetasClase conteo={conteo} />
      </KpiGroup>

      <TablaProducto
        productos={[...filas].sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0))}
        opcionesSimples={opcionesSimples}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("producto")}
      />
    </Pagina>
  );
}
