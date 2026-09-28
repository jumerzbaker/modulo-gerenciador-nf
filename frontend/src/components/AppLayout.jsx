import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, Landmark, FileUp, ClipboardPen, ShoppingCart, Package, Truck, Settings, LogOut, Moon, Sun, Menu, Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard, id: "dashboard" },
  { to: "/notas", label: "Notas SEFAZ", icon: Landmark, id: "notas" },
  { to: "/importar-xml", label: "Importar XML", icon: FileUp, id: "importar-xml" },
  { to: "/compra-manual", label: "Compra manual", icon: ClipboardPen, id: "compra-manual" },
  { to: "/compras", label: "Compras", icon: ShoppingCart, id: "compras" },
  { to: "/produtos", label: "Produtos", icon: Package, id: "produtos" },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, id: "fornecedores" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, id: "configuracoes" },
];

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map(({ to, label, icon: Icon, id }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          data-testid={`nav-${id}`}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              isActive
                ? "bg-slate-900 text-white dark:bg-emerald-500/15 dark:text-emerald-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`
          }
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-6 py-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 text-slate-950">
        <Boxes className="h-4 w-4" strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <p className="font-display text-sm font-bold tracking-tight">Entrada de Compras</p>
        <p className="text-[11px] text-muted-foreground">NF-e · XML · Manual</p>
      </div>
    </div>
  );
}

export function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex">
        <Brand />
        <NavItems />
        <div className="mt-auto border-t p-4">
          <p className="truncate text-xs text-muted-foreground" data-testid="sidebar-user-email">{user?.email}</p>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-button">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Brand />
              <NavItems onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" data-testid="theme-toggle-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={doLogout} data-testid="logout-button" className="gap-2">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </header>
        <main className="page-enter mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
