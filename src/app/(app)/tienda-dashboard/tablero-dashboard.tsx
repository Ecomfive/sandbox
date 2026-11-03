"use client";

import { Indicador, TableroIndicadores } from "@/components/panel/piezas-panel";
import type { Color } from "@/components/panel/colores-tablero";
import { AlertaIcon, CerrarIcon, CheckIcon, DeshacerIcon, EnvioIcon, InventarioIcon, PedidoIcon, VentasIcon, WalletIcon } from "@/lib/nav-icons";

const ICONOS = { pedido: PedidoIcon, check: CheckIcon, envio: EnvioIcon, cerrar: CerrarIcon, deshacer: DeshacerIcon, inventario: InventarioIcon, ventas: VentasIcon, wallet: WalletIcon, alerta: AlertaIcon };

export interface Tarjeta {
  titulo: string;
  valor: string;
  detalle: string;
  icono: keyof typeof ICONOS;
  color: Color;
  punto?: "aviso" | "peligro" | "exito";
  href?: string;
}

/** Un grupo de tarjetas del Dashboard de tienda (las arma el servidor; los íconos van por nombre porque un componente no viaja como dato). */
export function TableroDashboard({ etiqueta, titulo, tarjetas }: { etiqueta: string; titulo: string; tarjetas: Tarjeta[] }) {
  return (
    <TableroIndicadores etiqueta={etiqueta} titulo={titulo}>
      {tarjetas.map((t) => (
        <Indicador key={t.titulo} titulo={t.titulo} valor={t.valor} detalle={t.detalle} icono={ICONOS[t.icono]} color={t.color} punto={t.punto} href={t.href} />
      ))}
    </TableroIndicadores>
  );
}
