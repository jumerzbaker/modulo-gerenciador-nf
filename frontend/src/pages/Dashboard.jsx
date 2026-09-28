import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, FileUp, ClipboardPen, Landmark, ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, SourceTag } from "@/components/Common";
import { api } from "@/lib/api";
import { brl, fmtDate, fmtDateTime, num } from "@/lib/format";

function Metric({ label, value, hint, testId, tone = "" }) {
  return (
    <Card className="p-5" data-testid={testId}>
      <p className="eyebrow">{label}</p>
      <p className={`num mt-3 font-display text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function CertMetric({ cert }) {
  if (!cert) return <Metric label="Certificado A1" value="Não enviado" tone="text-rose-600 !text-xl" hint="Envie em Configurações" testId="metric-cert" />;
  const days = Math.floor((new Date(cert.not_after) - new Date()) / 86400000);
  const warn = days < 30;
  return (
    <Card className="p-5" data-testid="metric-cert">
      <p className="eyebrow">Certificado A1</p>
      <div className={`mt-3 flex items-center gap-2 font-display text-xl font-bold ${warn ? "text-amber-600" : "text-emerald-600"}`}>
        {warn ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        {days < 0 ? "Expirado" : `${days} dias`}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Válido até {fmtDate(cert.not_after)}</p>
    </Card>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard").then((r) => setD(r.data)); }, []);
  if (!d) return <div className="h-40 animate-pulse rounded-lg bg-muted" data-testid="dashboard-loading" />;

  return (
    <div data-testid="dashboard-page">
      <PageHeader eyebrow="Visão geral" title="Painel de compras"
        description={d.last_sync_at ? `Última consulta à SEFAZ em ${fmtDateTime(d.last_sync_at)}${d.next_sync_at ? ` · próxima permitida ${fmtDateTime(d.next_sync_at)}` : ""}` : "Nenhuma consulta à SEFAZ realizada ainda."}
        actions={<>
          <Button asChild variant="outline" data-testid="quick-xml-button"><Link to="/importar-xml"><FileUp className="mr-2 h-4 w-4" />Importar XML</Link></Button>
          <Button asChild variant="outline" data-testid="quick-manual-button"><Link to="/compra-manual"><ClipboardPen className="mr-2 h-4 w-4" />Compra manual</Link></Button>
          <Button asChild data-testid="quick-notas-button"><Link to="/notas"><Landmark className="mr-2 h-4 w-4" />Notas SEFAZ</Link></Button>
        </>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Notas pendentes" value={d.notas_pendentes} hint="Aguardando importação" testId="metric-pendentes" tone={d.notas_pendentes ? "text-blue-600" : ""} />
        <Metric label="Compras no mês" value={brl(d.compras_mes_total)} hint={`${d.compras_mes_qtd} compra(s) lançada(s)`} testId="metric-compras-mes" />
        <Metric label="Produtos" value={d.produtos} hint={`${d.fornecedores} fornecedor(es)`} testId="metric-produtos" />
        <CertMetric cert={d.cert} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5" data-testid="chart-mensal">
          <p className="eyebrow mb-4">Compras por mês</p>
          {d.mensal.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.mensal}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} tickFormatter={(v) => `R$ ${num(v)}`} />
                <Tooltip formatter={(v) => brl(v)} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-muted-foreground">Sem compras registradas ainda.</p>}
        </Card>
        <Card className="p-5" data-testid="estoque-baixo-card">
          <p className="eyebrow mb-4 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" />Estoque abaixo do mínimo</p>
          {d.estoque_baixo.length ? d.estoque_baixo.map((p) => (
            <div key={p.id} className="flex justify-between border-b py-2 text-sm last:border-0">
              <span className="truncate">{p.nome}</span>
              <span className="num font-mono text-amber-700 dark:text-amber-400">{num(p.estoque)} / {num(p.estoque_minimo)} {p.unidade}</span>
            </div>
          )) : <p className="py-10 text-center text-sm text-muted-foreground">Tudo certo por aqui.</p>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="p-5" data-testid="ultimas-compras-card">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Últimas compras</p>
            <Link to="/compras" className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">Ver todas <ArrowRight className="h-3 w-3" /></Link>
          </div>
          {d.ultimas_compras.length ? d.ultimas_compras.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-0">
              <SourceTag source={p.source} />
              <span className="flex-1 truncate">{p.supplier_nome}</span>
              <span className="text-xs text-muted-foreground">{fmtDate(p.data_entrada)}</span>
              <span className="num w-28 text-right font-medium">{brl(p.valor_total)}</span>
            </div>
          )) : <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma compra ainda.</p>}
        </Card>
        <Card className="p-5" data-testid="ultimos-logs-card">
          <p className="eyebrow mb-3">Comunicação com a SEFAZ</p>
          {d.ultimos_logs.length ? d.ultimos_logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-0">
              <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(l.at)}</span>
              <span className="font-mono text-xs font-semibold">{l.cstat}</span>
              <span className="flex-1 truncate text-muted-foreground">{l.motivo}</span>
            </div>
          )) : <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma consulta realizada.</p>}
        </Card>
      </div>
    </div>
  );
}
