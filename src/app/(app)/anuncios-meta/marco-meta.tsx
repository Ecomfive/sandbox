import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import type { DatosMeta } from "@/lib/meta-ads/datos";
import { BarraMeta } from "./barra-meta";
import { AvisoMigracion, SinCuentas } from "./piezas";

/** El marco de cada pestaña de Anuncios Meta: título (solo para lectores), barra de periodo y cuenta, y los avisos de lo que falta antes de mostrar números. */
export function MarcoMeta({ titulo, datos, escribe, hayToken, pais, soloContenidoSiHayCuentas = true, children }: { titulo: string; datos: DatosMeta; escribe: boolean; hayToken: boolean; pais: string; soloContenidoSiHayCuentas?: boolean; children: ReactNode }) {
  const sinCuentas = datos.cuentas.length === 0;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} oculto />
      {datos.faltaMigracion ? (
        <AvisoMigracion />
      ) : (
        <>
          <BarraMeta periodo={datos.periodo} cuentas={datos.cuentas} cuentaId={datos.cuentaId} escribe={escribe} hayToken={hayToken} desde={datos.desde} hasta={datos.hasta} />
          {sinCuentas && soloContenidoSiHayCuentas ? <SinCuentas pais={pais} puedeAgregar={escribe} /> : children}
        </>
      )}
    </Pagina>
  );
}
