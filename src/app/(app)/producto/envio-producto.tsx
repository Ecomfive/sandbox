"use client";

import { useState, useTransition, type ReactNode } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Interruptor } from "../wms-productos/campos-producto";
import { guardarEnvio } from "./actions";
import { UNIDADES_MEDIDA, UNIDADES_PESO_ENVIO, type EnvioProducto } from "./def-producto";

const EMBALAJES = ["Caja pequeña", "Caja mediana", "Caja grande", "Sobre acolchado", "Bolsa"];
const claseBoton = `rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

/** Una fila del bloque: la etiqueta a la izquierda y el campo a la derecha (apilados en pantallas angostas). */
function Fila({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="flex items-center gap-1.5 text-sm">
        {etiqueta}
        {ayuda && (
          <Tooltip texto={ayuda}>
            <span tabIndex={0} role="img" aria-label={ayuda} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-muted-foreground/60 text-[10px] text-muted-foreground">
              i
            </span>
          </Tooltip>
        )}
      </span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

const aTexto = (n: number | null) => (n === null ? "" : String(n));

/**
 * El bloque «Envío» de la ficha de un producto, como el de Shopify: el interruptor «Producto físico» y, si lo es, el
 * embalaje, el tamaño ya empacado, el peso, el país de origen y el código SA. Sin el interruptor los campos quedan
 * apagados (se conservan por si se vuelve a encender). «Guardar» y «Descartar» aparecen solo con cambios.
 */
export function EnvioProductoBloque({ id, envio, puedeEscribir }: { id: string; envio: EnvioProducto; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inicial = {
    esFisico: envio.esFisico,
    embalaje: envio.embalaje ?? "",
    largo: aTexto(envio.largo),
    ancho: aTexto(envio.ancho),
    alto: aTexto(envio.alto),
    unidadMedida: envio.unidadMedida,
    peso: aTexto(envio.peso),
    unidadPeso: envio.unidadPeso,
    paisOrigen: envio.paisOrigen ?? "",
    codigoSa: envio.codigoSa ?? "",
  };
  const [d, setD] = useState(inicial);
  const set = (cambios: Partial<typeof d>) => setD((x) => ({ ...x, ...cambios }));
  const cambio = JSON.stringify(d) !== JSON.stringify(inicial);
  const apagado = !puedeEscribir || !d.esFisico || pendiente;

  function guardar() {
    setError(null);
    start(async () => {
      const r = await guardarEnvio(id, d);
      if (r.error) setError(r.error);
      else mostrarToast("Envío guardado");
    });
  }

  const numero = (campo: "largo" | "ancho" | "alto", letra: string, nombre: string) => (
    <label className="relative min-w-0 flex-1">
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        {letra}
      </span>
      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        aria-label={nombre}
        value={d[campo]}
        disabled={apagado}
        placeholder="0.0"
        onChange={(e) => set({ [campo]: e.target.value })}
        className={`${fieldClass} w-full pl-7 disabled:opacity-50`}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        Producto físico
        {puedeEscribir ? (
          <Interruptor etiqueta="Producto físico" activo={d.esFisico} alCambiar={(esFisico) => set({ esFisico })} />
        ) : (
          <span className="font-medium text-foreground">{d.esFisico ? "Sí" : "No"}</span>
        )}
      </div>

      <fieldset disabled={apagado} className={`m-0 flex flex-col gap-3 border-0 p-0 ${d.esFisico ? "" : "opacity-60"}`}>
        <legend className="sr-only">Datos de envío</legend>
        <Fila etiqueta="Embalaje">
          <input
            type="text"
            list="producto-embalajes"
            aria-label="Embalaje"
            maxLength={120}
            value={d.embalaje}
            placeholder="Ej: Caja pequeña"
            onChange={(e) => set({ embalaje: e.target.value })}
            className={`${fieldClass} w-full disabled:opacity-50`}
          />
          <datalist id="producto-embalajes">
            {EMBALAJES.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Fila>
        <Fila etiqueta="Tamaño empacado" ayuda="Largo, ancho y alto del producto ya empacado, listo para enviar.">
          {numero("largo", "L", "Largo")}
          <span aria-hidden="true" className="text-muted-foreground">
            ×
          </span>
          {numero("ancho", "A", "Ancho")}
          <span aria-hidden="true" className="text-muted-foreground">
            ×
          </span>
          {numero("alto", "H", "Alto")}
          <select aria-label="Unidad de medida" value={d.unidadMedida} onChange={(e) => set({ unidadMedida: e.target.value })} className={`${fieldClass} w-16 shrink-0 disabled:opacity-50`}>
            {UNIDADES_MEDIDA.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Fila>
        <Fila etiqueta="Peso" ayuda="Peso del producto con su empaque, para calcular el envío.">
          <input
            type="number"
            min={0}
            step="0.001"
            inputMode="decimal"
            aria-label="Peso"
            value={d.peso}
            placeholder="0.0"
            onChange={(e) => set({ peso: e.target.value })}
            className={`${fieldClass} min-w-0 flex-1 disabled:opacity-50`}
          />
          <select aria-label="Unidad de peso" value={d.unidadPeso} onChange={(e) => set({ unidadPeso: e.target.value })} className={`${fieldClass} w-16 shrink-0 disabled:opacity-50`}>
            {UNIDADES_PESO_ENVIO.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Fila>
        <Fila etiqueta="País de origen">
          <input
            type="text"
            aria-label="País de origen"
            maxLength={80}
            value={d.paisOrigen}
            placeholder="Ej: China"
            onChange={(e) => set({ paisOrigen: e.target.value })}
            className={`${fieldClass} w-full disabled:opacity-50`}
          />
        </Fila>
        <Fila etiqueta="Código SA" ayuda="Código del Sistema Armonizado para aduanas: 4 a 10 cifras, con o sin puntos.">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Código SA"
            maxLength={13}
            value={d.codigoSa}
            placeholder="Ej: 8424.89"
            onChange={(e) => set({ codigoSa: e.target.value })}
            className={`${fieldClass} w-full disabled:opacity-50`}
          />
        </Fila>
      </fieldset>

      {puedeEscribir && cambio && (
        <div className="flex gap-2">
          <button type="button" disabled={pendiente} onClick={guardar} className={`${claseBoton} border-foreground bg-foreground text-background hover:bg-foreground/90`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              setD(inicial);
              setError(null);
            }}
            className={claseBoton}
          >
            Descartar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
