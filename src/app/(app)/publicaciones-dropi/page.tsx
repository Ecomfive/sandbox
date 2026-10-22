import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { getPaisActual } from "@/lib/pais";
import { estadoConexionDropi } from "@/lib/dropi/sesion";
import { fechaHoraLectura } from "@/lib/publicaciones/sincronizar-dropi";
import { BarraConexionDropi } from "./barra-conexion-dropi";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPublicaciones } from "./datos-publicaciones";
import { TablaPublicaciones } from "./tabla-publicaciones";

export const metadata = { title: "Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";
// El asistente de IA (investigar con OpenAI, generar fotos con Gemini) corre como acción de esta página y tarda hasta unos minutos.
export const maxDuration = 300;

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
  const [datos, conexion] = await Promise.all([cargarPublicaciones(supabase, pais.id, usuario), estadoConexionDropi(supabase, pais.id)]);

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
      <ContadorPestana href="/publicaciones-dropi/recomendaciones" cantidad={datos.filas.reduce((n, f) => n + f.recomendaciones.length, 0)} />
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
        tareas={{ personas: datos.personas, yo: usuario.id, conTareas: datos.conTareas }}
        abrirInicial={typeof abrir === "string" ? abrir : null}
        actualizadoDropi={datos.leidoProveedor ? fechaHoraLectura(datos.leidoProveedor) : null}
        barraDropi={
          puedeEscribir ? (
            <BarraConexionDropi
              paisId={pais.id}
              conectada={conexion.conectada}
              hasta={conexion.venceEn ? fechaHoraLectura(conexion.venceEn) : null}
              por={conexion.conectadoPor}
              pendientes={datos.pendientesDropi}
              esAdmin={admin}
            />
          ) : null
        }
      />
    </Pagina>
  );
}
