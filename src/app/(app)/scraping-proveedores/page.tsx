import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { puedeActualizarDropi } from "@/lib/dropi-actualizar/partes";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarScraping } from "./datos-scraping";
import { VistaScraping } from "./lista-scraping";

export const metadata = { title: "Scraping de proveedores" };

export const dynamic = "force-dynamic";

/**
 * Testing Lab › Scraping de proveedores: lo que venden y testean los proveedores referentes de otros países (México, Colombia,
 * Ecuador…), todos en una lista con la recomendación de qué testear. Los proveedores, en /scraping-proveedores/proveedores.
 */
export default async function Page() {
  const usuario = await requireModulo("scraping-proveedores");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("scraping-proveedores");
  const datos = await cargarScraping(createServiceClient());
  if (!datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Scraping de proveedores" oculto />
        <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Falta correr la migración 0105 (Scraping de proveedores) en Supabase.</p>
      </Pagina>
    );
  }
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Scraping de proveedores" oculto />
      <VistaScraping
        filas={datos.filas}
        proveedores={datos.proveedores.length}
        puedeEscribir={puedeEscribir}
        puedeEnviar={usuario.modulos.includes("seleccion-productos") && !usuario.modulosSoloLectura.includes("seleccion-productos")}
        puedeActualizar={puedeActualizarDropi(usuario)}
      />
    </Pagina>
  );
}
