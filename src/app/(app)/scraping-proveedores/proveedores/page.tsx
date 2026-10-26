import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarScraping } from "../datos-scraping";
import { VistaProveedores, type ResumenProveedor } from "./vista-proveedores";

export const metadata = { title: "Proveedores referentes" };

export const dynamic = "force-dynamic";

/** Scraping de proveedores › Proveedores: los referentes que se siguen cada día, de cualquier país, con sus cifras. */
export default async function Page() {
  const usuario = await requireModulo("scraping-proveedores");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("scraping-proveedores");
  const datos = await cargarScraping(createServiceClient());
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
    </Pagina>
  );
}
