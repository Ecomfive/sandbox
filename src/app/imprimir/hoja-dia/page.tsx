import { requireModulo } from "@/lib/auth";
import { cargarCiudad, rangoDespacho } from "@/lib/despacho/datos";
import { diaLargo, gruposHoja } from "@/lib/despacho/hoja";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonImprimir } from "../remision/[id]/boton-imprimir";

export const metadata = { title: "Hoja del día" };

export const dynamic = "force-dynamic";

const plata = (n: number | null) => (n === null ? "" : `$${n.toFixed(2)}`);
const th = "border-b-2 border-black px-1.5 py-1.5 text-left text-[10px] font-bold tracking-[0.04em] uppercase";
const td = "border-b border-neutral-300 px-1.5 py-2 align-top";
const blanco = <span className="text-neutral-400">________</span>;

/**
 * La hoja del día impresa (16 nov 2026): una página por repartidor, fuera del menú para que salga limpia. Las mismas columnas de Monday, sin la del
 * repartidor (va arriba). Lo que todavía no tiene valor (estado, cobrado) sale en blanco para anotarlo a mano si se cae la conexión.
 */
export default async function HojaDiaImprimirPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("despacho-ciudad");
  const sp = await searchParams;
  const { hoy } = rangoDespacho(1);
  const dia = typeof sp.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : hoy;
  const repartidor = typeof sp.repartidor === "string" ? sp.repartidor : null;
  const { filas } = await cargarCiudad(createServiceClient(), dia, dia);
  const grupos = gruposHoja(filas).filter((g) => !repartidor || g.nombre === repartidor);
  const impresa = new Date().toLocaleString("es-PA", { timeZone: "America/Panama", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-neutral-200 py-6 text-black print:bg-white print:py-0" style={{ colorScheme: "light" }}>
      <style>{"@page { size: A4 landscape; margin: 10mm 12mm; }"}</style>
      <div className="mx-auto mb-4 flex w-full max-w-[1123px] justify-end px-4 print:hidden">
        <BotonImprimir />
      </div>
      {!grupos.length && <p className="mx-auto max-w-[1123px] bg-white p-10 text-sm">Despacho todavía no cargó pedidos para el {diaLargo(dia)}.</p>}
      {grupos.map((g) => (
        <main key={g.nombre} className="mx-auto mb-6 flex w-full max-w-[1123px] flex-col gap-3 bg-white p-8 shadow break-after-page print:mb-0 print:max-w-none print:p-0 print:shadow-none">
          <header className="flex items-end justify-between border-b border-neutral-300 pb-2">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold tracking-[0.06em] uppercase">Hoja del día · Envíos Delivery</span>
              <span className="text-2xl font-bold">{g.nombre}</span>
            </div>
            <div className="flex flex-col items-end text-xs">
              <b className="text-[15px] first-letter:uppercase">{diaLargo(dia)}</b>
              <span>
                {g.filas.length} pedido{g.filas.length === 1 ? "" : "s"} · {plata(g.sumas.porCobrar)} por cobrar
              </span>
              <span className="text-neutral-600">Impresa el {impresa}</span>
            </div>
          </header>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th scope="col" className={th}>Pedido</th>
                <th scope="col" className={th}>Tienda</th>
                <th scope="col" className={th}>Estado</th>
                <th scope="col" className={th}>Edo. pago</th>
                <th scope="col" className={th}>Forma de pago</th>
                <th scope="col" className={`${th} text-right`}>$ Por cobrar</th>
                <th scope="col" className={`${th} text-right`}>$ Cobrado</th>
                <th scope="col" className={th}>Comprobante</th>
                <th scope="col" className={th}>Comentario</th>
                <th scope="col" className={`${th} text-right`}>Coste envío</th>
                <th scope="col" className={th}>Cambio / retiro / turno</th>
              </tr>
            </thead>
            <tbody>
              {g.filas.map((f) => (
                <tr key={f.itemId} className="break-inside-avoid">
                  <td className={`${td} font-bold`}>{f.numero ?? ""}</td>
                  <td className={td}>{f.tienda ?? ""}</td>
                  <td className={td}>{f.estado ?? blanco}</td>
                  <td className={td}>{f.edoPago ?? ""}</td>
                  <td className={td}>{f.formaPago ?? ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{plata(f.porCobrar)}</td>
                  <td className={`${td} text-right tabular-nums`}>{f.cobrado === null ? blanco : plata(f.cobrado)}</td>
                  <td className={td}>{f.comprobantes ? `Sí (${f.comprobantes})` : <span className="inline-block h-3 w-3 border-[1.5px] border-neutral-700 align-middle" aria-label="Sin comprobante" />}</td>
                  <td className={td}>{f.comentario ?? ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{plata(f.costeEnvio)}</td>
                  <td className={td}>{f.turno ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="border-t-2 border-black px-1.5 py-2 font-semibold">
                  Total · {g.sumas.entregados} de {g.sumas.pedidos} entregados
                </td>
                <td className="border-t-2 border-black px-1.5 py-2 text-right font-bold tabular-nums">{plata(g.sumas.porCobrar)}</td>
                <td className="border-t-2 border-black px-1.5 py-2 text-right tabular-nums">{plata(g.sumas.cobrado)}</td>
                <td colSpan={2} className="border-t-2 border-black" />
                <td className="border-t-2 border-black px-1.5 py-2 text-right font-bold tabular-nums">{plata(g.sumas.costeEnvio)}</td>
                <td className="border-t-2 border-black" />
              </tr>
            </tfoot>
          </table>
          <p className="m-0 text-[11px] text-neutral-700">Estado: ENTREGADO · FALLIDO · POSPUESTO · RECOLECTADO. Lo que se anote aquí se pasa a Envíos Delivery al volver la conexión.</p>
        </main>
      ))}
    </div>
  );
}
