import { PaginaProximamente } from "@/components/ui/pagina-proximamente";

export const metadata = { title: "Selección de productos" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaProximamente modulo="seleccion-productos" titulo="Selección de productos" />;
}
