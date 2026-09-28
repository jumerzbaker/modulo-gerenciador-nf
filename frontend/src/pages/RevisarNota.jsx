import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SourceTag, StatusBadge } from "@/components/Common";
import { ProductPicker } from "@/components/ProductPicker";
import { api, errMsg } from "@/lib/api";
import { brl, fmtCnpj, fmtChave, fmtDate, num, today } from "@/lib/format";

const REASON = { codigo_fornecedor: "código do fornecedor", ean: "código de barras", nome: "nome igual" };

function Header({ doc, companyCnpj }) {
  const destDiff = companyCnpj && doc.dest_cnpj && doc.dest_cnpj !== companyCnpj;
  return (
    <Card className="mb-6 grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-5" data-testid="review-header">
      <div className="xl:col-span-2">
        <p className="eyebrow">Fornecedor</p>
        <p className="mt-1 font-medium">{doc.emit_nome}</p>
        <p className="font-mono text-xs text-muted-foreground">{fmtCnpj(doc.emit_cnpj)} {doc.supplier ? "· já cadastrado" : "· será cadastrado"}</p>
      </div>
      <div><p className="eyebrow">NF-e / Série</p><p className="mt-1 font-mono">{doc.numero} / {doc.serie}</p></div>
      <div><p className="eyebrow">Emissão</p><p className="mt-1">{fmtDate(doc.data_emissao)}</p></div>
      <div><p className="eyebrow">Valor total</p><p className="num mt-1 font-display text-xl font-bold" data-testid="review-total">{brl(doc.valor_total)}</p></div>
      <div className="sm:col-span-2 xl:col-span-5">
        <p className="eyebrow">Chave de acesso</p>
        <p className="mt-1 break-all font-mono text-xs">{fmtChave(doc.chave)}</p>
        {destDiff && <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />O destinatário desta nota ({fmtCnpj(doc.dest_cnpj)}) é diferente do CNPJ da empresa.</p>}
      </div>
    </Card>
  );
}

function ItemRow({ item, line, products, onChange }) {
  const stockQty = (item.quantidade || 0) * (Number(line.fator) || 0);
  const unit = line.mode === "link" ? line.unidade : line.new_unidade;
  return (
    <TableRow data-testid={`review-item-${item.n_item}`}>
      <TableCell className="align-top font-mono text-xs text-muted-foreground">{item.n_item}</TableCell>
      <TableCell className="min-w-[240px] align-top">
        <p className="text-sm font-medium">{item.descricao}</p>
        <p className="font-mono text-[11px] text-muted-foreground">Cód. {item.codigo}{item.ean ? ` · EAN ${item.ean}` : ""}{item.ncm ? ` · NCM ${item.ncm}` : ""}</p>
      </TableCell>
      <TableCell className="num whitespace-nowrap align-top text-sm">{num(item.quantidade)} {item.unidade}<p className="text-[11px] text-muted-foreground">{brl(item.valor_unitario)} un.</p></TableCell>
      <TableCell className="num whitespace-nowrap align-top text-right text-sm font-medium">{brl(item.valor_total)}</TableCell>
      <TableCell className="min-w-[260px] align-top">
        <ProductPicker products={products} value={line} testId={`review-product-picker-${item.n_item}`}
          onChange={(v) => onChange({ ...line, ...v })} />
        {line.mode === "create" ? (
          <div className="mt-2 flex gap-2">
            <Input value={line.new_nome} onChange={(e) => onChange({ ...line, new_nome: e.target.value })} className="h-8 text-xs" placeholder="Nome do novo produto" data-testid={`review-new-name-${item.n_item}`} />
            <Input value={line.new_unidade} onChange={(e) => onChange({ ...line, new_unidade: e.target.value.toUpperCase() })} className="h-8 w-16 text-xs" data-testid={`review-new-unit-${item.n_item}`} />
          </div>
        ) : line.motivo && line.product_id === line.sug_id ? (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />Vinculado por {REASON[line.motivo]}</p>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <Input type="number" min="0.0001" step="any" value={line.fator} onChange={(e) => onChange({ ...line, fator: e.target.value })}
          className="h-9 w-20" data-testid={`review-factor-${item.n_item}`} />
      </TableCell>
      <TableCell className="num whitespace-nowrap align-top text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400" data-testid={`review-stock-qty-${item.n_item}`}>
        +{num(stockQty)} {unit}
      </TableCell>
    </TableRow>
  );
}

export default function RevisarNota() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState({});
  const [cnpj, setCnpj] = useState("");
  const [entrada, setEntrada] = useState(today());
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/documents/${id}/review`), api.get("/products"), api.get("/settings")])
      .then(([d, p, s]) => {
        setDoc(d.data);
        setProducts(p.data);
        setCnpj(s.data.cnpj);
        const init = {};
        d.data.items.forEach((it) => {
          const sg = it.sugestao;
          init[it.n_item] = sg
            ? { mode: "link", product_id: sg.product_id, product_nome: sg.nome, unidade: sg.unidade, motivo: sg.motivo, sug_id: sg.product_id, fator: 1 }
            : { mode: "create", new_nome: it.descricao, new_unidade: it.unidade || "UN", fator: 1 };
          init[it.n_item].new_nome ??= it.descricao;
          init[it.n_item].new_unidade ??= it.unidade || "UN";
        });
        setLines(init);
      })
      .catch((e) => { toast.error(errMsg(e)); navigate("/notas"); });
  }, [id, navigate]);

  const stats = useMemo(() => {
    const vals = Object.values(lines);
    return { linked: vals.filter((l) => l.mode === "link").length, created: vals.filter((l) => l.mode === "create").length };
  }, [lines]);

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        data_entrada: entrada, observacao: obs,
        lines: doc.items.map((it) => {
          const l = lines[it.n_item];
          return l.mode === "link"
            ? { n_item: it.n_item, product_id: l.product_id, fator: Number(l.fator) }
            : { n_item: it.n_item, fator: Number(l.fator), new_product: { nome: l.new_nome, unidade: l.new_unidade, ean: it.ean, ncm: it.ncm } };
        }),
      };
      await api.post(`/documents/${id}/import`, payload);
      toast.success("Compra importada e estoque atualizado");
      navigate("/compras");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (!doc) return <div className="h-60 animate-pulse rounded-lg bg-muted" data-testid="review-loading" />;
  const imported = doc.status === "importada";

  return (
    <div data-testid="review-page">
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate(-1)} data-testid="review-back-button"><ArrowLeft className="mr-1.5 h-4 w-4" />Voltar</Button>
      <PageHeader eyebrow={<span className="flex items-center gap-2">Revisão da nota <SourceTag source={doc.source} /> <StatusBadge status={doc.status} /></span>}
        title={`NF-e ${doc.numero}`} description="Vincule cada item a um produto do estoque ou crie um novo. Use o fator de conversão quando a unidade de compra for diferente (ex.: 1 caixa = 12 unidades)." />
      <Header doc={doc} companyCnpj={cnpj} />
      <Card className="overflow-x-auto">
        <Table data-testid="review-items-table">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead><TableHead>Item da nota</TableHead><TableHead>Qtd. comprada</TableHead><TableHead className="text-right">Total</TableHead>
              <TableHead>Produto no estoque</TableHead><TableHead>Fator</TableHead><TableHead className="text-right">Entrada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doc.items.map((it) => lines[it.n_item] && (
              <ItemRow key={it.n_item} item={it} line={lines[it.n_item]} products={products}
                onChange={(l) => setLines((prev) => ({ ...prev, [it.n_item]: l }))} />
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="mt-6 flex flex-col gap-4 p-5 lg:flex-row lg:items-end">
        <div className="flex gap-6 text-sm">
          <span className="flex items-center gap-1.5" data-testid="review-linked-count"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{stats.linked} vinculado(s)</span>
          <span className="flex items-center gap-1.5" data-testid="review-create-count"><PackagePlus className="h-4 w-4 text-blue-600" />{stats.created} novo(s)</span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><CircleDashed className="h-4 w-4" />{doc.items.length} item(ns)</span>
        </div>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:justify-end">
          <div className="space-y-1.5"><Label>Data de entrada</Label><Input type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="sm:w-44" data-testid="review-entry-date" /></div>
          <div className="space-y-1.5 sm:w-72"><Label>Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" data-testid="review-notes-input" /></div>
          <Button onClick={submit} disabled={saving || imported} className="self-end active:scale-[0.98]" data-testid="review-confirm-button">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {imported ? "Nota já importada" : "Confirmar importação"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
