import Image from "next/image";
import Link from "next/link";
import { NavDrawer } from "@/components/nav-drawer";
import { PaisSelector } from "@/components/pais-selector";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";

export async function NavBar() {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand/ecomfive-rojo.png"
            alt="Ecomfive"
            width={161}
            height={44}
            priority
            className="h-6 w-auto"
          />
          <span className="h-4 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground">
            Gestión de Proveeduría
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <PaisSelector actual={pais.codigo} />
          <NavDrawer />
        </div>
      </div>
    </header>
  );
}
