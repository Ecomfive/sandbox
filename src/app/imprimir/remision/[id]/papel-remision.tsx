/* eslint-disable @next/next/no-img-element -- el logo del papel: una imagen fija que debe salir tal cual al imprimir */
import { BotonImprimir } from "./boton-imprimir";

export interface DatosPapelRemision {
  numero: string;
  fecha: string;
  desde: string;
  hacia: string;
  pais: string;
  notas: string | null;
  lineas: { id: string; codigo: string; nombre: string; barras: string | null; enviada: number }[];
}

function Firma({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-5">
      <b className="text-sm">{titulo}</b>
      {["Nombre", "Firma", "Fecha y hora"].map((c) => (
        <div key={c} className="border-b border-black pb-0.5 text-xs text-neutral-600">
          {c}
        </div>
      ))}
    </div>
  );
}

/** El papel que va con la carga. Lo enviado va impreso; lo recibido y las observaciones se llenan a mano al contar. Siempre en blanco y negro, también con el tema oscuro. */
export function PapelRemision({ d }: { d: DatosPapelRemision }) {
  const unidades = d.lineas.reduce((t, f) => t + f.enviada, 0);
  return (
    <div className="min-h-screen bg-neutral-200 py-6 text-black print:bg-white print:py-0" style={{ colorScheme: "light" }}>
      <style>{"@page { size: letter; margin: 14mm; }"}</style>
      <div className="mx-auto mb-4 flex w-full max-w-[816px] justify-end px-4 print:hidden">
        <BotonImprimir />
      </div>
      <main className="mx-auto flex w-full max-w-[816px] flex-col gap-6 bg-white p-10 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <img src="/brand/ecomfive-negro.png" alt="Ecomfive" className="h-9 w-auto" />
          <div className="text-right">
            <h1 className="m-0 text-2xl font-bold tracking-tight">Remisión {d.numero}</h1>
            <p className="m-0 text-sm">{d.fecha}</p>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="m-0 text-xs text-neutral-600">Sale de</p>
            <p className="m-0 font-semibold">{d.desde}</p>
          </div>
          <div>
            <p className="m-0 text-xs text-neutral-600">Va a</p>
            <p className="m-0 font-semibold">{d.hacia}</p>
          </div>
          <div>
            <p className="m-0 text-xs text-neutral-600">País</p>
            <p className="m-0 font-semibold">{d.pais}</p>
          </div>
          {d.notas && (
            <div className="col-span-3">
              <p className="m-0 text-xs text-neutral-600">Notas</p>
              <p className="m-0">{d.notas}</p>
            </div>
          )}
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              {["N.º", "SKU", "Producto", "Enviadas", "Recibidas", "Observaciones"].map((t) => (
                <th key={t} scope="col" className={`border border-black px-2 py-1.5 text-xs font-semibold ${t === "Enviadas" || t === "Recibidas" ? "text-right" : ""}`}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.lineas.map((f, i) => (
              <tr key={f.id} className="break-inside-avoid">
                <td className="border border-black px-2 py-2 align-top tabular-nums">{i + 1}</td>
                <td className="border border-black px-2 py-2 align-top text-xs [overflow-wrap:anywhere]">
                  {f.codigo.split("/").map((parte, j) => (
                    <span key={j}>
                      {j > 0 && "/"}
                      <wbr />
                      {parte}
                    </span>
                  ))}
                  {f.barras && <span className="block text-neutral-600">{f.barras}</span>}
                </td>
                <td className="border border-black px-2 py-2 align-top">{f.nombre}</td>
                <td className="border border-black px-2 py-2 text-right align-top font-semibold tabular-nums">{f.enviada.toLocaleString("es-PA")}</td>
                <td className="w-20 border border-black" />
                <td className="w-36 border border-black" />
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={3} className="border border-black px-2 py-2 text-right">
                Total ({d.lineas.length} {d.lineas.length === 1 ? "producto" : "productos"})
              </td>
              <td className="border border-black px-2 py-2 text-right tabular-nums">{unidades.toLocaleString("es-PA")}</td>
              <td className="border border-black" />
              <td className="border border-black" />
            </tr>
          </tbody>
        </table>

        <p className="m-0 text-xs text-neutral-700">Al recibir, cuenta la mercancía, anota en «Recibidas» lo que llegó y explica cualquier diferencia en «Observaciones».</p>

        <section className="mt-6 grid grid-cols-2 gap-10 break-inside-avoid">
          <Firma titulo="Entrega" />
          <Firma titulo="Recibe" />
        </section>
      </main>
    </div>
  );
}
