import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Notas from "@/pages/Notas";
import ImportarXml from "@/pages/ImportarXml";
import RevisarNota from "@/pages/RevisarNota";
import CompraManual from "@/pages/CompraManual";
import Compras from "@/pages/Compras";
import Produtos from "@/pages/Produtos";
import Fornecedores from "@/pages/Fornecedores";
import Configuracoes from "@/pages/Configuracoes";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="flex h-screen items-center justify-center" data-testid="auth-loading">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

const pages = [
  ["/", Dashboard],
  ["/notas", Notas],
  ["/notas/:id/importar", RevisarNota],
  ["/importar-xml", ImportarXml],
  ["/compra-manual", CompraManual],
  ["/compras", Compras],
  ["/produtos", Produtos],
  ["/fornecedores", Fornecedores],
  ["/configuracoes", Configuracoes],
];

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            {pages.map(([path, Page]) => (
              <Route key={path} path={path} element={<Protected><Page /></Protected>} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
