import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, ShieldAlert, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/Common";
import { api, errMsg } from "@/lib/api";
import { fmtCnpj, fmtDate, fmtDateTime } from "@/lib/format";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function CompanyCard({ s, onSaved }) {
  const [f, setF] = useState(s);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/settings", { cnpj: f.cnpj, razao_social: f.razao_social, uf: f.uf, ambiente: Number(f.ambiente), auto_sync: f.auto_sync, auto_manifest: f.auto_manifest });
      toast.success("Configurações salvas");
      onSaved(data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Card className="p-6" data-testid="company-card">
      <h3 className="text-lg font-semibold">Empresa destinatária</h3>
      <p className="mb-5 text-sm text-muted-foreground">CNPJ contra o qual as notas são emitidas.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>CNPJ</Label><Input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} placeholder="00.000.000/0000-00" data-testid="settings-cnpj-input" /></div>
        <div className="space-y-1.5"><Label>Razão social</Label><Input value={f.razao_social} onChange={(e) => setF({ ...f, razao_social: e.target.value })} data-testid="settings-razao-input" /></div>
        <div className="space-y-1.5"><Label>UF</Label>
          <Select value={f.uf} onValueChange={(v) => setF({ ...f, uf: v })}>
            <SelectTrigger data-testid="settings-uf-select"><SelectValue /></SelectTrigger>
            <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Ambiente SEFAZ</Label>
          <Select value={String(f.ambiente)} onValueChange={(v) => setF({ ...f, ambiente: Number(v) })}>
            <SelectTrigger data-testid="settings-ambiente-select"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="1">Produção (notas reais)</SelectItem><SelectItem value="2">Homologação (testes)</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-5 space-y-3 border-t pt-5">
        <label className="flex items-center justify-between gap-4 text-sm"><span><span className="font-medium">Busca automática</span><br /><span className="text-muted-foreground">Consulta a SEFAZ a cada hora (limite oficial).</span></span>
          <Switch checked={f.auto_sync} onCheckedChange={(v) => setF({ ...f, auto_sync: v })} data-testid="settings-auto-sync-switch" /></label>
        <label className="flex items-center justify-between gap-4 text-sm"><span><span className="font-medium">Ciência da Operação automática</span><br /><span className="text-muted-foreground">Necessária para a SEFAZ liberar o XML completo com os itens.</span></span>
          <Switch checked={f.auto_manifest} onCheckedChange={(v) => setF({ ...f, auto_manifest: v })} data-testid="settings-auto-manifest-switch" /></label>
      </div>
      <Button className="mt-5" onClick={save} disabled={busy} data-testid="settings-save-button">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
    </Card>
  );
}

function CertCard({ s, onSaved }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const cert = s.cert;
  const days = cert ? Math.floor((new Date(cert.not_after) - new Date()) / 86400000) : null;

  const upload = async () => {
    if (!file || !pwd) return toast.error("Selecione o arquivo .pfx e informe a senha");
    const form = new FormData();
    form.append("file", file);
    form.append("password", pwd);
    setBusy(true);
    try {
      const { data } = await api.post("/settings/certificate", form);
      toast.success("Certificado Digital A1 carregado");
      setPwd(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      onSaved(data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm("Remover o certificado? A busca automática será interrompida.")) return;
    await api.delete("/settings/certificate");
    onSaved({ ...s, cert: null });
  };

  return (
    <Card className="p-6" data-testid="cert-card">
      <h3 className="text-lg font-semibold">Certificado Digital A1</h3>
      <p className="mb-5 text-sm text-muted-foreground">Arquivo .pfx/.p12 e senha. Guardados criptografados, usados apenas para falar com a SEFAZ.</p>
      {cert ? (
        <div className={`mb-5 rounded-lg border p-4 ${days < 30 ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"}`} data-testid="cert-status">
          <div className="flex items-start gap-3">
            {days < 30 ? <ShieldAlert className="h-5 w-5 text-amber-600" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
            <div className="min-w-0 flex-1 text-sm">
              <p className="break-words font-medium">{cert.subject}</p>
              <p className="text-muted-foreground">CNPJ {fmtCnpj(cert.cnpj)} · válido até <b>{fmtDate(cert.not_after)}</b> ({days < 0 ? "expirado" : `${days} dias`})</p>
            </div>
            <Button variant="ghost" size="icon" onClick={remove} data-testid="cert-remove-button"><Trash2 className="h-4 w-4 text-rose-600" /></Button>
          </div>
        </div>
      ) : <p className="mb-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="cert-empty">Nenhum certificado enviado.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Arquivo do certificado</Label><Input ref={fileRef} type="file" accept=".pfx,.p12" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="cert-file-input" /></div>
        <div className="space-y-1.5"><Label>Senha do certificado</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} data-testid="cert-password-input" /></div>
      </div>
      <Button className="mt-5" onClick={upload} disabled={busy} data-testid="cert-upload-button">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{cert ? "Substituir certificado" : "Enviar certificado"}</Button>
    </Card>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ current_password: "", new_password: "" });
  const save = async () => {
    try { await api.post("/auth/change-password", f); toast.success("Senha alterada"); setF({ current_password: "", new_password: "" }); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card className="p-6" data-testid="password-card">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-4 w-4" />Alterar senha de acesso</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input type="password" placeholder="Senha atual" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} data-testid="current-password-input" />
        <Input type="password" placeholder="Nova senha" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} data-testid="new-password-input" />
      </div>
      <Button variant="outline" className="mt-4" onClick={save} data-testid="change-password-button">Alterar senha</Button>
    </Card>
  );
}

export default function Configuracoes() {
  const [s, setS] = useState(null);
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data));
    api.get("/sefaz/logs").then((r) => setLogs(r.data));
  }, []);
  if (!s) return <div className="h-60 animate-pulse rounded-lg bg-muted" />;

  return (
    <div data-testid="configuracoes-page">
      <PageHeader eyebrow="Sistema" title="Configurações" description="Dados da empresa, certificado digital e comunicação com a SEFAZ (Ambiente Nacional)." />
      <div className="grid gap-6 xl:grid-cols-2">
        <CompanyCard key={`${s.cnpj}-${s.ambiente}`} s={s} onSaved={setS} />
        <div className="space-y-6">
          <CertCard s={s} onSaved={setS} />
          <PasswordCard />
        </div>
      </div>
      <Card className="mt-6 p-6" data-testid="sefaz-logs-card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">Log de comunicação SEFAZ</h3>
          <p className="font-mono text-xs text-muted-foreground" data-testid="settings-nsu-info">último NSU {s.ult_nsu} · máx. {s.max_nsu} · próxima consulta {fmtDateTime(s.next_sync_at)}</p>
        </div>
        {logs.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma comunicação ainda.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>cStat</TableHead><TableHead>Mensagem</TableHead><TableHead>Docs</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{fmtDateTime(l.at)}</TableCell>
                    <TableCell className="text-sm">{l.tipo}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{l.cstat}</TableCell>
                    <TableCell className="text-sm">{l.motivo}</TableCell>
                    <TableCell className="num">{l.docs}</TableCell>
                    <TableCell className="max-w-[240px] truncate font-mono text-[11px] text-muted-foreground">{l.detalhe}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
