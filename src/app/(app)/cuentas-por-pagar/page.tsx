import { PaginaCartera } from "@/components/cartera/pagina-cartera";

export const metadata = { title: "Cuentas por pagar" };

export const dynamic = "force-dynamic";

export default function CuentasPorPagarPage() {
  return <PaginaCartera clase="pagar" />;
}
