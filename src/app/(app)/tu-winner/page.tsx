import { PaginaProximamente } from "@/components/ui/pagina-proximamente";

export const metadata = { title: "Tu Winner" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaProximamente modulo="tu-winner" titulo="Tu Winner" />;
}
