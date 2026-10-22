import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPublicaciones } from "./datos-publicaciones";
import { TablaPublicaciones } from "./tabla-publicaciones";

export const metadata = { title: "Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/**
 * Operación › Fulfillment: los productos que ECOMFIVE tiene publicados en Dropi como proveedor (del país de la barra), con su
 * precio, margen, ventas, stock, privatización y lo que necesita cada uno. Reemplaza la lista GCC de ClickUp.
 */
export default async function PublicacionesDropiPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("publicaciones-dropi");
  // Desde la ficha de un producto (Asociaciones) se llega con `?abrir=<publicación>`: la abre al cargar.
  const { abrir } = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("publicaciones-dropi");
  // Eliminar publicaciones: solo un administrador. Las ventas de Dropi (últimos 30 días) las ve todo el que abre el módulo.
  const admin = esAdministrador(usuario);
  const datos = await cargarPublicaciones(supabase, pais.id);

  if (!datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Gestión de IDs Dropi" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las publicaciones. Falta correr en Supabase la migración 0116.
        </p>
      </Pagina>
    );
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Gestión de IDs Dropi" oculto />
      <TablaPublicaciones
        publicaciones={datos.filas}
        opcionesSku={datos.opcionesSku}
        paisId={pais.id}
        codigoPais={pais.codigo}
        nombrePais={pais.nombre}
        puedeEscribir={puedeEscribir}
        puedeEliminar={puedeEscribir && admin}
        corteVentas={datos.corteVentas}
        reglas={datos.reglas.reglas}
        decisionesDisponibles={datos.reglas.disponible}
        abrirInicial={typeof abrir === "string" ? abrir : null}
      />
    </Pagina>
  );
}
