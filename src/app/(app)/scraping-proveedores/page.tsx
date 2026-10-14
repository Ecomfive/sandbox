import { PaginaProximamente } from "@/components/ui/pagina-proximamente";

export const metadata = { title: "Scraping de proveedores" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaProximamente modulo="scraping-proveedores" titulo="Scraping de proveedores" />;
}
