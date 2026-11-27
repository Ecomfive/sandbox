import Link from "next/link";
import { notFound } from "next/navigation";
import { CierresDeposito, type CierreDeposito } from "@/components/despacho/cierres-deposito";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCierres } from "@/lib/despacho/cierres";
import { COURIER_PRUEBA } from "@/lib/despacho/control-envios";
import { cargarFilasRango } from "@/lib/despacho/datos-control";
import { rangoDespacho } from "@/lib/despacho/datos";
import { diaLargo, nombreRepartidor, resumenCierre, sumarDias, tituloTienda } from "@/lib/despacho/panel-repartidor";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Cierres" };
export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** «JULY CALLE» → «July Calle». */
const nombreBonito = (t: string) => t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());

/**
 * Envíos Delivery › Cierres (25 nov 2026, pantalla 1 del prototipo aprobado https://claude.ai/artifact/8mbjcbJGELtkGhvmpSdKhX): solo se valida el
 * efectivo. Lo que cada repartidor debe depositar por tienda (los montos de sus pedidos entregados en efectivo ese día, en el sistema) contra el
 * comprobante de depósito que sube en su app al mandar el cierre del día. Solo con todas las tiendas (es la plata de todas).
 */
export default async function CierresPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const usuario = await requireModulo("despacho-ciudad");
  if (await cargarTiendasPermitidas()) notFound();
  const { hoy } = rangoDespacho(1);
  const pedido = (await searchParams).dia;
  const dia = typeof pedido === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido <= hoy ? pedido : hoy;
  const supabase = createServiceClient();
  const [filas, cierres] = await Promise.all([cargarFilasRango(supabase, dia, dia), cargarCierres(supabase, dia, dia)]);

  const porCourier = new Map<string, { nombre: string; filas: typeof filas }>();
  for (const f of filas) {
    const k = nombreRepartidor(f.courier);
    if (!k) continue;
    const g = porCourier.get(k) ?? { nombre: nombreBonito((f.courier ?? k).replace(/\s+/g, " ").trim()), filas: [] };
    g.filas.push(f);
    porCourier.set(k, g);
  }
  const deCierre = new Map(cierres.map((c) => [nombreRepartidor(c.courier), c]));
  const claves = new Set([...porCourier.keys(), ...deCierre.keys()]);
  const tarjetas: CierreDeposito[] = [];
  for (const k of claves) {
    const g = porCourier.get(k);
    const c = deCierre.get(k);
    const resumen = resumenCierre(g?.filas ?? []);
    if (!resumen.efectivoTotal && !c) continue;
    const depositos = new Map((c?.depositos ?? []).map((d) => [tituloTienda(d.tienda), d]));
    const tiendas = [...new Set([...resumen.efectivo.map((e) => e.tienda), ...depositos.keys()])];
    tarjetas.push({
      id: c?.id ?? null,
      nombre: g?.nombre ?? nombreBonito(c!.courier),
      prueba: k === COURIER_PRUEBA,
      estado: c?.estado ?? null,
      nota: c?.nota ?? null,
      revisadoPor: c?.revisadoPor ?? null,
      tiendas: tiendas.map((t) => {
        const e = resumen.efectivo.find((x) => x.tienda === t);
        const d = depositos.get(t);
        return { tienda: t, pedidos: e?.pedidos ?? 0, debe: r2(e?.monto ?? 0), declarado: d ? r2(d.monto) : null, foto: d?.foto ?? null };
      }),
    });
  }
  const orden = (t: CierreDeposito) => (t.prueba ? 9 : t.estado === "enviado" ? 0 : t.estado === null ? 1 : t.estado === "devuelto" ? 2 : 3);
  tarjetas.sort((a, b) => orden(a) - orden(b) || b.tiendas.reduce((s, t) => s + t.debe, 0) - a.tiendas.reduce((s, t) => s + t.debe, 0));

  const reales = tarjetas.filter((t) => !t.prueba);
  const total = r2(reales.reduce((s, t) => s + t.tiendas.reduce((x, y) => x + y.debe, 0), 0));
  const conComprobante = r2(reales.reduce((s, t) => s + t.tiendas.filter((y) => y.foto).reduce((x, y) => x + y.debe, 0), 0));
  const porValidar = reales.filter((t) => t.estado === "enviado").length;
  const validados = reales.filter((t) => t.estado === "validado").length;
  const plata = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const boton = `inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-base text-foreground-soft hover:bg-muted ${anilloFoco}`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Cierres" oculto>
        Aquí solo se valida el efectivo: lo que cada repartidor debe depositar por tienda contra el comprobante de depósito que sube en su app.
      </EncabezadoPagina>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/despacho-ciudad/cierres?dia=${sumarDias(dia, -1)}`} aria-label="Día anterior" className={boton}>
          ‹
        </Link>
        <span className="inline-flex min-h-9 items-center rounded-lg border border-primario bg-primario-suave px-3 text-[13px] font-semibold text-primario">
          {dia === hoy ? "Hoy · " : ""}
          {diaLargo(dia)}/{dia.slice(0, 4)}
        </span>
        {dia < hoy ? (
          <Link href={`/despacho-ciudad/cierres?dia=${sumarDias(dia, 1)}`} aria-label="Día siguiente" className={boton}>
            ›
          </Link>
        ) : (
          <span className={`${boton} opacity-40`} aria-hidden="true">
            ›
          </span>
        )}
        <p className="m-0 min-w-[16rem] flex-1 text-[13px] text-muted-foreground">
          Lo que debe depositar cada repartidor sale de los montos de sus pedidos entregados en efectivo ese día, en el sistema; al lado va el comprobante que sube en
          su app al mandar su cierre.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Cifra titulo="Efectivo a depositar" valor={plata(total)} />
        <Cifra titulo="Con comprobante" valor={plata(conComprobante)} />
        <Cifra titulo="Falta comprobante" valor={plata(r2(total - conComprobante))} alerta={total - conComprobante > 0.005} />
        <Cifra titulo="Cierres por validar" valor={`${porValidar} de ${reales.length}`} detalle={validados ? `${validados} validados` : undefined} />
      </div>
      {tarjetas.length ? (
        <CierresDeposito tarjetas={tarjetas} puedeEscribir={!usuario.modulosSoloLectura.includes("despacho-ciudad")} />
      ) : (
        <p className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Ese día no hubo cobros en efectivo ni cierres enviados.</p>
      )}
    </Pagina>
  );
}

function Cifra({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <b className={`text-xl ${alerta ? "text-warning" : ""}`}>{valor}</b>
      {detalle && <span className="text-[11px] text-muted-foreground">{detalle}</span>}
    </div>
  );
}
