import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { numero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { UUID } from "@/lib/deliverys/guardar";
import { ETIQUETA_METODO, METODOS_PAGO } from "@/lib/deliverys/liquidacion";
import { fechaRecibo, montoEnLetras, numeroRecibo, parrafosRecibo, type DatosRecibo } from "@/lib/deliverys/recibo";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonImprimir } from "./boton-imprimir";

export const metadata = { title: "Recibo de delivery" };

export const dynamic = "force-dynamic";

// Al imprimir solo sale el recibo, en una hoja carta: el menú, la barra, las migas y la cabecera de la página se esconden,
// y los colores son fijos (tinta negra sobre papel blanco, aunque la pantalla esté en tema oscuro). El recibo no se parte
// entre dos hojas.
const ESTILO_IMPRESION = `
@page { size: letter; margin: 16mm 18mm; }
@media print {
  body * { visibility: hidden !important; }
  #recibo-delivery, #recibo-delivery * { visibility: visible !important; }
  #recibo-delivery { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0; padding: 0 !important; border: 0 !important;
    box-shadow: none !important; background: #fff !important; color: #000 !important; break-inside: avoid; font-size: 12pt; }
  #recibo-delivery .recibo-suave { color: #333 !important; }
  #recibo-delivery .recibo-borde { border-color: #8a8a8a !important; }
  #recibo-delivery .recibo-marca { border-color: #000 !important; }
  #recibo-delivery .recibo-firmas { grid-template-columns: 1fr 1fr !important; }
}`;

/** La casilla de una forma de pago, dibujada (no un carácter): marcada con un visto la que se usó. */
function Casilla({ marcada, etiqueta }: { marcada: boolean; etiqueta: string }) {
  return (
    <li className="flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="recibo-marca flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-foreground">
        {marcada && (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        )}
      </span>
      <span>
        {etiqueta}
        {marcada && <span className="sr-only"> (forma de pago usada)</span>}
      </span>
    </li>
  );
}

/** Una línea de firma con el nombre y el documento debajo. */
function Firma({ titulo, nombre, detalle }: { titulo: string; nombre?: string; detalle?: string | null }) {
  return (
    <div className="flex flex-col">
      <div className="h-16" aria-hidden="true" />
      <div className="recibo-borde border-t border-border-control pt-2">
        <p className="text-sm font-medium">{titulo}</p>
        {nombre && <p className="text-sm">{nombre}</p>}
        {detalle && <p className="recibo-suave text-xs text-muted-foreground tabular-nums">{detalle}</p>}
      </div>
    </div>
  );
}

/** El recibo de un cierre pagado, listo para imprimir y firmar (el mismo texto que la hoja «RECIBOS DE PAGOS»). */
export default async function ReciboDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("deliverys");
  const { id } = await params;
  const vacio = (titulo: string, detalle?: string) => (
    <Pagina ancho="ficha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Recibo de delivery" imprimir={false} />
      <EstadoVacioAF4 titulo={titulo} accion={{ href: "/deliverys/cierres", etiqueta: "Ver los cierres" }}>
        {detalle}
      </EstadoVacioAF4>
    </Pagina>
  );
  if (!UUID.test(id)) return vacio("Ese recibo no existe");
  const { data, error } = await createServiceClient()
    .from("del_recibos")
    .select("numero, tipo, nombre, documento, empresa, empresa_ruc, monto, fecha_pago, metodo_pago, referencia, periodo_texto")
    .eq("cierre_id", id)
    .maybeSingle();
  if (error) return vacio("Falta la tabla de recibos", "Correr la migración 0911 (Deliverys) en Supabase.");
  if (!data) return vacio("Esta semana todavía no tiene un pago registrado");

  const r: DatosRecibo = {
    numero: data.numero as number,
    tipo: data.tipo === "rendicion" ? "rendicion" : "pago",
    nombre: data.nombre as string,
    documento: (data.documento as string | null) ?? null,
    empresa: data.empresa as string,
    empresaRuc: (data.empresa_ruc as string | null) ?? null,
    monto: Number(data.monto),
    fechaPago: String(data.fecha_pago).slice(0, 10),
    metodo: data.metodo_pago as DatosRecibo["metodo"],
    referencia: (data.referencia as string | null) ?? null,
    periodoTexto: data.periodo_texto as string,
  };
  const p = parrafosRecibo(r);
  // Un RUC o una cédula no se parten al final de la línea («0000000-1-» arriba y el resto abajo): guiones que no cortan.
  const sinCortar = (texto: string, codigos: (string | null)[]) =>
    codigos.reduce<string>((t, c) => (c ? t.split(c).join(c.replace(/-/g, "\u2011")) : t), texto);
  const n = numeroRecibo(r.numero);
  const letras = montoEnLetras(r.monto);

  return (
    <Pagina ancho="ficha" className="flex flex-col gap-6">
      <style>{ESTILO_IMPRESION}</style>
      <EncabezadoAF4 titulo={`Recibo N.º ${n}`} imprimir={false} acciones={<BotonImprimir />} />

      <article
        id="recibo-delivery"
        aria-label={`Recibo N.º ${n}`}
        className="recibo-borde flex flex-col gap-6 rounded-xl border border-border bg-card p-6 text-[15px] leading-relaxed sm:p-10"
      >
        <header className="recibo-borde flex flex-wrap items-start justify-between gap-4 border-b border-border-control pb-5">
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide uppercase">{r.empresa}</p>
            {r.empresaRuc && <p className="recibo-suave text-xs text-muted-foreground tabular-nums">RUC {r.empresaRuc}</p>}
          </div>
          <dl className="recibo-borde grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 rounded-md border border-border-control px-4 py-2 text-sm">
            <dt className="recibo-suave text-muted-foreground">Recibo N.º</dt>
            <dd className="text-right font-semibold tabular-nums">{n}</dd>
            <dt className="recibo-suave text-muted-foreground">Fecha</dt>
            <dd className="text-right tabular-nums">{fechaRecibo(r.fechaPago)}</dd>
          </dl>
        </header>

        <h2 className="text-base font-bold tracking-wide text-balance uppercase">
          {r.tipo === "rendicion" ? "Recibo de entrega de efectivo – delivery independiente" : "Recibo de servicios – delivery independiente"}
        </h2>

        <p>{sinCortar(p.declaracion, [r.empresaRuc, r.documento])}</p>

        <div className="recibo-borde flex flex-col gap-1 rounded-lg border border-border-control px-5 py-4">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="recibo-suave text-sm font-medium text-muted-foreground">USD</span>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{numero(r.monto, 2)}</span>
          </p>
          <p className="recibo-suave text-sm text-muted-foreground first-letter:uppercase">{letras}</p>
        </div>

        <dl className="flex flex-col gap-4">
          <div>
            <dt className="font-semibold">En concepto de</dt>
            <dd>{p.concepto}</dd>
          </div>
          <div>
            <dt className="font-semibold">Forma de pago</dt>
            <dd className="mt-1 flex flex-col gap-2">
              <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
                {METODOS_PAGO.map((m) => (
                  <Casilla key={m} marcada={m === r.metodo} etiqueta={ETIQUETA_METODO[m]} />
                ))}
              </ul>
              {r.referencia && (
                <p className="text-sm">
                  <span className="recibo-suave text-muted-foreground">Referencia:</span> <span className="tabular-nums">{r.referencia}</span>
                </p>
              )}
            </dd>
          </div>
        </dl>

        {p.aclaracion && <p className="recibo-suave text-sm text-muted-foreground">{p.aclaracion}</p>}

        <div className="recibo-firmas mt-6 grid gap-10 sm:grid-cols-2">
          <Firma titulo="Firma del delivery" nombre={r.nombre} detalle={r.documento ? `Cédula/pasaporte ${r.documento}` : null} />
          <Firma titulo={`Por ${r.empresa}`} detalle={r.empresaRuc ? `RUC ${r.empresaRuc}` : null} />
        </div>
      </article>
    </Pagina>
  );
}
