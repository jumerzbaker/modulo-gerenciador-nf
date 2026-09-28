import re

from fastapi import HTTPException

from core import db, new_id, now_iso, only_digits


async def upsert_supplier(data: dict) -> dict:
    cnpj = only_digits(data.get("cnpj"))
    if cnpj:
        existing = await db.suppliers.find_one({"cnpj": cnpj}, {"_id": 0})
        if existing:
            return existing
    doc = {"id": new_id(), "cnpj": cnpj, "nome": data.get("nome") or "Fornecedor sem nome",
           "fantasia": data.get("fantasia", ""), "ie": data.get("ie", ""), "uf": data.get("uf", ""),
           "cidade": data.get("cidade", ""), "telefone": data.get("telefone", ""), "email": data.get("email", ""),
           "created_at": now_iso()}
    await db.suppliers.insert_one(dict(doc))
    return doc


async def suggest_product(item: dict, supplier_cnpj: str):
    if supplier_cnpj and item.get("codigo"):
        p = await db.products.find_one({"supplier_codes": {"$elemMatch": {"cnpj": supplier_cnpj, "codigo": item["codigo"]}}},
                                       {"_id": 0})
        if p:
            return p, "codigo_fornecedor"
    if item.get("ean"):
        p = await db.products.find_one({"ean": item["ean"]}, {"_id": 0})
        if p:
            return p, "ean"
    if item.get("descricao"):
        p = await db.products.find_one({"nome": {"$regex": f"^{re.escape(item['descricao'])}$", "$options": "i"}},
                                       {"_id": 0})
        if p:
            return p, "nome"
    return None, None


async def create_product(data: dict) -> dict:
    doc = {"id": new_id(), "nome": data.get("nome", "").strip(), "sku": data.get("sku", ""), "ean": data.get("ean", ""),
           "ncm": data.get("ncm", ""), "unidade": data.get("unidade") or "UN", "estoque": 0.0, "custo_medio": 0.0,
           "estoque_minimo": float(data.get("estoque_minimo") or 0), "preco_venda": float(data.get("preco_venda") or 0),
           "supplier_codes": [], "created_at": now_iso()}
    if not doc["nome"]:
        raise HTTPException(400, "Nome do produto é obrigatório")
    await db.products.insert_one(dict(doc))
    return doc


async def _add_stock(product: dict, qty: float, total_cost: float, supplier_cnpj: str, codigo: str):
    stock = float(product.get("estoque") or 0)
    avg = float(product.get("custo_medio") or 0)
    new_stock = stock + qty
    new_avg = ((stock * avg) + total_cost) / new_stock if new_stock > 0 else avg
    update = {"$set": {"estoque": round(new_stock, 4), "custo_medio": round(new_avg, 6)}}
    if supplier_cnpj and codigo:
        update["$addToSet"] = {"supplier_codes": {"cnpj": supplier_cnpj, "codigo": codigo}}
    await db.products.update_one({"id": product["id"]}, update)


async def create_purchase(source: str, supplier: dict, header: dict, lines: list, document_id=None) -> dict:
    """Resolve products, add stock with weighted average cost and store the purchase."""
    if not lines:
        raise HTTPException(400, "A compra precisa de pelo menos um item")
    items = []
    for line in lines:
        if line.get("product_id"):
            product = await db.products.find_one({"id": line["product_id"]}, {"_id": 0})
            if not product:
                raise HTTPException(400, f"Produto não encontrado para o item '{line.get('descricao')}'")
        else:
            product = await create_product(line.get("new_product") or {"nome": line.get("descricao"),
                                                                       "ean": line.get("ean", ""),
                                                                       "ncm": line.get("ncm", ""),
                                                                       "unidade": line.get("unidade", "UN")})
        qty = float(line.get("quantidade") or 0)
        factor = float(line.get("fator") or 1)
        if qty <= 0 or factor <= 0:
            raise HTTPException(400, f"Quantidade inválida no item '{line.get('descricao') or product['nome']}'")
        total = float(line.get("valor_total") if line.get("valor_total") is not None else qty * float(line.get("valor_unitario") or 0))
        stock_qty = qty * factor
        await _add_stock(product, stock_qty, total, supplier.get("cnpj", ""), line.get("codigo", ""))
        items.append({"product_id": product["id"], "product_nome": product["nome"],
                      "descricao": line.get("descricao") or product["nome"], "codigo": line.get("codigo", ""),
                      "unidade": line.get("unidade") or product.get("unidade", "UN"), "quantidade": qty,
                      "fator": factor, "quantidade_estoque": stock_qty,
                      "valor_unitario": float(line.get("valor_unitario") or (total / qty)), "valor_total": total})
    purchase = {"id": new_id(), "source": source, "document_id": document_id, "chave": header.get("chave", ""),
                "numero": header.get("numero", ""), "serie": header.get("serie", ""),
                "data_emissao": header.get("data_emissao", ""), "data_entrada": header.get("data_entrada") or now_iso()[:10],
                "supplier_id": supplier["id"], "supplier_nome": supplier["nome"], "supplier_cnpj": supplier.get("cnpj", ""),
                "observacao": header.get("observacao", ""),
                "valor_total": round(float(header.get("valor_total") or sum(i["valor_total"] for i in items)), 2),
                "items": items, "created_at": now_iso()}
    await db.purchases.insert_one(dict(purchase))
    return purchase


async def revert_purchase(purchase: dict):
    for item in purchase["items"]:
        p = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not p:
            continue
        stock = float(p.get("estoque") or 0)
        avg = float(p.get("custo_medio") or 0)
        new_stock = stock - item["quantidade_estoque"]
        new_avg = ((stock * avg) - item["valor_total"]) / new_stock if new_stock > 0 else avg
        await db.products.update_one({"id": p["id"]}, {"$set": {"estoque": round(new_stock, 4),
                                                               "custo_medio": round(max(new_avg, 0), 6)}})
    if purchase.get("document_id"):
        await db.nfe_documents.update_one({"id": purchase["document_id"]},
                                          {"$set": {"status": "xml_completo", "purchase_id": None, "updated_at": now_iso()}})
    await db.purchases.delete_one({"id": purchase["id"]})
