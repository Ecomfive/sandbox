"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/extractos", label: "Extractos" },
  { href: "/conciliaciones", label: "Conciliación" },
  { href: "/inventario", label: "Inventario" },
  { href: "/alertas", label: "Alertas" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
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
        <nav className="flex flex-wrap gap-1 text-sm">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-md bg-accent px-3 py-1.5 text-accent-foreground transition-colors"
                    : "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
