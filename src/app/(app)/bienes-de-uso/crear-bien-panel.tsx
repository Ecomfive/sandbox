"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, InventarioIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { TIPOS_BIEN, VIDA_UTIL, type TipoBien } from "@/lib/finanzas/bienes-uso";
import { crearBien } from "./actions";

/** «Agregar» de Bienes de uso: un bien con su alta, importe y vida útil (sugerida según el tipo, como la tabla del Excel). */
export function CrearBienPanel({ tiendas }: { tiendas: Opcion[] }) {
  const [tipo, setTipo] = useState<TipoBien | "">("");
  return (
    <FichaCrear titulo="Nuevo bien de uso" etiquetaCrear="Registrar bien" action={crearBien} mensajeExito="Bien registrado" abrirConNuevo alAbrir={() => setTipo("")}>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={InventarioIcon} titulo="Bien">
            <Campo etiqueta="Descripción" id="bien-descripcion" obligatorio faltante={faltante}>
              <input
                id="bien-descripcion"
                name="descripcion"
                required
                maxLength={300}
                data-enfocar
                aria-invalid={invalido("bien-descripcion")}
                placeholder="Ej: Laptop para despacho"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Tipo de bien" id="bien-tipo" obligatorio faltante={faltante}>
              <select
                id="bien-tipo"
                name="tipo"
                required
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoBien)}
                aria-invalid={invalido("bien-tipo")}
                className={`${fieldClass} w-full`}
              >
                <option value="" disabled>
                  Elegir tipo
                </option>
                {TIPOS_BIEN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tienda" id="bien-unidad">
              <select id="bien-unidad" name="unidad_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">A DISTRIBUIR</option>
                {tiendas
                  .filter((t) => t.nombre !== "A DISTRIBUIR")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
              </select>
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Alta y depreciación">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Fecha de alta" id="bien-alta" obligatorio faltante={faltante}>
                <input id="bien-alta" name="fecha_alta" type="date" required aria-invalid={invalido("bien-alta")} className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Importe (USD)" id="bien-importe" obligatorio faltante={faltante} mensaje="Debe ser mayor a cero">
                <input
                  id="bien-importe"
                  name="importe"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  aria-invalid={invalido("bien-importe")}
                  placeholder="Ej: 680.00"
                  className={`${fieldClass} w-full tabular-nums`}
                />
              </Campo>
              <Campo etiqueta="Vida útil (meses)" id="bien-meses">
                <input
                  id="bien-meses"
                  name="meses_vida"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="600"
                  step="1"
                  key={tipo}
                  defaultValue={tipo ? VIDA_UTIL[tipo] : ""}
                  placeholder="Ej: 60"
                  className={`${fieldClass} w-full tabular-nums`}
                />
              </Campo>
              <Campo etiqueta="Valor residual (USD)" id="bien-residual">
                <input id="bien-residual" name="valor_residual" type="number" inputMode="decimal" step="0.01" min="0" placeholder="Ej: 0.00" className={`${fieldClass} w-full tabular-nums`} />
              </Campo>
            </div>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
