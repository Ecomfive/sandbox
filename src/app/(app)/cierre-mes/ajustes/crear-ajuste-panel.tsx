"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, EtiquetaIcon, TiendaIcon } from "@/lib/nav-icons";
import { CLASES_AJUSTE, ETIQUETA_CLASE_AJUSTE, type ClaseAjuste } from "@/lib/finanzas/ajustes-cierre";
import { crearAjuste, crearPrepago } from "./actions";

export interface Opcion {
  id: string;
  nombre: string;
}

function SelectorOpciones({ id, name, opciones, vacio, invalido, obligatorio = true }: { id: string; name: string; opciones: Opcion[]; vacio: string; invalido?: true; obligatorio?: boolean }) {
  return (
    <select id={id} name={name} required={obligatorio} defaultValue="" aria-invalid={invalido} className={`${fieldClass} w-full`}>
      <option value="" disabled={obligatorio}>
        {vacio}
      </option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  );
}

/** «Agregar» de los asientos de ajuste: provisión, devengo, reclasificación u otro, escrito a mano. */
export function CrearAjustePanel({ periodo, mes, unidades, tipos }: { periodo: string; mes: string; unidades: Opcion[]; tipos: Opcion[] }) {
  const [clase, setClase] = useState<ClaseAjuste>("provision");
  const reclas = clase === "reclasificacion";
  return (
    <FichaCrear
      titulo={`Nuevo ajuste de ${mes}`}
      etiquetaCrear="Agregar ajuste"
      action={crearAjuste}
      mensajeExito="Ajuste agregado"
      ocultos={{ periodo }}
      alAbrir={() => setClase("provision")}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={EtiquetaIcon} titulo="Ajuste">
            <Campo etiqueta="Clase" id="campo-clase" obligatorio faltante={faltante}>
              <select id="campo-clase" name="clase" required value={clase} onChange={(e) => setClase(e.target.value as ClaseAjuste)} className={`${fieldClass} w-full`}>
                {CLASES_AJUSTE.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CLASE_AJUSTE[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Concepto" id="campo-concepto" obligatorio faltante={faltante}>
              <input id="campo-concepto" name="concepto" required maxLength={200} data-enfocar aria-invalid={invalido("campo-concepto")} placeholder="Ej: Factura de luz de septiembre que llega en octubre" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta={reclas ? "Monto que pasa al destino (USD)" : "Monto en USD (negativo para reversar)"} id="campo-monto" obligatorio faltante={faltante}>
              <input id="campo-monto" name="monto" required inputMode="decimal" aria-invalid={invalido("campo-monto")} placeholder="Ej: 350.00" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={TiendaIcon} titulo={reclas ? "Origen" : "Dónde"}>
            <Campo etiqueta="Tienda" id="campo-unidad" obligatorio faltante={faltante}>
              <SelectorOpciones id="campo-unidad" name="unidad_id" opciones={unidades} vacio="Elige la tienda" invalido={invalido("campo-unidad")} />
            </Campo>
            <Campo etiqueta="Tipo" id="campo-tipo" obligatorio faltante={faltante}>
              <SelectorOpciones id="campo-tipo" name="tipo_id" opciones={tipos} vacio="Elige el tipo" invalido={invalido("campo-tipo")} />
            </Campo>
          </Seccion>
          {reclas && (
            <Seccion icono={TiendaIcon} titulo="Destino">
              <Campo etiqueta="Tienda de destino" id="campo-unidad-destino" faltante={faltante}>
                <SelectorOpciones id="campo-unidad-destino" name="unidad_destino_id" opciones={unidades} vacio="La misma tienda" obligatorio={false} />
              </Campo>
              <Campo etiqueta="Tipo de destino" id="campo-tipo-destino" faltante={faltante}>
                <SelectorOpciones id="campo-tipo-destino" name="tipo_destino_id" opciones={tipos} vacio="El mismo tipo" obligatorio={false} />
              </Campo>
            </Seccion>
          )}
          <Seccion icono={CalendarioIcon} titulo="Notas">
            <Campo etiqueta="Notas" id="campo-notas" faltante={faltante}>
              <textarea id="campo-notas" name="notas" rows={2} maxLength={1000} placeholder="Ej: estimado con la factura del mes anterior" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

/** «Agregar» de los gastos prepagados. */
export function CrearPrepagoPanel({ unidades, tipos, meses }: { unidades: Opcion[]; tipos: Opcion[]; meses: { valor: string; etiqueta: string }[] }) {
  return (
    <FichaCrear titulo="Nuevo gasto prepagado" etiquetaCrear="Agregar gasto prepagado" action={crearPrepago} mensajeExito="Gasto prepagado agregado">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={EtiquetaIcon} titulo="Gasto">
            <Campo etiqueta="Concepto" id="campo-concepto" obligatorio faltante={faltante}>
              <input id="campo-concepto" name="concepto" required maxLength={120} data-enfocar aria-invalid={invalido("campo-concepto")} placeholder="Ej: Seguro de la oficina 2027" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Monto pagado (USD)" id="campo-monto" obligatorio faltante={faltante}>
              <input id="campo-monto" name="monto" required inputMode="decimal" aria-invalid={invalido("campo-monto")} placeholder="Ej: 1200.00" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Tienda" id="campo-unidad" obligatorio faltante={faltante}>
              <SelectorOpciones id="campo-unidad" name="unidad_id" opciones={unidades} vacio="Elige la tienda" invalido={invalido("campo-unidad")} />
            </Campo>
            <Campo etiqueta="Tipo de gasto" id="campo-tipo" obligatorio faltante={faltante}>
              <SelectorOpciones id="campo-tipo" name="tipo_id" opciones={tipos} vacio="Elige el tipo" invalido={invalido("campo-tipo")} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Reparto">
            <Campo etiqueta="Primer mes que cubre" id="campo-desde" obligatorio faltante={faltante}>
              <select id="campo-desde" name="desde" required defaultValue="" aria-invalid={invalido("campo-desde")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige el mes
                </option>
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Meses" id="campo-meses" obligatorio faltante={faltante}>
              <input id="campo-meses" name="meses" type="number" min={1} max={60} required defaultValue={12} aria-invalid={invalido("campo-meses")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Mes del pago" id="campo-pago" faltante={faltante}>
              <select id="campo-pago" name="periodo_pago" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">El primer mes que cubre</option>
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="El pago ya está en el EERR del libro" id="campo-eerr" faltante={faltante}>
              <select id="campo-eerr" name="pago_en_eerr" defaultValue="si" className={`${fieldClass} w-full`}>
                <option value="si">Sí: el mes del pago lleva un ajuste que lo saca</option>
                <option value="no">No: se cargó con EERR = NO</option>
              </select>
            </Campo>
            <Campo etiqueta="Notas" id="campo-notas" faltante={faltante}>
              <textarea id="campo-notas" name="notas" rows={2} maxLength={1000} placeholder="Ej: póliza 123, vence el 31 oct 2027" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
