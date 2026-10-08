import type { ComponentType, SVGProps } from "react";
import {
  AlertaIcon,
  AvisosIcon,
  CatalogoIcon,
  ComprasIcon,
  DashboardIcon,
  DropshipperIcon,
  EquipoIcon,
  ExtractoIcon,
  FiltroIcon,
  GastoIcon,
  InteligenciaIcon,
  InventarioIcon,
  PedidoIcon,
  ProductoIcon,
  TestIcon,
  WalletIcon,
  WmsIcon,
} from "@/lib/nav-icons";

type Icono = ComponentType<SVGProps<SVGSVGElement>>;

/** El ícono de cada módulo en el Centro de ayuda (el mismo que en el menú cuando lo hay). */
export const ICONO_MODULO: Record<string, Icono> = {
  dashboard: DashboardIcon,
  compras: ComprasIcon,
  producto: ProductoIcon,
  inventario: InventarioIcon,
  "wms-bodegas": WmsIcon,
  "wms-ubicaciones": WmsIcon,
  alertas: AlertaIcon,
  "pedidos-dropi": PedidoIcon,
  retiros: WalletIcon,
  extractos: ExtractoIcon,
  gastos: GastoIcon,
  productos: CatalogoIcon,
  "productos-test": TestIcon,
  "filtro-productos": FiltroIcon,
  "crm-dropshippers": DropshipperIcon,
  "inteligencia-competitiva": InteligenciaIcon,
  usuarios: EquipoIcon,
  notificaciones: AvisosIcon,
};

/** Colores de la paleta neón para las tarjetas de los módulos (uno por módulo, siempre el mismo). */
const TONOS = ["#8a35c9", "#d74c81", "#5f43d1", "#b12a97", "#325bba", "#e07a3a"];
export function tonoModulo(modulo: string): string {
  let h = 0;
  for (const c of modulo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
}
