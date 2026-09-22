"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, GastoIcon } from "@/lib/nav-icons";
import { registrarGasto } from "./actions";
import { CATEGORIAS } from "./def-gastos";

const hoy = () => new Date().toISOString().slice(0, 10);

/** «Agregar» de Gastos: la ficha para registrar un gasto (categoría, descripción, monto y fecha). */
export function CrearGastoPanel({ paisId }: { paisId: string }) {
  return (
    <FichaCrear
      titulo="Nuevo gasto"
      etiquetaCrear="Registrar gasto"
      action={registrarGasto}
      mensajeExito="Gasto registrado"
      ocultos={{ pais_id: paisId }}
      abrirConNuevo
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={GastoIcon} titulo="Gasto">
            <Campo etiqueta="Categoría" id="campo-categoria" obligatorio faltante={faltante}>
              <select
                id="campo-categoria"
                name="categoria"
                required
                data-enfocar
                aria-invalid={invalido("campo-categoria")}
                defaultValue={CATEGORIAS[0].valor}
                className={`${fieldClass} w-full`}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Descripción" id="campo-descripcion" obligatorio faltante={faltante}>
              <input
                id="campo-descripcion"
                type="text"
                name="descripcion"
                required
                aria-invalid={invalido("campo-descripcion")}
                placeholder="Ej: Pago de nómina quincenal"
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>

          <Seccion icono={CalendarioIcon} titulo="Monto y fecha">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Monto" id="campo-monto" obligatorio faltante={faltante}>
                <input
                  id="campo-monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="monto"
                  required
                  aria-invalid={invalido("campo-monto")}
                  placeholder="Ej: 250.00"
                  className={`${fieldClass} w-full tabular-nums`}
                />
              </Campo>
              <Campo etiqueta="Fecha" id="campo-fecha" obligatorio faltante={faltante}>
                <input
                  id="campo-fecha"
                  type="date"
                  name="fecha"
                  required
                  aria-invalid={invalido("campo-fecha")}
                  defaultValue={hoy()}
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            </div>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
