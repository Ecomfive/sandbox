"use client";

import { useEffect, useState } from "react";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { formatearFechaHora } from "@/lib/formato";
import { obtenerCompetenciaProducto, obtenerHistorialCompetencia, type CompetenciaDeProducto, type EventoCompetencia } from "@/lib/competencia/actions";

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PA"));

/**
 * Una foto pequeña que se abre grande con un clic (Escape o un clic afuera la cierran), encima de lo que haya, sin llevar a ningún
 * sitio. Con `dentroDeFieldset` va como `role="button"` y no como `<button>`: un `<fieldset disabled>` (la ficha de solo lectura)
 * apaga los botones, y ver una foto en grande no es editar.
 */
export function FotoAmpliable({ url, nombre, tam = "h-12 w-12", dentroDeFieldset = false }: { url: string | null; nombre: string; tam?: string; dentroDeFieldset?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  if (!url) return <span className={`${tam} block shrink-0 rounded-md border border-dashed border-border-control`} aria-hidden="true" />;
  const imagen = (
    // eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront) y de Storage
    <img src={url} alt="" loading="lazy" className={`${tam} rounded-md border border-border object-cover hover:opacity-90`} />
  );
  return (
    <>
      {dentroDeFieldset ? (
        <span
          role="button"
          tabIndex={0}
          onClick={() => setAbierta(true)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            setAbierta(true);
          }}
          aria-label={`Ver la foto de ${nombre}`}
          className={`block shrink-0 rounded-md ${anilloFoco}`}
        >
          {imagen}
        </span>
      ) : (
        <button type="button" onClick={() => setAbierta(true)} aria-label={`Ver la foto de ${nombre}`} className={`shrink-0 rounded-md ${anilloFoco}`}>
          {imagen}
        </button>
      )}
      <VisorImagen src={abierta ? url : null} alt={nombre} onClose={() => setAbierta(false)} />
    </>
  );
}

/** Lo que pasó en un evento del historial, en palabras. */
function queFue(e: EventoCompetencia): { texto: string; tono: "success" | "destructive" | "neutral" | "info" } {
  if (e.evento === "stock" && e.stock !== null && e.stockAntes !== null)
    return e.stock < e.stockAntes ? { texto: `Bajó el stock (vendió ${num(e.stockAntes - e.stock)})`, tono: "destructive" } : { texto: `Subió el stock (+${num(e.stock - e.stockAntes)})`, tono: "success" };
  if (e.evento === "precio" && e.precio !== null && e.precioAntes !== null)
    return e.precio < e.precioAntes ? { texto: "Bajó el precio", tono: "destructive" } : { texto: "Subió el precio", tono: "success" };
  if (e.evento === "primera_vez") return { texto: "Lo vimos por primera vez", tono: "info" };
  if (e.evento === "desaparecio") return { texto: "Dejó de mostrarlo", tono: "neutral" };
  if (e.evento === "reaparecio") return { texto: "Lo volvió a mostrar", tono: "info" };
  return { texto: e.evento, tono: "neutral" };
}

/**
 * El historial de un producto de la competencia en una tabla: cada vez que bajó o subió el stock y cada cambio de precio, con
 * lo de antes, lo de después y la diferencia en color.
 */
export function HistorialCompetencia({ productoId, limite = 30 }: { productoId: string; limite?: number }) {
  const [eventos, setEventos] = useState<EventoCompetencia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerHistorialCompetencia(productoId).then((r) => {
      if (!vigente) return;
      if (r.error) setError(r.error);
      else setEventos(r.eventos ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [productoId]);
  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!eventos) return <p className="text-xs text-muted-foreground">Cargando historial…</p>;
  if (!eventos.length) return <p className="text-xs text-muted-foreground">Sin historial todavía.</p>;
  const cambio = (antes: number | null, ahora: number | null, formato: (n: number | null) => string) => {
    if (antes === null || ahora === null) return <span>{formato(ahora ?? antes)}</span>;
    const d = ahora - antes;
    return (
      <span className="flex flex-col">
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">{formato(antes)} → </span>
          {formato(ahora)}
        </span>
        {d !== 0 && (
          <span className={`text-xs ${d > 0 ? "text-success" : "text-destructive"}`}>
            {d > 0 ? "▲ +" : "▼ −"}
            {formato(Math.abs(d))}
          </span>
        )}
      </span>
    );
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className={claseFilaEncabezado}>
            <th className={claseEncabezadoColumna}>Fecha</th>
            <th className={claseEncabezadoColumna}>Qué pasó</th>
            <th className={claseEncabezadoColumna}>Precio</th>
            <th className={claseEncabezadoColumna}>Stock</th>
          </tr>
        </thead>
        <tbody>
          {eventos.slice(0, limite).map((e, i) => {
            const q = queFue(e);
            return (
              <tr key={i} className="border-b border-border align-top last:border-0">
                <td className={`${claseCeldaColumna} whitespace-nowrap text-xs`}>{formatearFechaHora(e.fecha)}</td>
                <td className={claseCeldaColumna}>
                  <Badge tone={q.tono}>{q.texto}</Badge>
                </td>
                <td className={`${claseCeldaColumna} tabular-nums`}>{e.evento === "precio" ? cambio(e.precioAntes, e.precio, usd) : usd(e.precio ?? e.precioAntes)}</td>
                <td className={`${claseCeldaColumna} tabular-nums`}>{e.evento === "stock" ? cambio(e.stockAntes, e.stock, num) : num(e.stock ?? e.stockAntes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * «Competencia en Dropi» de un producto de Producto (en su ficha y en cada línea de una compra): quién más lo vende, a qué
 * precio frente al nuestro, su stock, cuánto vendió en 7 y 30 días y el historial de cada uno (al desplegarlo).
 */
export function BloqueCompetencia({ skuId }: { skuId: string }) {
  const [datos, setDatos] = useState<CompetenciaDeProducto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    setDatos(null);
    obtenerCompetenciaProducto(skuId).then((r) => {
      if (!vigente) return;
      if (r.error) setError(r.error);
      else setDatos(r.datos ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [skuId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!datos) return <p className="text-sm text-muted-foreground">Buscando en la competencia…</p>;
  if (!datos.length) return <p className="text-sm text-muted-foreground">Ningún competidor vende este producto en Dropi (ni por nombre ni por foto).</p>;

  return (
    <div className="flex flex-col gap-4">
      {datos.map((d) => {
        const precios = d.competidores.map((c) => c.precio).filter((x): x is number => x !== null);
        const minimo = precios.length ? Math.min(...precios) : null;
        const masBaratos = d.nuestro?.precio != null ? d.competidores.filter((c) => c.precio !== null && c.precio < d.nuestro!.precio!).length : 0;
        const vendido7 = d.competidores.reduce((t, c) => t + c.vendido7, 0);
        return (
          <div key={d.pais} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Dato titulo={`Competidores en ${d.pais}`} valor={num(d.competidores.length)} />
              <Dato titulo="Precio más bajo" valor={usd(minimo)} sub={d.nuestro ? `nosotros ${usd(d.nuestro.precio)}` : "no lo vendemos en Dropi"} tono={masBaratos ? "destructive" : undefined} />
              <Dato titulo="Más baratos que nosotros" valor={num(masBaratos)} tono={masBaratos ? "destructive" : undefined} />
              <Dato titulo="Vendieron (7 días)" valor={num(vendido7)} sub="bajadas de stock" />
            </div>
            {d.competidores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Lo vendemos en Dropi y nadie más lo tiene.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {d.competidores.map((c) => {
                  const masBarato = d.nuestro?.precio != null && c.precio !== null && c.precio < d.nuestro.precio;
                  return (
                    <li key={c.id} className="flex flex-col gap-2 px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <FotoAmpliable url={c.foto} nombre={c.nombre} tam="h-10 w-10" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <a href={c.urlProveedor} target="_blank" rel="noopener noreferrer" className="text-sm font-medium break-words underline-offset-2 hover:underline">
                            {c.proveedor}
                          </a>
                          <span className="text-xs break-words text-muted-foreground">
                            «{c.nombre}» · {c.porFoto ? "misma foto" : c.parecido ? `${c.parecido} % del nombre` : "igual a nuestro producto en Dropi"}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {num(c.stock)} en stock · vendió {num(c.vendido7)} en 7 días y {num(c.vendido30)} en 30
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`text-sm font-semibold tabular-nums ${masBarato ? "text-destructive" : ""}`}>{usd(c.precio)}</span>
                          <button
                            type="button"
                            aria-expanded={abierto === c.id}
                            onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                            className={`rounded-md px-1.5 py-0.5 text-xs text-primario hover:bg-muted ${anilloFoco}`}
                          >
                            {abierto === c.id ? "Ocultar historial" : "Historial"}
                          </button>
                        </span>
                      </div>
                      {abierto === c.id && <HistorialCompetencia productoId={c.id} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dato({ titulo, valor, sub, tono }: { titulo: string; valor: string; sub?: string; tono?: "destructive" }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tono && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
        {titulo}
      </p>
      <p className="text-base font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** «Ver competencia» de una línea de compra: despliega el bloque de competencia de ese producto (se pide al abrirlo). */
export function CompetenciaDesplegable({ skuId, nombre }: { skuId: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={abierto}
        aria-label={`${abierto ? "Ocultar" : "Ver"} la competencia de ${nombre}`}
        onClick={() => setAbierto(!abierto)}
        className={`self-start rounded-md px-1.5 py-0.5 text-xs text-primario hover:bg-muted ${anilloFoco}`}
      >
        {abierto ? "Ocultar competencia" : "Ver competencia en Dropi"}
      </button>
      {abierto && <BloqueCompetencia skuId={skuId} />}
    </div>
  );
}
