"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClassSm } from "@/components/ui/field";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import { eliminarOferta, enviarATest, guardarOferta } from "./actions";

export interface Oferta {
  id: string;
  orden: number;
  nombre: string;
  unidades: number;
  precio: number | null;
  notas: string | null;
}

export interface ProductoOferta {
  id: string;
  numero: number;
  nombre: string;
  fuente: string;
  codigoFuente: string;
  foto: string | null;
  /** Costo del proveedor por unidad, en dólares. */
  costo: number | null;
  precioReferencia: number | null;
  url: string | null;
  ofertas: Oferta[];
}

const usd = (n: number | null) => (n === null ? "—" : `US$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Margen de una oferta: el precio menos el costo de sus unidades (y su porcentaje sobre el precio). */
function margen(precio: number | null, costo: number | null, unidades: number) {
  if (precio === null || costo === null || !precio) return null;
  const valor = precio - costo * unidades;
  return { valor, pct: (valor / precio) * 100 };
}

function FilaOferta({ producto, oferta, puedeEscribir, alListo }: { producto: ProductoOferta; oferta: Oferta | null; puedeEscribir: boolean; alListo: () => void }) {
  const [nombre, setNombre] = useState(oferta?.nombre ?? "");
  const [unidades, setUnidades] = useState(String(oferta?.unidades ?? 1));
  const [precio, setPrecio] = useState(oferta?.precio === null || oferta?.precio === undefined ? "" : String(oferta.precio));
  const [notas, setNotas] = useState(oferta?.notas ?? "");
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  const cambiado =
    !oferta || nombre !== oferta.nombre || Number(unidades) !== oferta.unidades || (precio === "" ? null : Number(precio)) !== oferta.precio || notas !== (oferta.notas ?? "");
  const m = margen(precio === "" ? null : Number(precio), producto.costo, Number(unidades) || 1);
  const etiqueta = oferta ? `oferta ${oferta.orden} de ${producto.nombre}` : `nueva oferta de ${producto.nombre}`;

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarOferta({ id: oferta?.id, seleccionId: producto.id, nombre, unidades: Number(unidades), precio: precio === "" ? null : Number(precio), notas });
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(oferta ? "Oferta guardada" : "Oferta creada");
      alListo();
    });

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-3 py-2 text-muted-foreground tabular-nums">{oferta ? oferta.orden : "+"}</td>
      <td className="px-3 py-2">
        <input aria-label={`Nombre de la ${etiqueta}`} value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!puedeEscribir} placeholder="Ej: 2x1" className={`${fieldClassSm} w-full min-w-[8rem]`} />
      </td>
      <td className="px-3 py-2">
        <input aria-label={`Unidades de la ${etiqueta}`} type="number" min={1} max={99} value={unidades} onChange={(e) => setUnidades(e.target.value)} disabled={!puedeEscribir} className={`${fieldClassSm} w-16 tabular-nums`} />
      </td>
      <td className="px-3 py-2">
        <input aria-label={`Precio en dólares de la ${etiqueta}`} type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} disabled={!puedeEscribir} placeholder="Ej: 39.90" className={`${fieldClassSm} w-24 tabular-nums`} />
      </td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
        {m ? (
          <span className={m.valor >= 0 ? "text-success" : "text-destructive"}>
            {usd(m.valor)} <span className="text-xs">({m.pct.toFixed(0)} %)</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <input aria-label={`Notas de la ${etiqueta}`} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={!puedeEscribir} placeholder="Ej: con envío gratis" className={`${fieldClassSm} w-full min-w-[8rem]`} />
      </td>
      {puedeEscribir && (
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="flex gap-1">
            <Button type="button" variant="secondary" className="!px-2.5 !py-1 text-xs" disabled={pendiente || !cambiado || !nombre.trim()} onClick={guardar}>
              {oferta ? "Guardar" : "Agregar"}
            </Button>
            {oferta && (
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                disabled={pendiente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await eliminarOferta(oferta.id);
                    if (r.error) return mostrarToast(r.error, "destructive");
                    mostrarToast("Oferta quitada");
                    alListo();
                  })
                }
              >
                Quitar
              </Button>
            )}
          </span>
        </td>
      )}
    </tr>
  );
}

/**
 * «Enviar a Test»: con al menos una oferta con precio, crea su producto (en Test) y su test ya vinculados, y la fila pasa a
 * «En test» (sale de esta lista). Pide confirmación en el mismo botón: crea registros en Producto y Test productos.
 */
function BotonEnviarATest({ producto }: { producto: ProductoOferta }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const lista = producto.ofertas.some((o) => o.precio !== null);
  if (!lista) return <span className="text-xs text-muted-foreground">Arma una oferta con precio para enviarlo a Test</span>;
  if (!confirmar)
    return (
      <Button type="button" className="!px-2.5 !py-1 text-xs" onClick={() => setConfirmar(true)}>
        Enviar a Test
      </Button>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Crea su producto y su test.</span>
      <Button
        type="button"
        className="!px-2.5 !py-1 text-xs"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await enviarATest(producto.id);
            if (r.error) {
              mostrarToast(r.error, "destructive");
              setConfirmar(false);
              return;
            }
            mostrarToast(`Enviado a Test productos con el SKU ${r.sku}`);
            router.refresh();
          })
        }
      >
        {pendiente ? "Enviando…" : "Confirmar"}
      </Button>
      <Button type="button" variant="ghost" className="!px-2.5 !py-1 text-xs" disabled={pendiente} onClick={() => setConfirmar(false)}>
        Cancelar
      </Button>
    </span>
  );
}

function TarjetaProducto({ producto, puedeEscribir }: { producto: ProductoOferta; puedeEscribir: boolean }) {
  const router = useRouter();
  // Una clave nueva tras crear vacía la fila de «nueva oferta».
  const [nueva, setNueva] = useState(0);
  const listo = () => {
    setNueva((n) => n + 1);
    router.refresh();
  };
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-labelledby={`oferta-${producto.id}`}>
      <header className="flex items-start gap-3">
        {producto.foto ? (
          <TarjetaEmergente
            clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
            contenido={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={producto.foto} alt="" className="max-h-80 max-w-80 rounded-md object-contain" />
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={producto.foto} alt="" className="h-14 w-14 rounded-md border border-border object-cover" />
          </TarjetaEmergente>
        ) : (
          <span className="h-14 w-14 shrink-0 rounded-md border border-dashed border-border-control" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={`oferta-${producto.id}`} className="font-semibold">
            {producto.nombre}
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            SEL-{String(producto.numero).padStart(4, "0")} · {producto.codigoFuente} · Costo {usd(producto.costo)} por unidad · Precio de referencia {usd(producto.precioReferencia)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-xs text-muted-foreground tabular-nums">{producto.ofertas.length} de 3</span>
          {puedeEscribir && <BotonEnviarATest producto={producto} />}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-3 py-1.5 font-medium">Oferta</th>
              <th className="px-3 py-1.5 font-medium">Unidades</th>
              <th className="px-3 py-1.5 font-medium">Precio (US$)</th>
              <th className="px-3 py-1.5 font-medium">Margen</th>
              <th className="px-3 py-1.5 font-medium">Notas</th>
              {puedeEscribir && <th className="px-3 py-1.5 font-medium">
                <span className="sr-only">Acciones</span>
              </th>}
            </tr>
          </thead>
          <tbody>
            {producto.ofertas.map((o) => (
              <FilaOferta key={`${o.id}-${o.nombre}-${o.precio}-${o.unidades}`} producto={producto} oferta={o} puedeEscribir={puedeEscribir} alListo={listo} />
            ))}
            {puedeEscribir && producto.ofertas.length < 3 && <FilaOferta key={`nueva-${nueva}`} producto={producto} oferta={null} puedeEscribir alListo={listo} />}
            {!puedeEscribir && !producto.ofertas.length && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">
                  Sin ofertas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/** Los productos en «Crear oferta», uno debajo del otro, con sus ofertas editables en su sitio. */
export function VistaOfertas({ productos, puedeEscribir }: { productos: ProductoOferta[]; puedeEscribir: boolean }) {
  if (!productos.length)
    return (
      <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        No hay productos en «Crear oferta». En Selección de productos, pasa un producto a ese estado.
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      {productos.map((p) => (
        <TarjetaProducto key={p.id} producto={p} puedeEscribir={puedeEscribir} />
      ))}
    </div>
  );
}
