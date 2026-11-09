import { PaginaCartera } from "@/components/cartera/pagina-cartera";

export const metadata = { title: "Cuentas por cobrar" };

export const dynamic = "force-dynamic";

export default function CuentasPorCobrarPage() {
  return <PaginaCartera clase="cobrar" />;
}
