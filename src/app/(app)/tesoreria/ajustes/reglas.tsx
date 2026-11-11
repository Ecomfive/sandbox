"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass, labelClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CATEGORIAS_PAGO, PRIORIDADES, esCategoriaPago, etiquetaCategoria, etiquetaPrioridad, type Prioridad } from "@/lib/finanzas/pagos";
import { EtiquetaIcon, PrioridadIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import { crearReglaPrioridad, eliminarReglaPrioridad } from "../actions";
import { ConfirmarEnFila } from "../confirmar-en-fila";
import { TONO_PRIORIDAD } from "../pagos/vista-pagos";

export interface FilaRegla {
  id: string;
  ambito: "categoria" | "contraparte";
  valor: string;
  prioridad: Prioridad;
}

const nombreRegla = (r: FilaRegla) => (r.ambito === "categoria" && esCategoriaPago(r.valor) ? etiquetaCategoria(r.valor) : r.valor);

const DEF: DefTabla<FilaRegla> = {
  clave: "tesoreria-prioridades",
  campos: [
    { id: "ambito", etiqueta: "Por", tipo: "seleccion", valores: (r) => [r.ambito === "categoria" ? "Categoría" : "Proveedor"], agrupable: true },
    { id: "valor", etiqueta: "Para", tipo: "texto", valor: nombreRegla },
    { id: "prioridad", etiqueta: "Prioridad", tipo: "seleccion", valores: (r) => [etiquetaPrioridad(r.prioridad)], agrupable: true },
  ],
  vistaInicial: { agrupar: "ambito" },
};
const COLUMNAS: ColumnaTabla<FilaRegla, null>[] = [
  { id: "valor", label: "Para", ocultable: false, render: nombreRegla },
  { id: "prioridad", label: "Prioridad", ocultable: false, render: (r) => <Badge tone={TONO_PRIORIDAD[r.prioridad]}>{etiquetaPrioridad(r.prioridad)}</Badge> },
];
const ICONOS: Record<string, IconoComp> = { ambito: EtiquetaIcon, valor: EtiquetaIcon, prioridad: PrioridadIcon };

function NuevaRegla() {
  const [ambito, setAmbito] = useState<"categoria" | "contraparte">("contraparte");
  return (
    <FichaCrear titulo="Nueva prioridad" etiquetaCrear="Guardar prioridad" action={crearReglaPrioridad} mensajeExito="Prioridad guardada" alAbrir={() => setAmbito("contraparte")}>
      {({ faltante, invalido }) => (
        <Seccion icono={PrioridadIcon} titulo="Prioridad">
          <fieldset className="flex flex-col gap-1">
            <legend className={labelClass}>Por</legend>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="ambito" value="contraparte" checked={ambito === "contraparte"} onChange={() => setAmbito("contraparte")} />
                Proveedor
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="ambito" value="categoria" checked={ambito === "categoria"} onChange={() => setAmbito("categoria")} />
                Categoría
              </label>
            </div>
          </fieldset>
          {ambito === "contraparte" ? (
            <Campo etiqueta="Proveedor" id="regla-contraparte" obligatorio faltante={faltante}>
              <input id="regla-contraparte" name="contraparte" required maxLength={160} data-enfocar aria-invalid={invalido("regla-contraparte")} placeholder="Ej: Proveedor Ejemplo, S.A." className={`${fieldClass} w-full`} />
            </Campo>
          ) : (
            <Campo etiqueta="Categoría" id="regla-categoria" obligatorio faltante={faltante}>
              <select id="regla-categoria" name="categoria" required defaultValue="" aria-invalid={invalido("regla-categoria")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige una categoría
                </option>
                {CATEGORIAS_PAGO.map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Prioridad" id="regla-prioridad" obligatorio faltante={faltante}>
            <select id="regla-prioridad" name="prioridad" required defaultValue="" aria-invalid={invalido("regla-prioridad")} className={`${fieldClass} w-full`}>
              <option value="" disabled>
                Elige la prioridad
              </option>
              {PRIORIDADES.map((p) => (
                <option key={p.clave} value={p.clave}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

export function TablaReglas({ filas, puedeEscribir }: { filas: FilaRegla[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "prioridad", plural: "prioridades" }}
      claveFila={(r) => r.id}
      accionPrincipal={puedeEscribir ? <NuevaRegla /> : undefined}
      accion={puedeEscribir ? { etiqueta: "Eliminar", render: (r) => <ConfirmarEnFila etiqueta="Eliminar" ariaLabel={`Eliminar la prioridad de ${nombreRegla(r)}`} hecho="Prioridad eliminada" ejecutar={() => eliminarReglaPrioridad(r.id)} /> } : undefined}
      ariaLabel="Prioridades de pago"
      vacio="Sin prioridades propias: cada categoría usa la suya."
    />
  );
}
