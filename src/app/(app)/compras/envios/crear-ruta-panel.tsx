"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { ComprasIcon, GastoIcon } from "@/lib/nav-icons";
import { crearRuta } from "./actions";
import { CamposRuta } from "./campos-ruta";

/** «Agregar» de Envíos: una ruta nueva (un agente para un país por una vía), con su tarifa General si ya se sabe. */
export function CrearRutaPanel({ agentes }: { agentes: string[] }) {
  return (
    <FichaCrear titulo="Nueva ruta de envío" etiquetaCrear="Crear ruta" action={crearRuta} mensajeExito="Ruta creada">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ComprasIcon} titulo="Ruta">
            <CamposRuta agentes={agentes} faltante={faltante} invalido={invalido} />
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Tarifa General">
            <Campo etiqueta="Precio (USD, por CBM en marítimo o por kg en aéreo)" id="ruta-tarifa-nueva">
              <input id="ruta-tarifa-nueva" type="number" name="tarifa_precio" min={0} step="0.01" placeholder="Ej: 750" className={`${fieldClass} tabular-nums`} />
            </Campo>
          </Seccion>
          <Seccion icono={ComprasIcon} titulo="Nota">
            <Campo etiqueta="Nota" id="ruta-nota-nueva">
              <textarea id="ruta-nota-nueva" name="nota" rows={3} maxLength={2000} className={`${fieldClass} resize-y`} />
            </Campo>
            <Campo etiqueta="Enlace" id="ruta-url-nueva">
              <input id="ruta-url-nueva" type="url" name="url" placeholder="Ej: https://…" className={fieldClass} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
