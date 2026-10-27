"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import type { ProductoSinPublicacion } from "@/lib/publicaciones/sin-publicacion";
import { crearDesdeDropi, vincularADropi } from "./sin-publicacion-actions";

const boton = `inline-flex min-h-9 shrink-0 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${anilloFoco}`;
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Panama" }) : null);

/** Una publicación del país sin ID de Dropi, a la que se le puede poner el de un producto que está en Dropi sin publicación. */
export interface PublicacionSinId {
  id: string;
  numero: number | null;
  nombre: string;
}

/**
 * «N productos en Dropi sin publicación» (26 oct 2026, pedido de Alcides): lo que alguien publicó directo en Dropi y no está en ninguna
 * publicación del país (desde el 24 oct la lectura de «Mis productos» ya no las crea sola). Pulsarlo abre la lista; quien puede editar
 * crea su publicación (con los datos de una parecida, si es una republicación) o le pone el ID a una publicación que aún no lo tiene.
 */
export function AvisoSinPublicacion({ productos, sinId, puedeEscribir }: { productos: ProductoSinPublicacion[]; sinId: PublicacionSinId[]; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState(false);
  if (!productos.length) return null;
  const n = productos.length;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={`inline-flex items-center gap-1.5 rounded text-left font-medium text-foreground underline-offset-4 hover:underline hover:decoration-dotted ${anilloFoco}`}
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
        {`${n} ${n === 1 ? "producto" : "productos"} en Dropi sin publicación`}
      </button>
      <Ventana abierto={abierta} alCerrar={() => setAbierta(false)} titulo="En Dropi sin publicación" ancho="lg">
        <div className="flex flex-col gap-4 p-5 text-sm">
          <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
            {productos.map((p) => (
              <ProductoSinPublicacionFila key={p.dropiId} p={p} sinId={sinId} puedeEscribir={puedeEscribir} />
            ))}
          </ul>
          <div>
            <button type="button" onClick={() => setAbierta(false)} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              Cerrar
            </button>
          </div>
        </div>
      </Ventana>
    </>
  );
}

function ProductoSinPublicacionFila({ p, sinId, puedeEscribir }: { p: ProductoSinPublicacion; sinId: PublicacionSinId[]; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [trabajando, empezar] = useTransition();
  const [copiarDe, setCopiarDe] = useState("");
  const [vincularA, setVincularA] = useState("");
  const creado = fecha(p.creado);
  const datos = [`ID ${p.dropiId}`, p.bodega !== null ? codigoBodega(p.bodega) : "Sin bodega", `${p.stock.toLocaleString("es-PA")} u.`, p.precio !== null ? `$${p.precio.toFixed(2)}` : null, creado ? `creado ${creado}` : null].filter(Boolean);

  function correr(accion: () => Promise<{ error?: string; detalle?: string }>) {
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      if (r.error) return void mostrarToast(r.error, "destructive");
      mostrarToast(r.detalle ?? "Listo");
    });
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3" aria-busy={trabajando || undefined}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="m-0 min-w-0 font-medium">{p.nombre}</p>
        {p.privado && <Badge>Privado</Badge>}
      </div>
      <p className="m-0 text-xs text-muted-foreground tabular-nums">{datos.join(" · ")}</p>
      {p.parecidas.length > 0 && (
        <p className="m-0 text-xs">
          <span className="text-muted-foreground">Se parece a </span>
          {p.parecidas.map((x, i) => (
            <span key={x.id}>
              {i > 0 && <span className="text-muted-foreground">, </span>}
              <span className="font-medium">{numeroPublicacion(x.numero)}</span> {x.nombre}
              {x.archivada && <span className="text-muted-foreground"> (archivada)</span>}
            </span>
          ))}
        </p>
      )}
      {puedeEscribir && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pt-1">
          <div className="flex flex-wrap items-end gap-2">
            {p.parecidas.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Copiar datos de</span>
                <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} disabled={trabajando} className={`${fieldClassSm} max-w-64`}>
                  <option value="">Ninguna: publicación nueva</option>
                  {p.parecidas.map((x) => (
                    <option key={x.id} value={x.id}>
                      {`${numeroPublicacion(x.numero)} · ${x.nombre}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={trabajando}
              onClick={() => correr(() => crearDesdeDropi(p.dropiId, copiarDe || null))}
              aria-label={`Crear la publicación de ${p.nombre}`}
              className={`${boton} bg-foreground text-background hover:opacity-90`}
            >
              {trabajando ? "Guardando…" : "Crear publicación"}
            </button>
          </div>
          {sinId.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>O vincular a una sin ID</span>
                <select value={vincularA} onChange={(e) => setVincularA(e.target.value)} disabled={trabajando} className={`${fieldClassSm} max-w-64`}>
                  <option value="">Elegir publicación</option>
                  {sinId.map((x) => (
                    <option key={x.id} value={x.id}>
                      {`${numeroPublicacion(x.numero)} · ${x.nombre}`}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={trabajando || !vincularA}
                onClick={() => correr(() => vincularADropi(p.dropiId, vincularA))}
                aria-label={`Vincular ${p.nombre} a la publicación elegida`}
                className={`${boton} border border-border-control bg-card hover:bg-muted`}
              >
                Vincular
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
