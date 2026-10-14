import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { FilaScraping, Movimiento } from "./def-scraping";
import { VistaScraping, type BusquedaResumen, type ProveedorResumen, type Registro } from "./vista-scraping";

export const metadata = { title: "Scraping de proveedores" };

export const dynamic = "force-dynamic";

const DIAS_SERIE = 28;

interface FilaProducto {
  id: string;
  dropi_producto_id: number;
  sku: string | null;
  nombre: string;
  foto_url: string | null;
  privado: boolean;
  precio: string | null;
  precio_sugerido: string | null;
  stock: number | null;
  categoria: string | null;
  estado: "activo" | "desaparecido";
  motivo_desaparicion: "agotado" | "privatizado" | "desconocido" | null;
  vinculado_a: string | null;
  vinculo_parecido: string | null;
  vinculo_seguro: boolean;
  primera_vez: string;
  ultima_vez: string;
  creado_en_dropi: string | null;
}

interface FilaHistorial {
  producto_id: string;
  busqueda_id: string | null;
  fecha: string;
  evento: string;
  precio: string | null;
  stock: number | null;
  precio_antes: string | null;
  stock_antes: number | null;
}

const n = (v: string | null) => (v === null ? null : Number(v));

export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const usuario = await requireModulo("scraping-proveedores");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("scraping-proveedores");
  const { p } = await searchParams;
  const supabase = createServiceClient();

  const [provs, regs, busq] = await Promise.all([
    supabase.from("scraping_proveedores").select("id, nombre, pais, dropi_url, dropi_id").eq("activo", true).order("creado_en"),
    supabase.from("scraping_proveedor_registros").select("proveedor_id, fecha, ordenes, productos, dropshippers, origen").order("fecha"),
    supabase.from("scraping_busquedas").select("id, proveedor_id, inicio, fin, estado, productos_vistos, nuevos, desaparecidos, duracion_ms").order("inicio", { ascending: false }).limit(500),
  ]);

  if (provs.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Scraping de proveedores" oculto />
        <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Falta correr la migración 0105 (Scraping de proveedores) en Supabase.
        </p>
      </Pagina>
    );
  }

  const registros: Registro[] = (regs.data ?? []).map((r) => ({ proveedorId: r.proveedor_id, fecha: r.fecha, ordenes: r.ordenes, productos: r.productos, dropshippers: r.dropshippers, origen: r.origen }));
  const busquedas: BusquedaResumen[] = (busq.data ?? []).map((b) => ({
    id: b.id,
    proveedorId: b.proveedor_id,
    inicio: b.inicio,
    fin: b.fin,
    estado: b.estado,
    vistos: b.productos_vistos,
    nuevos: b.nuevos,
    desaparecidos: b.desaparecidos,
    duracionMs: b.duracion_ms,
  }));
  const proveedores: ProveedorResumen[] = (provs.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, pais: x.pais, url: x.dropi_url, dropiId: x.dropi_id }));
  const elegido = proveedores.find((x) => x.id === p) ?? proveedores[0] ?? null;

  let filas: FilaScraping[] = [];
  if (elegido) {
    const desde = new Date(Date.now() - DIAS_SERIE * 86_400_000).toISOString();
    const [prods, hist] = await Promise.all([
      traerTodasConError<FilaProducto>((a, b) =>
        supabase
          .from("scraping_productos")
          .select("id, dropi_producto_id, sku, nombre, foto_url, privado, precio, precio_sugerido, stock, categoria, estado, motivo_desaparicion, vinculado_a, vinculo_parecido, vinculo_seguro, primera_vez, ultima_vez, creado_en_dropi")
          .eq("proveedor_id", elegido.id)
          .order("creado_en_dropi", { ascending: false, nullsFirst: false })
          .order("id")
          .range(a, b),
      ),
      traerTodasConError<FilaHistorial>((a, b) =>
        supabase
          .from("scraping_producto_historial")
          .select("producto_id, busqueda_id, fecha, evento, precio, stock, precio_antes, stock_antes, scraping_productos!inner(proveedor_id)")
          .eq("scraping_productos.proveedor_id", elegido.id)
          .in("evento", ["primera_vez", "stock", "precio"])
          .gte("fecha", desde)
          .order("fecha")
          .order("id")
          .range(a, b),
      ),
    ]);

    // La última búsqueda terminada: sus eventos dicen qué subió, bajó o cambió de precio «desde la búsqueda anterior».
    const ultima = busquedas.find((b) => b.proveedorId === elegido.id && b.estado === "lista")?.id ?? null;
    const serie = new Map<string, number[]>();
    const ultimos = new Map<string, FilaHistorial[]>();
    for (const h of hist.data ?? []) {
      if ((h.evento === "primera_vez" || h.evento === "stock") && h.stock !== null) {
        const s = serie.get(h.producto_id) ?? [];
        // Antes de la primera búsqueda del periodo, el stock era el de «antes» del primer cambio.
        if (!s.length && h.evento === "stock" && h.stock_antes !== null) s.push(h.stock_antes);
        s.push(h.stock);
        serie.set(h.producto_id, s);
      }
      if (ultima && h.busqueda_id === ultima) ultimos.set(h.producto_id, [...(ultimos.get(h.producto_id) ?? []), h]);
    }
    const datos = prods.data ?? [];
    const nombrePorId = new Map(datos.map((d) => [d.id, d.nombre]));
    filas = datos.map((d) => {
      const evs = ultimos.get(d.id) ?? [];
      const st = evs.find((e) => e.evento === "stock");
      const pr = evs.find((e) => e.evento === "precio");
      const movimientos: Movimiento[] = [];
      if (d.estado === "activo") {
        if (st && st.stock !== null && st.stock_antes !== null) movimientos.push(st.stock > st.stock_antes ? "subio" : "bajo");
        if (pr) movimientos.push("precio");
        if (evs.some((e) => e.evento === "primera_vez")) movimientos.push("nuevo");
      }
      return {
        id: d.id,
        dropiId: Number(d.dropi_producto_id),
        sku: d.sku,
        nombre: d.nombre,
        foto: d.foto_url,
        categoria: d.categoria,
        precio: n(d.precio),
        precioAntes: pr ? n(pr.precio_antes) : null,
        precioSugerido: n(d.precio_sugerido),
        stock: d.stock,
        stockAntes: st ? st.stock_antes : null,
        estado: d.estado === "desaparecido" ? "desaparecido" : d.privado ? "privado" : "activo",
        motivo: d.motivo_desaparicion,
        movimientos,
        vinculo: d.vinculado_a ? { nombre: nombrePorId.get(d.vinculado_a) ?? "", parecido: Number(d.vinculo_parecido ?? 0), seguro: d.vinculo_seguro } : null,
        ultimaVez: d.ultima_vez,
        primeraVez: d.primera_vez,
        creadoEnDropi: d.creado_en_dropi,
        serie: serie.get(d.id) ?? (d.stock !== null ? [d.stock] : []),
      };
    });
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Scraping de proveedores" oculto />
      <VistaScraping proveedores={proveedores} elegidoId={elegido?.id ?? null} registros={registros} busquedas={busquedas} filas={filas} puedeEscribir={puedeEscribir} />
    </Pagina>
  );
}
