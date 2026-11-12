import Link from "next/link";
import type { ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { PERIODOS, type Tienda } from "@/lib/tienda/datos";
import type { FuenteFinanzas } from "@/lib/tienda/datos-finanzas";

/** Arma la dirección de la página con los parámetros dados (los vacíos se quitan). */
export function rutaCon(ruta: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap ${anilloFoco} ${
        activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * La barra de arriba de las páginas de Gestión de tienda: qué tienda se mira (todas las del país o una) y, si la página lo usa, el periodo. Son
 * enlaces: la página se vuelve a cargar con lo elegido en la dirección (`?tienda=` y `?periodo=`).
 */
export function BarraTienda({
  ruta,
  tiendas,
  tiendaId,
  periodo,
  extra = {},
}: {
  ruta: string;
  tiendas: Tienda[];
  tiendaId: string | null;
  /** El periodo elegido; sin él no se muestran los periodos. */
  periodo?: string;
  /** Otros parámetros que se conservan al cambiar de tienda o periodo. */
  extra?: Record<string, string | null | undefined>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Tienda" className="flex flex-wrap gap-2">
        <Chip href={rutaCon(ruta, { ...extra, periodo })} activo={!tiendaId}>
          Todas las tiendas
        </Chip>
        {tiendas.map((t) => (
          <Chip key={t.id} href={rutaCon(ruta, { ...extra, periodo, tienda: t.id })} activo={tiendaId === t.id}>
            {t.nombre}
          </Chip>
        ))}
      </nav>
      {periodo && (
        <nav aria-label="Periodo" className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Chip key={p.id} href={rutaCon(ruta, { ...extra, tienda: tiendaId, periodo: p.id })} activo={periodo === p.id}>
              {p.etiqueta}
            </Chip>
          ))}
        </nav>
      )}
    </div>
  );
}

/**
 * Lo que se dice arriba mientras las tiendas no estén conectadas a Shopify (etapa 2): que la página está lista y vacía, y que la conexión será solo
 * de lectura. Nada si todas las tiendas que se miran ya están conectadas.
 */
export function AvisoConexion({ tiendas, finanzas }: { tiendas: Tienda[]; finanzas?: FuenteFinanzas }) {
  const conFinanzas = tiendas.filter((t) => finanzas?.unidadDe.has(t.id));
  const sinConectar = tiendas.filter((t) => t.estado !== "conectada" && !finanzas?.unidadDe.has(t.id));
  return (
    <>
      {conFinanzas.length > 0 && finanzas?.hasta && <AvisoDatosFinanzas nombres={conFinanzas.map((t) => t.nombre)} hasta={finanzas.hasta} origen={finanzas.origen} />}
      {sinConectar.length > 0 && <AvisoSinConectar sinConectar={sinConectar} />}
    </>
  );
}

/**
 * Las tiendas sin conectar que ya tienen órdenes en Finanzas (11 nov 2026): se ven con esas órdenes, que vienen del Excel de gestión. Es una foto: lo
 * nuevo no llega hasta conectar Shopify o cargar otro Excel, por eso los periodos cuentan hacia atrás desde el último día con órdenes.
 */
function AvisoDatosFinanzas({ nombres, hasta, origen }: { nombres: string[]; hasta: string; origen: string | null }) {
  return (
    <p role="note" className="m-0 rounded-lg border border-primario/30 bg-primario-suave px-4 py-3 text-sm text-foreground">
      <b>
        {nombres.join(", ")} {nombres.length === 1 ? "muestra" : "muestran"} las órdenes que cargó Finanzas{origen ? ` (${origen})` : ""}, hasta el {formatearFecha(hasta)}.
      </b>{" "}
      Es una foto: lo nuevo llega al conectar Shopify o con otro Excel. Los periodos cuentan hacia atrás desde ese día. La zona (Ciudad o Interior) sale de las
      etiquetas de la orden.
    </p>
  );
}

function AvisoSinConectar({ sinConectar }: { sinConectar: Tienda[] }) {
  const nombres = sinConectar.map((t) => t.nombre).join(", ");
  return (
    <p role="note" className="m-0 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-foreground">
      <b>{sinConectar.length === 1 ? `${nombres} todavía no está conectada a Shopify.` : `Todavía no están conectadas a Shopify: ${nombres}.`}</b> La pantalla ya está lista y
      se llena al conectarla. La conexión será <b>solo de lectura</b>: el sistema no cambia nada en Shopify ni en el despacho. Ver{" "}
      <Link href="/tienda-tiendas" className="font-medium text-primario underline underline-offset-2">
        Tiendas
      </Link>
      .
    </p>
  );
}

/** Lo que muestra una página de Gestión de tienda cuando el país elegido no tiene tiendas (por ahora solo Panamá las tiene). */
export function SinTiendas({ pais }: { pais: string }) {
  return (
    <p className="m-0 rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
      {pais} todavía no tiene tiendas en el sistema. Por ahora se trabaja con las de Panamá: elige Panamá en «País», arriba.
    </p>
  );
}

/** Lo que muestra una página de Gestión de tienda si falta correr la migración. */
export function FaltaMigracionTienda() {
  return (
    <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
      Falta correr en Supabase la migración 0224 (Gestión de tienda).
    </p>
  );
}
