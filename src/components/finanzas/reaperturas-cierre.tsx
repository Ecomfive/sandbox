import Link from "next/link";
import { TablaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { anilloFoco } from "@/components/ui/field";
import { fechaHora, mesMedio } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { nombresDePersonas } from "@/lib/finanzas/cargar-cierre";
import { cargarReaperturas } from "@/lib/finanzas/cargar-cierre-control";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Las últimas reaperturas de meses cerrados (quién, cuándo y por qué), para el Panel financiero. Se carga sola (componente
 * de servidor); sin la migración 0927 o sin reaperturas no se dibuja. Quien la incluye comprueba el módulo Cierre de mes.
 */
export async function ReaperturasCierre({ limite = 10 }: { limite?: number }) {
  const supabase = createServiceClient();
  const r = await cargarReaperturas(supabase, limite);
  if ("error" in r || !r.length) return null;
  const nombres = await nombresDePersonas(supabase, r.flatMap((x) => [x.reabiertoPor, x.cerradoPor]));
  const quien = (id: string | null) => (id ? (nombres.get(id) ?? "—") : "—");
  return (
    <TablaComparacionAF4
      id="titulo-reaperturas-panel"
      titulo={
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          Meses reabiertos
        </span>
      }
      detalle={`Últimas ${entero(r.length)}`}
      ariaLabel="Reaperturas de meses cerrados"
      etiquetaConcepto="Mes"
      columnas={[
        { clave: "cuando", etiqueta: "Reabierto", numerica: false },
        { clave: "quien", etiqueta: "Por", numerica: false },
        { clave: "motivo", etiqueta: "Motivo", numerica: false },
        { clave: "cerrado", etiqueta: "Lo había cerrado", numerica: false },
      ]}
      filas={r.map((x) => ({
        clave: x.id,
        etiqueta: (
          <Link href={`/cierre-mes/${x.periodo.slice(0, 7)}`} className={`underline-offset-2 hover:underline ${anilloFoco}`}>
            {mesMedio(x.periodo)}
          </Link>
        ),
        celdas: [fechaHora(x.reabiertoEn), quien(x.reabiertoPor), x.motivo, x.cerradoPor ? quien(x.cerradoPor) : "—"],
      }))}
    />
  );
}
