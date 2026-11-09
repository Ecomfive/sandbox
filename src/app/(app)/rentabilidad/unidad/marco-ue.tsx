import type { ReactNode } from "react";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { Pagina } from "@/components/ui/pagina";
import type { UsuarioActual } from "@/lib/auth";
import { Selectores } from "../selectores";
import type { ContextoUE } from "./datos-ue";
import { SupuestosUE } from "./supuestos-ue";

export const puedeEditarUE = (u: UsuarioActual) => u.modulos.includes("rentabilidad") && !u.modulosSoloLectura.includes("rentabilidad");

/** La página de una pestaña de unidad económica: filtros de Rentabilidad, supuestos a la vista y el contenido. */
export function PaginaUE({
  titulo,
  ruta,
  ctx,
  puedeEditar,
  envioSupuesto,
  ordenes,
  actualizado,
  children,
}: {
  titulo: string;
  ruta: string;
  ctx: ContextoUE;
  puedeEditar: boolean;
  envioSupuesto: number;
  ordenes: number;
  actualizado?: string | null;
  children: ReactNode;
}) {
  const tiendas = ctx.datos.unidades.map((u) => ({ id: u.id, nombre: u.nombre }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <RecordarTienda {...ctx.recordar} />
      <EncabezadoAF4 titulo={titulo} filtros={<Selectores datos={ctx.datos} ruta={ruta} />} datosHasta={ctx.datosHasta} actualizado={actualizado} />
      {children}
      <SupuestosUE supuestos={ctx.supuestos} tiendas={tiendas} puedeEditar={puedeEditar} enviosSupuestos={envioSupuesto} ordenes={ordenes} />
    </Pagina>
  );
}

/** Sin el libro o sin las migraciones de la unidad económica. */
export function PaginaUEError({ titulo, error }: { titulo: string; error: string }) {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={titulo} imprimir={false} />
      <EstadoVacioAF4 titulo="No se pudo calcular la unidad económica">{error}</EstadoVacioAF4>
    </Pagina>
  );
}
