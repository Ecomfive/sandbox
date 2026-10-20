/* eslint-disable @next/next/no-img-element -- enlaces firmados de Storage y fotos de Selección */
import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { etiquetaAngulo, etiquetaEstadoLanding, normalizarImagenes, numeroLanding } from "@/lib/landings/landing";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonesCrearLanding, BotonLandingSuelta } from "./botones-crear";

export const metadata = { title: "Generador de landings" };

export const dynamic = "force-dynamic";

const TONO_ESTADO: Record<string, Tone> = { borrador: "neutral", lista: "success", publicada: "info" };
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });

/**
 * Testing Lab › Producción: las landings del país de la barra de arriba y, debajo, los productos de Creación de ofertas (o ya
 * en test) que todavía no tienen landing, para crearla desde cero o tomando otra como modelo.
 */
export default async function GeneradorLandingsPage() {
  const usuario = await requireModulo("generador-landings");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("generador-landings");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [landingsR, productosR] = await Promise.all([
    supabase.from("landings").select("id, numero, nombre, modo, angulo, estado, imagenes, seleccion_id, actualizado_en").eq("pais_id", pais.id).order("actualizado_en", { ascending: false }).limit(500),
    supabase
      .from("wms_seleccion_productos")
      .select("id, numero, nombre, estado, foto_url, codigo_fuente")
      .eq("pais_id", pais.id)
      .in("estado", ["crear_oferta", "en_test"])
      .order("numero", { ascending: false })
      .limit(500),
  ]);

  if (landingsR.error) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Generador de landings" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las landings. Falta correr en Supabase la migración 0113.
        </p>
      </Pagina>
    );
  }

  const landings = landingsR.data ?? [];
  const portadas = landings.map((l) => normalizarImagenes(l.imagenes, l.id).portada.ruta).filter((r): r is string => !!r);
  const { data: firmadas } = portadas.length ? await supabase.storage.from("landings").createSignedUrls(portadas, 60 * 60) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  const conLanding = new Set(landings.map((l) => l.seleccion_id).filter(Boolean));
  const sinLanding = (productosR.data ?? []).filter((p) => !conLanding.has(p.id));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Generador de landings" oculto />

      <section aria-labelledby="titulo-landings" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-landings" className="text-base font-semibold">
            Landings <span className="font-normal text-muted-foreground tabular-nums">({landings.length})</span>
          </h2>
          {puedeEscribir && <BotonLandingSuelta />}
        </div>
        {landings.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {landings.map((l) => {
              const portada = normalizarImagenes(l.imagenes, l.id).portada.ruta;
              const src = portada ? url.get(portada) : null;
              return (
                <li key={l.id}>
                  <Link href={`/generador-landings/${l.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                    <div className="aspect-[16/10] bg-muted">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">Sin portada</div>}</div>
                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {numeroLanding(l.numero)} · {fecha(l.actualizado_en)}
                      </span>
                      <span className="font-medium group-hover:underline">{l.nombre}</span>
                      <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                        <Badge tone={TONO_ESTADO[l.estado] ?? "neutral"}>{etiquetaEstadoLanding(l.estado)}</Badge>
                        <Badge tone="neutral">{l.modo === "clonar" ? "Clonada" : "Desde cero"}</Badge>
                        <Badge tone="neutral">{etiquetaAngulo(l.angulo)}</Badge>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay landings en {pais.nombre}.</p>
        )}
      </section>

      <section aria-labelledby="titulo-sin-landing" className="flex flex-col gap-3">
        <h2 id="titulo-sin-landing" className="text-base font-semibold">
          Productos sin landing <span className="font-normal text-muted-foreground tabular-nums">({sinLanding.length})</span>
        </h2>
        {sinLanding.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {sinLanding.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {p.foto_url ? <img src={p.foto_url} alt="" className="h-11 w-11 rounded-md border border-border object-cover" /> : <span aria-hidden="true" className="h-11 w-11 rounded-md border border-dashed border-border-control" />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    SEL-{String(p.numero).padStart(4, "0")} · {p.codigo_fuente} · {p.estado === "en_test" ? "En test" : "Crear oferta"}
                  </span>
                </div>
                {puedeEscribir && <BotonesCrearLanding seleccionId={p.id} nombre={p.nombre} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{(productosR.data ?? []).length ? "Todos los productos de Creación de ofertas ya tienen landing." : "No hay productos en Creación de ofertas."}</p>
        )}
      </section>
    </Pagina>
  );
}
