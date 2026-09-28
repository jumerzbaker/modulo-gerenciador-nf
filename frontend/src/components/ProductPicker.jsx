import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { num } from "@/lib/format";

// value: { mode: "link", product_id, product_nome } | { mode: "create" }
export function ProductPicker({ products, value, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const label = value?.mode === "link" ? value.product_nome : "Criar novo produto";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" data-testid={testId}
          className={`h-9 w-full min-w-[220px] justify-between font-normal ${value?.mode === "create" ? "border-dashed text-blue-700 dark:text-blue-300" : ""}`}>
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {value?.mode === "create" && <Plus className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar produto no estoque..." data-testid={`${testId}-search`} />
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__novo__ criar novo produto" data-testid={`${testId}-create-option`}
                onSelect={() => { onChange({ mode: "create" }); setOpen(false); }}>
                <Plus className="mr-2 h-4 w-4 text-blue-600" /> Criar novo produto
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Produtos cadastrados">
              {products.map((p) => (
                <CommandItem key={p.id} value={`${p.nome} ${p.sku} ${p.ean} ${p.id}`}
                  data-testid={`${testId}-option-${p.id}`}
                  onSelect={() => { onChange({ mode: "link", product_id: p.id, product_nome: p.nome, unidade: p.unidade }); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value?.product_id === p.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="flex-1 truncate">{p.nome}</span>
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{num(p.estoque)} {p.unidade}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
