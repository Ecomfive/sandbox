"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, ExtractoIcon, PersonaIcon } from "@/lib/nav-icons";
import { crearDocumentoCartera } from "@/lib/finanzas/cartera-actions";
import { hoyPanama, type Clase } from "@/lib/finanzas/cxc-cxp";
import type { Opcion } from "@/lib/finanzas/cargar-cartera";

/** «Agregar» de una cartera: un documento por cobrar o por pagar cargado a mano. */
export function CrearDocumentoPanel({ clase, unidades, contrapartes }: { clase: Clase; unidades: Opcion[]; contrapartes: string[] }) {
  const quien = clase === "cobrar" ? "Cliente o deudor" : "Acreedor";
  const lista = `contrapartes-${clase}`;
  return (
    <FichaCrear
      titulo={clase === "cobrar" ? "Nueva cuenta por cobrar" : "Nueva cuenta por pagar"}
      etiquetaCrear="Crear documento"
      action={crearDocumentoCartera}
      mensajeExito="Documento creado"
      ocultos={{ clase }}
      abrirConNuevo
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PersonaIcon} titulo={quien}>
            <Campo etiqueta={quien} id="campo-contraparte" obligatorio faltante={faltante}>
              <input
                id="campo-contraparte"
                name="contraparte"
                required
                maxLength={160}
                list={lista}
                autoComplete="off"
                data-enfocar
                aria-invalid={invalido("campo-contraparte")}
                placeholder={clase === "cobrar" ? "Ej: Distribuidora Norte" : "Ej: Importadora del Istmo"}
                className={`${fieldClass} w-full`}
              />
              <datalist id={lista}>
                {contrapartes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo etiqueta="Tienda" id="campo-unidad-cartera">
              <select id="campo-unidad-cartera" name="unidad_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin tienda</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
          <Seccion icono={ExtractoIcon} titulo="Documento">
            <Campo etiqueta="Factura o documento" id="campo-documento">
              <input id="campo-documento" name="documento" maxLength={80} autoComplete="off" placeholder="Ej: FACT-1001" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Motivo" id="campo-motivo">
              <input id="campo-motivo" name="motivo" maxLength={300} autoComplete="off" placeholder="Ej: Envío de mercancía" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Monto (USD)" id="campo-monto-cartera" obligatorio faltante={faltante}>
              <input
                id="campo-monto-cartera"
                name="monto"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                aria-invalid={invalido("campo-monto-cartera")}
                placeholder="Ej: 1500.00"
                className={`${fieldClass} w-full tabular-nums`}
              />
            </Campo>
            <Campo etiqueta="Notas" id="campo-notas-cartera">
              <textarea id="campo-notas-cartera" name="notas" rows={2} maxLength={1000} className={`${fieldClass} w-full resize-y`} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Fechas">
            <Campo etiqueta="Fecha" id="campo-fecha-cartera" obligatorio faltante={faltante}>
              <input id="campo-fecha-cartera" name="fecha" type="date" required defaultValue={hoyPanama()} aria-invalid={invalido("campo-fecha-cartera")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Vencimiento" id="campo-vencimiento-cartera">
              <input id="campo-vencimiento-cartera" name="vencimiento" type="date" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
