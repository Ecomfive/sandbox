import { PaginaImportarCartera } from "@/components/cartera/pagina-importar";

export const metadata = { title: "Importar Excel" };

export const dynamic = "force-dynamic";

export default function ImportarCobrarPage() {
  return <PaginaImportarCartera clase="cobrar" />;
}
