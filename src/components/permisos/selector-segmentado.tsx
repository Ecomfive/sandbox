"use client";

import type { ComponentType } from "react";
import { CandadoIcon, LapizIcon, OjoIcon, OjoTachadoIcon } from "@/lib/nav-icons";
import type { Nivel } from "@/lib/permisos/catalogo";

export type TonoSegmento = "neutro" | "lectura" | "edicion" | "oculto";

export interface OpcionSegmento<T extends string> {
  valor: T;
  etiqueta: string;
  icono?: ComponentType<{ className?: string }>;
  tono: TonoSegmento;
  deshabilitada?: boolean;
}

// El segmento elegido se rellena con su color; los demás quedan en gris. Además del color, cada nivel lleva su ícono y su texto.
const ELEGIDO: Record<TonoSegmento, string> = {
  neutro: "has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm",
  lectura: "has-checked:bg-nivel-lectura has-checked:text-white",
  edicion: "has-checked:bg-nivel-edicion has-checked:text-white",
  oculto: "has-checked:bg-foreground has-checked:text-background",
};

/**
 * Selector de varias opciones en una fila (tres botones pegados), hecho con botones de radio de verdad: se maneja con las flechas,
 * el lector de pantalla lo lee como un grupo con su leyenda y la opción elegida se marca por texto, ícono y color.
 */
export function SelectorSegmentado<T extends string>({
  nombre,
  leyenda,
  valor,
  opciones,
  alCambiar,
  deshabilitado = false,
  anchoCompleto = false,
}: {
  nombre: string;
  /** Lo que nombra al grupo para quien no lo ve («Acceso a Compras»). */
  leyenda: string;
  valor: T;
  opciones: OpcionSegmento<T>[];
  alCambiar: (valor: T) => void;
  deshabilitado?: boolean;
  anchoCompleto?: boolean;
}) {
  return (
    <fieldset className={`m-0 min-w-0 border-0 p-0 ${anchoCompleto ? "w-full" : ""}`}>
      <legend className="sr-only">{leyenda}</legend>
      <div className={`gap-0.5 rounded-[11px] border border-border bg-muted p-[3px] ${anchoCompleto ? "flex w-full" : "inline-flex"}`}>
        {opciones.map((o) => {
          const Icono = o.icono;
          const apagada = deshabilitado || o.deshabilitada;
          return (
            <label
              key={o.valor}
              className={`relative inline-flex h-[30px] items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground transition-colors ${
                anchoCompleto ? "flex-1" : ""
              } ${ELEGIDO[o.tono]} ${apagada ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-foreground has-checked:hover:text-inherit"} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primario`}
            >
              <input
                type="radio"
                name={nombre}
                value={o.valor}
                checked={valor === o.valor}
                disabled={apagada}
                onChange={() => alCambiar(o.valor)}
                className="absolute inset-0 m-0 h-full w-full cursor-[inherit] opacity-0"
              />
              {Icono && <Icono className="h-3.5 w-3.5" />}
              {o.etiqueta}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Los tres niveles de acceso a un módulo: sin acceso, solo lectura y edición. */
export function SelectorNivel({
  nombre,
  modulo,
  valor,
  alCambiar,
  deshabilitado,
  anchoCompleto,
  sinIconos = false,
}: {
  nombre: string;
  modulo: string;
  valor: Nivel;
  alCambiar: (nivel: Nivel) => void;
  deshabilitado?: boolean;
  anchoCompleto?: boolean;
  sinIconos?: boolean;
}) {
  return (
    <SelectorSegmentado<Nivel>
      nombre={nombre}
      leyenda={`Acceso a ${modulo}`}
      valor={valor}
      alCambiar={alCambiar}
      deshabilitado={deshabilitado}
      anchoCompleto={anchoCompleto}
      opciones={[
        { valor: "n", etiqueta: "Sin acceso", tono: "neutro", icono: sinIconos ? undefined : OjoTachadoIcon },
        { valor: "r", etiqueta: "Solo lectura", tono: "lectura", icono: sinIconos ? undefined : OjoIcon },
        { valor: "w", etiqueta: "Edición", tono: "edicion", icono: sinIconos ? undefined : LapizIcon },
      ]}
    />
  );
}

export type ValorCampo = "editar" | "ver" | "oculto";

/** Los tres niveles de un campo: editar, solo ver u oculto. */
export function SelectorCampo({
  nombre,
  campo,
  valor,
  alCambiar,
  editable = true,
  ocultable = true,
  deshabilitado,
}: {
  nombre: string;
  campo: string;
  valor: ValorCampo;
  alCambiar: (valor: ValorCampo) => void;
  editable?: boolean;
  ocultable?: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <SelectorSegmentado<ValorCampo>
      nombre={nombre}
      leyenda={`Acceso al campo ${campo}`}
      valor={valor}
      alCambiar={alCambiar}
      deshabilitado={deshabilitado}
      opciones={[
        { valor: "editar", etiqueta: "Editar", tono: "edicion", icono: LapizIcon, deshabilitada: !editable },
        { valor: "ver", etiqueta: "Solo ver", tono: "lectura", icono: CandadoIcon },
        { valor: "oculto", etiqueta: "Oculto", tono: "oculto", icono: OjoTachadoIcon, deshabilitada: !ocultable },
      ]}
    />
  );
}
