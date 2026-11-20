"use client";

import { useId, useState } from "react";
import { anilloFoco, labelClass } from "@/components/ui/field";
import { esBodegaDropi } from "@/lib/publicaciones/automatico";
import { Ventana } from "@/components/ui/ventana";
import { calcularMargen, leerMonto } from "@/lib/publicaciones/calculadora";
import { MAX_SUMAR_REPUBLICAR, UNIDADES_TEMPORALES_B280 } from "@/lib/publicaciones/republicar-dropi";
import { republicaDeBodegaDropi, type FilaPublicacion } from "./def-publicaciones";
import { useMoneda } from "./moneda-contexto";

/**
 * La confirmación de «Republicar» (27 oct 2026, pedido de Hernán: el 11446 salió con el precio viejo porque nadie lo cambió). Antes de
 * dejarlo para «Aplicar en Dropi» pide el **precio de venta del producto nuevo** (empieza con el de hoy) y muestra su margen; si se deja
 * igual, lo dice. Ese precio va al producto nuevo en Dropi (precio y sugerido) y a la publicación nueva del sistema.
 * «Unidades que llegaron» (20 nov 2026, pedido del equipo: muchas veces se republica porque volvió a llegar el producto): se suman en el mismo paso al stock
 * que pasa al ID nuevo, en una bodega de ECOMFIVE. No en productos con variaciones ni en los de la bodega de Dropi: ahí, con el lápiz de stock después.
 */
export function ConfirmarRepublicar({
  p,
  alCerrar,
  alConfirmar,
  enviando,
}: {
  p: FilaPublicacion;
  alCerrar: () => void;
  alConfirmar: (precio: number, sumar: { unidades: number; bodega: number } | null) => void;
  enviando: boolean;
}) {
  const id = useId();
  // En la moneda del país (Costa Rica en colones).
  const { monto: usd, simbolo } = useMoneda();
  const [texto, setTexto] = useState(p.precioVenta === null ? "" : p.precioVenta.toFixed(2));
  const precio = leerMonto(texto);
  const valido = precio !== null && precio > 0;
  const mismo = valido && p.precioVenta !== null && Math.abs(precio - p.precioVenta) < 0.005;
  const r = valido ? calcularMargen({ costo: p.costoMercancia ?? 0, fulfillment: p.fulfillment ?? 0, precio }) : null;
  // Las bodegas de ECOMFIVE del producto en Dropi (la que más tiene primero) y si se puede sumar aquí.
  const deB280 = republicaDeBodegaDropi(p);
  const variable = (p.stockPorId ?? []).some((x) => x.variable);
  const propias = (p.bodegasDropi ?? []).filter((b) => !esBodegaDropi(b.id));
  const puedeSumar = !deB280 && !variable && propias.length > 0;
  const [textoSumar, setTextoSumar] = useState("");
  const [bodegaId, setBodegaId] = useState<number | null>(propias[0]?.id ?? null);
  const bodega = propias.find((b) => b.id === bodegaId) ?? propias[0] ?? null;
  const limpio = textoSumar.trim();
  const sumar = limpio === "" ? 0 : /^\d+$/.test(limpio) ? Number(limpio) : NaN;
  const sumarValido = !puedeSumar || (Number.isInteger(sumar) && sumar >= 0 && sumar <= MAX_SUMAR_REPUBLICAR);
  const listo = valido && sumarValido;
  const num = (n: number) => n.toLocaleString("es-PA");
  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Republicar en Dropi" ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (listo && !enviando) alConfirmar(precio, puedeSumar && sumar > 0 && bodega ? { unidades: sumar, bodega: bodega.id } : null);
        }}
      >
        {deB280 ? (
          <div className="flex flex-col gap-2 text-sm text-foreground-soft">
            <p className="m-0">
              Su stock está en la bodega de Dropi, que no podemos mover. Al pulsar «Aplicar en Dropi» con Dropi abierto se crea un ID nuevo igual a{" "}
              <span className="font-medium text-foreground">{p.nombre}</span> (datos y fotos) con {UNIDADES_TEMPORALES_B280} unidades temporales en nuestra bodega, que enseguida se
              sacan: queda en 0.
            </p>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-xs">
              <li>El ID {p.dropiId} no se toca: sigue vendiendo con su stock.</li>
              <li>Te queda la tarea de pedirle a Dropi el traslado de su stock al ID nuevo, con el mensaje listo para copiar en el grupo. Se cierra sola cuando el sistema lo ve.</li>
              <li>Y la tarea de archivar el ID {p.dropiId} en un mes (no antes, por las devoluciones tardías).</li>
            </ol>
          </div>
        ) : (
          <p className="m-0 text-sm text-foreground-soft">
            Se va a crear en Dropi una publicación nueva igual a <span className="font-medium text-foreground">{p.nombre}</span> (datos, fotos y stock) y la del ID {p.dropiId} queda
            archivada y sin stock. Se hace al pulsar «Aplicar en Dropi» con Dropi abierto.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-precio`} className={labelClass}>
            Precio de venta del producto nuevo
          </label>
          <span className="flex items-center gap-1 rounded-md border border-border-control bg-card px-3 focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground">
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              {simbolo}
            </span>
            <input
              id={`${id}-precio`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              inputMode="decimal"
              required
              data-enfocar
              aria-invalid={!valido ? true : undefined}
              aria-describedby={`${id}-nota`}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm tabular-nums outline-none"
            />
          </span>
          <p id={`${id}-nota`} className="m-0 text-xs text-muted-foreground">
            {p.precioVenta !== null ? `Hoy está en ${usd(p.precioVenta)}. ` : ""}
            {r ? (
              <>
                Con este precio: utilidad <span className="font-medium text-foreground tabular-nums">{usd(r.utilidad)}</span>, margen{" "}
                <span className="font-medium text-foreground tabular-nums">{Math.round(r.margen * 100)} %</span>.
              </>
            ) : (
              "Pon un precio mayor que cero."
            )}
          </p>
          {mismo && <p className="m-0 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning">Se republica con el mismo precio. Si había que cambiarlo, cámbialo aquí.</p>}
        </div>
        {puedeSumar && bodega ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-sumar`} className={labelClass}>
              Unidades que llegaron <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={`${id}-sumar`}
                value={textoSumar}
                onChange={(e) => setTextoSumar(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                aria-invalid={!sumarValido ? true : undefined}
                aria-describedby={`${id}-nota-sumar`}
                className={`w-28 rounded-md border border-border-control bg-card px-3 py-2 text-sm tabular-nums outline-none focus:border-foreground focus:ring-2 focus:ring-foreground`}
              />
              {propias.length > 1 ? (
                <select
                  aria-label="Bodega donde se suman"
                  value={bodega.id}
                  onChange={(e) => setBodegaId(Number(e.target.value))}
                  className={`min-h-9 rounded-md border border-border-control bg-card px-2 text-sm ${anilloFoco}`}
                >
                  {propias.map((b) => (
                    <option key={b.id} value={b.id}>
                      B{b.id} · {b.nombre} ({num(b.stock)} u.)
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-muted-foreground">
                  en B{bodega.id} · {bodega.nombre}
                </span>
              )}
            </div>
            <p id={`${id}-nota-sumar`} className="m-0 text-xs text-muted-foreground">
              {!sumarValido
                ? `Escribe un número entero, de 0 a ${num(MAX_SUMAR_REPUBLICAR)}.`
                : sumar > 0
                  ? `El ID nuevo queda con ${num(bodega.stock)} + ${num(sumar)} = ${num(bodega.stock + sumar)} u. en B${bodega.id} (según la última lectura de Dropi).`
                  : `Si volvió a llegar el producto, escribe cuántas unidades: se suman a las ${num(bodega.stock)} que pasan al ID nuevo.`}
            </p>
          </div>
        ) : (
          <p className="m-0 text-xs text-muted-foreground">
            {deB280 || variable
              ? `${deB280 ? "Su stock está en la bodega de Dropi" : "Tiene variaciones"}: si llegaron unidades, súmalas con el lápiz de stock del ID nuevo después de republicar.`
              : "No hay lectura de sus bodegas en Dropi: si llegaron unidades, súmalas con el lápiz de stock del ID nuevo después de republicar."}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={!listo || enviando} className={`inline-flex min-h-10 items-center rounded-lg bg-primario px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
            {enviando ? "Dejando pendiente…" : valido ? `Republicar a ${usd(precio)}${puedeSumar && sumar > 0 ? ` · +${num(sumar)} u.` : ""}` : "Republicar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}
