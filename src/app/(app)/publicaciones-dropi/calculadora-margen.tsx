"use client";

import { useId, useMemo, useState } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { calcularMargen, leerMonto, precioParaMargen, textoWhatsapp } from "@/lib/publicaciones/calculadora";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { nivelMargen, type Reglas } from "@/lib/publicaciones/reglas";
import type { FilaPublicacion } from "./def-publicaciones";

const COLOR_NIVEL: Record<string, string> = { critico: "text-destructive", bajo: "text-destructive", aceptable: "text-warning", sano: "text-success" };
const ETIQUETA_NIVEL: Record<string, string> = { critico: "crítico", bajo: "bajo", aceptable: "aceptable", sano: "saludable" };
const monto = (n: number | null) => (n === null ? "" : n.toFixed(2));
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const etiquetaOpcion = (p: FilaPublicacion) => `${numeroPublicacion(p.numero)} · ${p.nombre}${p.dropiId ? ` · ID ${p.dropiId}` : ""}`;

/**
 * Gestión de IDs Dropi › Calculadora de margen (27 oct 2026, pedido de Hernán): se elige una publicación (o se escribe un producto
 * nuevo), se ponen el costo de mercancía, el fulfillment y el precio de venta, y sale la utilidad y el margen con el color de las
 * reglas. «Copiar para WhatsApp» deja el resultado en el portapapeles, listo para pegarlo en un chat. No guarda nada.
 */
export function CalculadoraMargen({ publicaciones, reglas }: { publicaciones: FilaPublicacion[]; reglas: Reglas }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border-control bg-card px-3.5 text-sm font-semibold hover:bg-muted ${anilloFoco}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8" />
        </svg>
        Calculadora
      </button>
      {abierta && <VentanaCalculadora publicaciones={publicaciones} reglas={reglas} alCerrar={() => setAbierta(false)} />}
    </>
  );
}

function VentanaCalculadora({ publicaciones, reglas, alCerrar }: { publicaciones: FilaPublicacion[]; reglas: Reglas; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const id = useId();
  const opciones = useMemo(() => publicaciones.filter((p) => !p.archivada).map((p) => ({ etiqueta: etiquetaOpcion(p), p })), [publicaciones]);
  const [buscar, setBuscar] = useState("");
  const [elegida, setElegida] = useState<FilaPublicacion | null>(null);
  const [nombre, setNombre] = useState("");
  const [idDropi, setIdDropi] = useState("");
  const [costo, setCosto] = useState("");
  const [fulfillment, setFulfillment] = useState("");
  const [precio, setPrecio] = useState("");

  function elegir(texto: string) {
    setBuscar(texto);
    const o = opciones.find((x) => x.etiqueta === texto);
    if (!o) return;
    setElegida(o.p);
    setNombre(o.p.nombre);
    setIdDropi(o.p.dropiId);
    setCosto(monto(o.p.costoMercancia));
    setFulfillment(monto(o.p.fulfillment));
    setPrecio(monto(o.p.precioVenta));
  }

  const datos = { costo: leerMonto(costo) ?? 0, fulfillment: leerMonto(fulfillment) ?? 0, precio: leerMonto(precio) ?? 0 };
  const resultado = calcularMargen(datos);
  const nivel = resultado ? nivelMargen(resultado.margen, reglas) : null;
  const paraMinimo = precioParaMargen(datos.costo, datos.fulfillment, reglas.margen_minimo);
  // El coste real (lo que costó la última compra) solo se incluye si la publicación elegida lo tiene y no se cambió el producto.
  const costeReal = elegida && elegida.nombre === nombre ? elegida.costeReal : null;
  const mensaje = resultado ? textoWhatsapp({ nombre, idDropi, costeReal }, datos, resultado) : null;

  async function copiar() {
    if (!mensaje) return;
    try {
      await navigator.clipboard.writeText(mensaje);
      mostrarToast("Copiado: pégalo en WhatsApp");
    } catch {
      mostrarToast("No se pudo copiar. Selecciona el texto y cópialo a mano.", "destructive");
    }
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Calculadora de margen" ancho="md">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pub`} className={labelClass}>
            Publicación <span className="font-normal text-muted-foreground">(opcional: llena los datos)</span>
          </label>
          <input
            id={`${id}-pub`}
            list={`${id}-lista`}
            value={buscar}
            onChange={(e) => elegir(e.target.value)}
            placeholder="Busca por nombre, PUB o ID de Dropi"
            className={fieldClass}
            data-enfocar
          />
          <datalist id={`${id}-lista`}>
            {opciones.map((o) => (
              <option key={o.p.id} value={o.etiqueta} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-nombre`} className={labelClass}>
              Producto
            </label>
            <input id={`${id}-nombre`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre para el mensaje" className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-iddropi`} className={labelClass}>
              ID de Dropi
            </label>
            <input id={`${id}-iddropi`} value={idDropi} onChange={(e) => setIdDropi(e.target.value)} inputMode="numeric" className={fieldClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["costo", "Costo de mercancía", costo, setCosto],
              ["ful", "Fulfillment", fulfillment, setFulfillment],
              ["precio", "Precio de venta", precio, setPrecio],
            ] as const
          ).map(([clave, etiqueta, valor, cambiar]) => (
            <div key={clave} className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-${clave}`} className={labelClass}>
                {etiqueta}
              </label>
              <span className="flex items-center gap-1 rounded-md border border-border-control bg-card px-3 focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground">
                <span aria-hidden="true" className="text-sm text-muted-foreground">
                  $
                </span>
                <input
                  id={`${id}-${clave}`}
                  value={valor}
                  onChange={(e) => cambiar(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={valor !== "" && leerMonto(valor) === null ? true : undefined}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm tabular-nums outline-none"
                />
              </span>
            </div>
          ))}
        </div>

        <section aria-live="polite" aria-label="Resultado" className="rounded-lg bg-muted px-4 py-3">
          {resultado ? (
            <div className="flex flex-col gap-2">
              <dl className="m-0 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Utilidad</dt>
                  <dd className={`m-0 text-2xl font-semibold tabular-nums ${resultado.utilidad < 0 ? "text-destructive" : ""}`}>{usd(resultado.utilidad)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Margen</dt>
                  <dd className={`m-0 text-2xl font-semibold tabular-nums ${nivel ? COLOR_NIVEL[nivel] : ""}`}>
                    {pct(resultado.margen)}
                    {nivel && <span className="ml-1.5 text-xs font-medium">{ETIQUETA_NIVEL[nivel]}</span>}
                  </dd>
                </div>
              </dl>
              {paraMinimo !== null && resultado.margen < reglas.margen_minimo && (
                <p className="m-0 text-xs text-muted-foreground">
                  Para llegar al margen mínimo ({pct(reglas.margen_minimo)}) el precio tendría que ser al menos <span className="font-semibold text-foreground tabular-nums">{usd(paraMinimo)}</span>.
                </p>
              )}
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Pon el precio de venta (y los costos) para ver la utilidad y el margen.</p>
          )}
        </section>

        {mensaje && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs font-medium text-muted-foreground">Así se copia para WhatsApp</p>
            <pre className="m-0 rounded-lg border border-border bg-card px-3 py-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{mensaje}</pre>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Cerrar
          </button>
          <button
            type="button"
            onClick={copiar}
            disabled={!mensaje}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg bg-primario px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
          >
            Copiar para WhatsApp
          </button>
        </div>
      </div>
    </Ventana>
  );
}
