import { Pagina } from "@/components/ui/pagina";
import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { AvisoCorrelativo } from "./aviso-correlativo";
import { CancelarRetiroForm } from "./cancelar-retiro-form";
import { CerrarRetiroForm } from "./cerrar-retiro-form";
import { DescargarFicha } from "./descargar-ficha";
import { ConsolidadoToggle } from "../consolidado-toggle";
import { Badge } from "@/components/ui/badge";
import { linkClass } from "@/components/ui/link";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { formatearFecha, formatearFechaHoraCompleta, formatearMoneda } from "@/lib/formato";
import { HistorialIcon } from "@/lib/nav-icons";

export const metadata = { title: "Ficha de retiro" };

export const dynamic = "force-dynamic";

const ESTADO_TONO = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
} as const;

const ESTADO_ETIQUETA: Record<string, string> = {
  abierto: "Abierto",
  cancelado: "Cancelado",
  novedad: "Novedad",
  cerrado: "Cerrado",
};

export default async function RetiroDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ correlativo_cambio?: string }>;
}) {
  await requireModulo("retiros");
  const { id } = await params;
  const { correlativo_cambio } = await searchParams;
  const supabase = createServiceClient();

  // El historial se pide por el id de la dirección, sin esperar al retiro (si no existe, sobra una consulta y ya).
  const [{ data: retiro }, { data: eventos }] = await Promise.all([
    supabase
      .from("retiros")
      .select(
        "id, numero_correlativo, monto, comision, monto_neto, monto_recibido, estado, consolidado, fecha, fecha_cierre, notas, soporte_numero, comprobante_path, pais_id, a_recibir, fecha_limite, estado_dropi, dropi_id, plataformas(nombre), cuentas_retiro(nombre, tipo, detalle), paises(codigo), perfiles(nombre, email)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("retiro_eventos")
      .select("id, evento, creado_en")
      .eq("retiro_id", id)
      .order("creado_en", { ascending: false }),
  ]);

  if (!retiro) notFound();

  const plataforma = retiro.plataformas as unknown as { nombre: string } | null;
  const cuenta = retiro.cuentas_retiro as unknown as { nombre: string; tipo: string; detalle: string | null } | null;
  const codigoPais = (retiro.paises as unknown as { codigo: string } | null)?.codigo ?? "PA";
  const asignado = retiro.perfiles as unknown as { nombre: string | null; email: string } | null;

  let urlComprobante: string | null = null;
  if (retiro.comprobante_path) {
    const { data } = await supabase.storage
      .from("comprobantes-retiro")
      .createSignedUrl(retiro.comprobante_path, 60 * 10);
    urlComprobante = data?.signedUrl ?? null;
  }

  const aRecibir = Number(retiro.a_recibir ?? retiro.monto_neto);
  const diferencia = retiro.monto_recibido !== null ? Number(retiro.monto_recibido) - aRecibir : null;

  return (
    <Pagina ancho="ficha" className="flex flex-col gap-6">
      <div>
        <EtiquetaMiga texto={`Retiro #${String(retiro.numero_correlativo).padStart(4, "0")}`} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Retiro #{String(retiro.numero_correlativo).padStart(4, "0")}
          </h1>
          <Badge tone={ESTADO_TONO[retiro.estado as keyof typeof ESTADO_TONO]}>
            {ESTADO_ETIQUETA[retiro.estado] ?? retiro.estado}
          </Badge>
          <ConsolidadoToggle id={retiro.id} consolidado={retiro.consolidado} />
          <div className="ml-auto">
            <DescargarFicha retiroId={retiro.id} />
          </div>
        </div>
      </div>

      <AvisoCorrelativo pedido={correlativo_cambio} actual={Number(retiro.numero_correlativo)} />

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 text-sm">
        <div>
          <p className="text-muted-foreground">Plataforma</p>
          <p className="font-medium">{plataforma?.nombre ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Destino</p>
          <p className="font-medium">{cuenta?.nombre ?? "—"}</p>
          {cuenta?.detalle && <p className="text-xs text-muted-foreground">{cuenta.detalle}</p>}
        </div>
        <div>
          <p className="text-muted-foreground">Monto del retiro</p>
          <p className="font-medium tabular-nums">{formatearMoneda(Number(retiro.monto), codigoPais)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Comisión</p>
          <p className="font-medium tabular-nums">{formatearMoneda(Number(retiro.comision), codigoPais)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">A recibir</p>
          <p className="font-medium tabular-nums">{formatearMoneda(aRecibir, codigoPais)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Fecha de creación</p>
          <p className="font-medium">{formatearFecha(retiro.fecha)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Persona asignada</p>
          <p className="font-medium">{asignado?.nombre || asignado?.email || "Sin asignar"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Fecha límite</p>
          <p className="font-medium">{retiro.fecha_limite ? formatearFecha(retiro.fecha_limite) : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Estado en Dropi</p>
          {retiro.estado_dropi ? (
            <>
              <Badge tone={TONO_ESTADO_DROPI[retiro.estado_dropi as EstadoDropi]}>
                {ETIQUETA_ESTADO_DROPI[retiro.estado_dropi as EstadoDropi]}
              </Badge>
              {retiro.dropi_id !== null && <p className="mt-1 text-xs text-muted-foreground">Dropi #{retiro.dropi_id}</p>}
            </>
          ) : (
            <p className="font-medium">Sin vincular</p>
          )}
        </div>
        {retiro.notas && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Notas</p>
            <p className="font-medium">{retiro.notas}</p>
          </div>
        )}
      </div>

      {retiro.monto_recibido !== null && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            {retiro.estado === "novedad" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
            Cierre
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">Monto recibido</p>
              <p className="font-medium tabular-nums">{formatearMoneda(Number(retiro.monto_recibido), codigoPais)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Diferencia</p>
              <p className={`font-medium tabular-nums ${retiro.estado === "novedad" ? "text-destructive" : ""}`}>
                {diferencia !== null ? formatearMoneda(diferencia, codigoPais) : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Soporte bancario</p>
              <p className="font-medium">{retiro.soporte_numero || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de cierre</p>
              <p className="font-medium">{retiro.fecha_cierre ? formatearFecha(retiro.fecha_cierre) : "—"}</p>
            </div>
            {urlComprobante && (
              <div className="col-span-2">
                <a href={urlComprobante} target="_blank" rel="noreferrer" className={linkClass}>
                  Ver comprobante
                </a>
              </div>
            )}
          </div>
          {retiro.estado === "novedad" && (
            <p className="mt-3 text-sm text-destructive">
              La diferencia supera los $3.00 permitidos — revisa el comprobante o corrige el monto recibido abajo.
            </p>
          )}
        </div>
      )}

      {(retiro.estado === "abierto" || retiro.estado === "novedad") && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold tracking-tight">Consolidar</h2>
          <CerrarRetiroForm
            retiroId={retiro.id}
            paisId={retiro.pais_id}
            codigoPais={codigoPais}
            soporteActual={retiro.soporte_numero}
            montoRecibidoActual={retiro.monto_recibido}
          />

          <CancelarRetiroForm retiroId={retiro.id} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            <HistorialIcon className="h-4 w-4" />
            Historial
          </h2>
          <span className="text-xs text-muted-foreground">del más nuevo al más viejo</span>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          {(eventos ?? []).map((e) => (
            <div key={e.id} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <div>
                <p>{e.evento}</p>
                <p className="text-xs text-muted-foreground">{formatearFechaHoraCompleta(e.creado_en, codigoPais)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Pagina>
  );
}
