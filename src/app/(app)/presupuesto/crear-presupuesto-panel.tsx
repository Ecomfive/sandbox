"use client";

import { useRouter } from "next/navigation";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { EtiquetaIcon } from "@/lib/nav-icons";
import { crearPresupuesto } from "./actions";
import { CamposGenerar, type DatosGenerar } from "./campos-generar";

/** «Agregar» de Presupuesto: nombre y supuestos; genera los tres escenarios desde el real y abre el presupuesto. */
export function CrearPresupuestoPanel({ datos }: { datos: DatosGenerar }) {
  const router = useRouter();
  return (
    <FichaCrear
      titulo="Nuevo presupuesto"
      etiquetaCrear="Generar presupuesto"
      mensajeExito="Presupuesto generado"
      abrirConNuevo
      action={async (formData) => {
        const r = await crearPresupuesto(formData);
        if (r.id) router.push(`/presupuesto/${r.id}`);
        return r;
      }}
    >
      {(ayuda) => (
        <>
          <Seccion icono={EtiquetaIcon} titulo="Presupuesto">
            <Campo etiqueta="Nombre" id="campo-nombre" obligatorio faltante={ayuda.faltante}>
              <input
                id="campo-nombre"
                name="nombre"
                required
                maxLength={120}
                data-enfocar
                aria-invalid={ayuda.invalido("campo-nombre")}
                placeholder={`Ej: Presupuesto ${datos.anio}`}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Notas" id="campo-notas">
              <textarea id="campo-notas" name="notas" rows={2} maxLength={2000} placeholder="Ej: Versión para la junta de socios" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <CamposGenerar datos={datos} ayuda={ayuda} />
        </>
      )}
    </FichaCrear>
  );
}
