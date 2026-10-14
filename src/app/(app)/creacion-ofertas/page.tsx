import { PaginaProximamente } from "@/components/ui/pagina-proximamente";

export const metadata = { title: "Creación de ofertas" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaProximamente modulo="creacion-ofertas" titulo="Creación de ofertas" />;
}
