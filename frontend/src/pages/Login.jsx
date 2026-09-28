import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Boxes, Loader2, Landmark, FileUp, ClipboardPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";

const FEATURES = [
  [Landmark, "Busca automática na SEFAZ", "Notas emitidas contra o CNPJ chegam sozinhas, via certificado A1."],
  [FileUp, "Importação de XML", "Arraste os arquivos da NF-e e revise os itens antes de entrar no estoque."],
  [ClipboardPen, "Compra manual", "Lance compras sem nota com os mesmos controles de custo e estoque."],
];

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <img src="https://images.unsplash.com/photo-1592085198739-ffcad7f36b54?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600"
          alt="Estoque" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 text-slate-950">
              <Boxes className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold">Entrada de Compras</span>
          </div>
          <div className="max-w-lg">
            <p className="eyebrow mb-4 !text-emerald-400">Módulo de compras</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
              Da nota fiscal ao estoque, sem digitar item por item.
            </h1>
            <div className="mt-10 space-y-5">
              {FEATURES.map(([Icon, t, d]) => (
                <div key={t} className="flex gap-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" strokeWidth={1.8} />
                  <div>
                    <p className="font-medium">{t}</p>
                    <p className="text-sm text-slate-400">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500">Integração oficial NFeDistribuicaoDFe · Ambiente Nacional</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6" data-testid="login-form">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Entrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Acesse com seu e-mail e senha.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email-input" autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password-input" autoComplete="current-password" />
          </div>
          {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" data-testid="login-error">{error}</p>}
          <Button type="submit" className="w-full active:scale-[0.98]" disabled={loading} data-testid="login-submit-button">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
