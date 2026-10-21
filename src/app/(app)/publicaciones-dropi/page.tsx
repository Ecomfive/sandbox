import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { revisionVencida } from "@/lib/publicaciones/publicacion";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaPublicacion } from "./def-publicaciones";
import { TablaPublicaciones } from "./tabla-publicaciones";

export const metadata = { title: "Gestión de publicaciones Dropi" };

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type Fila = Record<string, unknown> & { id: string };

/**
 * Operación › Fulfillment: los productos que ECOMFIVE tiene publicados en Dropi como proveedor (del país de la barra), con su
 * precio, margen, estado de venta, stock, reposición, privatización y revisión. Reemplaza la lista GCC de ClickUp.
 */
export default async function PublicacionesDropiPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [filasR, perfilesR] = await Promise.all([
    traerTodasConError<Fila>((desde, hasta) =>
      supabase
        .from("dropi_publicaciones")
        .select(
          "id, nombre, dropi_id, estado, estado_publicacion, tipo_publicacion, privatizado_a, privatizado_email, precio_venta, costo_mercancia, fulfillment, coste_real, utilidad, margen, estado_venta, ubicacion, estado_reposicion, competencia, fecha_publicacion, ultima_revision, proxima_revision, ultimo_cambio_precio, foto_url, notas, responsable_id, relacionados, clickup_id",
        )
        .eq("pais_id", pais.id)
        .order("nombre")
        .range(desde, hasta),
    ),
    supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre"),
  ]);

  if (filasR.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Gestión de publicaciones Dropi" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las publicaciones. Falta correr en Supabase la migración 0115.
        </p>
      </Pagina>
    );
  }

  const personas = (perfilesR.data ?? []).map((p) => ({ id: p.id as string, nombre: (p.nombre as string | null) || (p.email as string) }));
  const nombrePersona = new Map(personas.map((p) => [p.id, p.nombre]));
  const datos = filasR.data ?? [];
  const nombrePorId = new Map(datos.map((d) => [d.id, d.nombre as string]));
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

  const filas: FilaPublicacion[] = datos.map((d) => {
    const estado = d.estado as string;
    const proxima = (d.proxima_revision as string | null) ?? null;
    return {
      id: d.id,
      nombre: d.nombre as string,
      dropiId: (d.dropi_id as string | null) ?? "",
      estado,
      estadoPublicacion: (d.estado_publicacion as string | null) ?? null,
      tipo: (d.tipo_publicacion as string | null) ?? null,
      privatizadoA: (d.privatizado_a as string | null) ?? "",
      privatizadoEmail: (d.privatizado_email as string | null) ?? "",
      precioVenta: num(d.precio_venta),
      costoMercancia: num(d.costo_mercancia),
      fulfillment: num(d.fulfillment),
      costeReal: num(d.coste_real),
      utilidad: num(d.utilidad),
      margen: num(d.margen),
      estadoVenta: (d.estado_venta as string | null) ?? null,
      ubicacion: (d.ubicacion as string | null) ?? null,
      estadoReposicion: (d.estado_reposicion as string | null) ?? null,
      competencia: (d.competencia as boolean | null) ?? null,
      fechaPublicacion: (d.fecha_publicacion as string | null) ?? null,
      ultimaRevision: (d.ultima_revision as string | null) ?? null,
      proximaRevision: proxima,
      ultimoCambioPrecio: (d.ultimo_cambio_precio as string | null) ?? null,
      revisionVencida: revisionVencida({ estado, proximaRevision: proxima }, hoy),
      fotoUrl: (d.foto_url as string | null) ?? null,
      notas: (d.notas as string | null) ?? "",
      responsableId: (d.responsable_id as string | null) ?? null,
      responsableNombre: d.responsable_id ? (nombrePersona.get(d.responsable_id as string) ?? null) : null,
      relacionados: ((d.relacionados as string[] | null) ?? []).map((r) => nombrePorId.get(r)).filter((x): x is string => !!x),
      deClickup: !!d.clickup_id,
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Gestión de publicaciones Dropi" oculto />
      <TablaPublicaciones publicaciones={filas} personas={personas} paisId={pais.id} codigoPais={pais.codigo} puedeEscribir={!usuario.modulosSoloLectura.includes("publicaciones-dropi")} />
    </Pagina>
  );
}
