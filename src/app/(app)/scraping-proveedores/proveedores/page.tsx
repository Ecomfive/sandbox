import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModulo } from "@/lib/auth";
import { puedeActualizarDropi } from "@/lib/dropi-actualizar/partes";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarScraping } from "../datos-scraping";
import { DescubrirProveedores, type LecturaDescubrir, type ProveedorDescubiertoVista } from "./descubrir";
import { VistaProveedores, type ResumenProveedor } from "./vista-proveedores";

export const metadata = { title: "Proveedores referentes" };

export const dynamic = "force-dynamic";
// Resumir el catálogo de un país (acción de esta página) puede tardar un poco.
export const maxDuration = 120;

/** La última lectura del catálogo de México (migración 0157) y sus proveedores, de más a menos interesantes. Sin la migración, nada. */
async function cargarDescubrir(supabase: SupabaseClient, seguidos: Set<number>): Promise<{ lectura: LecturaDescubrir | null; proveedores: ProveedorDescubiertoVista[] }> {
  const { data: l, error } = await supabase.from("scraping_descubrir_lecturas").select("id, estado, productos, proveedores, con_anterior, error, inicio, fin").eq("pais", "mx").order("inicio", { ascending: false }).limit(1).maybeSingle();
  if (error || !l) return { lectura: null, proveedores: [] };
  const lectura: LecturaDescubrir = { estado: l.estado, productos: l.productos, proveedores: l.proveedores, conAnterior: l.con_anterior, error: l.error, inicio: l.inicio, fin: l.fin };
  // Los proveedores salen de la última lectura terminada (la de ahora puede estar corriendo o haber fallado).
  const { data: lista } = await supabase.from("scraping_descubrir_lecturas").select("id").eq("pais", "mx").eq("estado", "lista").order("inicio", { ascending: false }).limit(1).maybeSingle();
  if (!lista) return { lectura, proveedores: [] };
  const { data } = await supabase
    .from("scraping_descubrir_proveedores")
    .select("dropi_proveedor_id, nombre, productos, nuevos_30, stock, ventas_estimadas, con_ventas, destacados")
    .eq("lectura_id", lista.id)
    .order("ventas_estimadas", { ascending: false, nullsFirst: false })
    .order("nuevos_30", { ascending: false })
    .order("productos", { ascending: false })
    .limit(300);
  return {
    lectura,
    proveedores: (data ?? []).map((p) => ({
      dropiId: Number(p.dropi_proveedor_id),
      nombre: p.nombre as string,
      productos: p.productos as number,
      nuevos30: p.nuevos_30 as number,
      stock: Number(p.stock),
      ventas: p.ventas_estimadas === null ? null : Number(p.ventas_estimadas),
      conVentas: p.con_ventas as number,
      destacados: (p.destacados as ProveedorDescubiertoVista["destacados"]) ?? [],
      seguido: seguidos.has(Number(p.dropi_proveedor_id)),
    })),
  };
}

/** Scraping de proveedores › Proveedores: los referentes que se siguen cada día, de cualquier país, con sus cifras. */
export default async function Page() {
  const usuario = await requireModulo("scraping-proveedores");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("scraping-proveedores");
  const supabase = createServiceClient();
  const datos = await cargarScraping(supabase);
  if (!datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Proveedores referentes" oculto />
        <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Falta correr la migración 0105 (Scraping de proveedores) en Supabase.</p>
      </Pagina>
    );
  }
  const resumen: ResumenProveedor[] = datos.proveedores.map((p) => {
    const suyos = datos.filas.filter((f) => f.proveedorId === p.id);
    const regs = datos.registros.filter((r) => r.proveedorId === p.id);
    return {
      ...p,
      productos: suyos.filter((f) => f.estado !== "desaparecido").length,
      nuevos: suyos.filter((f) => f.nuevo).length,
      ventas30: suyos.reduce((a, f) => a + f.ventas30, 0),
      paraTestear: suyos.filter((f) => f.recomendacion === "testear").length,
      registros: regs.slice(-30).reverse(),
      busqueda: datos.busquedas.find((b) => b.proveedorId === p.id) ?? null,
    };
  });
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Proveedores referentes" oculto />
      <VistaProveedores proveedores={resumen} puedeEscribir={puedeEscribir} />
      <DescubrirProveedores
        {...(await cargarDescubrir(supabase, new Set(datos.proveedores.filter((p) => p.pais === "mx" && p.dropiId).map((p) => Number(p.dropiId)))))}
        puedeLeer={puedeEscribir && puedeActualizarDropi(usuario)}
        puedeSeguir={puedeEscribir}
      />
    </Pagina>
  );
}
