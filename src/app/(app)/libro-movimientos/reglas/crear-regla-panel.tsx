"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { ExtractoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { useState } from "react";
import { crearRegla } from "../clasificar-actions";
import { VistaPrevia } from "../ofrecer-regla";

/** «Agregar» de Reglas: si la descripción contiene este texto, la tienda y/o el tipo son estos. */
export function CrearReglaPanel({ tiendas, tipos }: { tiendas: Opcion[]; tipos: Opcion[] }) {
  const [vista, setVista] = useState({ patron: "", unidad: "", tipo: "" });
  return (
    <FichaCrear titulo="Nueva regla" etiquetaCrear="Crear regla" action={crearRegla} mensajeExito="Regla creada" abrirConNuevo alAbrir={() => setVista({ patron: "", unidad: "", tipo: "" })}>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ExtractoIcon} titulo="Cuando la descripción contiene">
            <Campo etiqueta="Texto" id="campo-patron" obligatorio faltante={faltante}>
              <input
                id="campo-patron"
                name="patron"
                required
                minLength={3}
                maxLength={120}
                data-enfocar
                aria-invalid={invalido("campo-patron")}
                placeholder="Ej: COMISION TRANSACCIONES YAPPY"
                onChange={(e) => setVista((v) => ({ ...v, patron: e.target.value }))}
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>
          <Seccion icono={TiendaIcon} titulo="Entonces">
            <Campo etiqueta="Tienda" id="campo-unidad" faltante={faltante}>
              <select id="campo-unidad" name="unidad_id" defaultValue="" onChange={(e) => setVista((v) => ({ ...v, unidad: e.target.value }))} className={`${fieldClass} w-full`}>
                <option value="">(no cambia)</option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tipo" id="campo-tipo" faltante={faltante}>
              <select id="campo-tipo" name="tipo_id" defaultValue="" onChange={(e) => setVista((v) => ({ ...v, tipo: e.target.value }))} className={`${fieldClass} w-full`}>
                <option value="">(no cambia)</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <VistaPrevia patron={vista.patron} unidadId={vista.unidad || null} tipoId={vista.tipo || null} />
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
