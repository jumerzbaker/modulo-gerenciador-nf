from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user, get_settings, new_id, now_iso, only_digits
from purchase_service import create_product, create_purchase, revert_purchase, upsert_supplier

router = APIRouter(dependencies=[Depends(get_current_user)])


class ProductIn(BaseModel):
    nome: str
    sku: str = ""
    ean: str = ""
    ncm: str = ""
    unidade: str = "UN"
    estoque_minimo: float = 0
    preco_venda: float = 0


class SupplierIn(BaseModel):
    nome: str
    cnpj: str = ""
    fantasia: str = ""
    ie: str = ""
    uf: str = ""
    cidade: str = ""
    telefone: str = ""
    email: str = ""


class ManualLine(BaseModel):
    product_id: Optional[str] = None
    new_product: Optional[ProductIn] = None
    descricao: str = ""
    unidade: str = "UN"
    quantidade: float
    fator: float = 1
    valor_unitario: float


class ManualPurchaseIn(BaseModel):
    supplier_id: Optional[str] = None
    new_supplier: Optional[SupplierIn] = None
    numero: str = ""
    data_emissao: str = ""
    data_entrada: str = ""
    observacao: str = ""
    items: List[ManualLine]


# Products
@router.get("/products")
async def list_products(q: Optional[str] = None):
    query = {"$or": [{"nome": {"$regex": q, "$options": "i"}}, {"sku": q}, {"ean": q}]} if q else {}
    return await db.products.find(query, {"_id": 0}).sort("nome", 1).to_list(2000)


@router.post("/products")
async def add_product(body: ProductIn):
    return await create_product(body.model_dump())


@router.put("/products/{pid}")
async def edit_product(pid: str, body: ProductIn):
    res = await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "Produto não encontrado")
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/products/{pid}")
async def remove_product(pid: str):
    if await db.purchases.find_one({"items.product_id": pid}, {"_id": 1}):
        raise HTTPException(400, "Produto possui compras vinculadas e não pode ser excluído")
    await db.products.delete_one({"id": pid})
    return {"ok": True}


# Suppliers
@router.get("/suppliers")
async def list_suppliers():
    suppliers = await db.suppliers.find({}, {"_id": 0}).sort("nome", 1).to_list(2000)
    stats = await db.purchases.aggregate([{"$group": {"_id": "$supplier_id", "total": {"$sum": "$valor_total"},
                                                      "qtd": {"$sum": 1}}}]).to_list(2000)
    by_id = {s["_id"]: s for s in stats}
    for s in suppliers:
        s["total_compras"] = round(by_id.get(s["id"], {}).get("total", 0), 2)
        s["qtd_compras"] = by_id.get(s["id"], {}).get("qtd", 0)
    return suppliers


@router.post("/suppliers")
async def add_supplier(body: SupplierIn):
    cnpj = only_digits(body.cnpj)
    if cnpj and await db.suppliers.find_one({"cnpj": cnpj}, {"_id": 1}):
        raise HTTPException(400, "Já existe um fornecedor com este CNPJ")
    return await upsert_supplier(body.model_dump())


@router.put("/suppliers/{sid}")
async def edit_supplier(sid: str, body: SupplierIn):
    data = {**body.model_dump(), "cnpj": only_digits(body.cnpj)}
    res = await db.suppliers.update_one({"id": sid}, {"$set": data})
    if not res.matched_count:
        raise HTTPException(404, "Fornecedor não encontrado")
    return await db.suppliers.find_one({"id": sid}, {"_id": 0})


@router.delete("/suppliers/{sid}")
async def remove_supplier(sid: str):
    if await db.purchases.find_one({"supplier_id": sid}, {"_id": 1}):
        raise HTTPException(400, "Fornecedor possui compras vinculadas")
    await db.suppliers.delete_one({"id": sid})
    return {"ok": True}


# Purchases
@router.get("/purchases")
async def list_purchases(source: Optional[str] = None, q: Optional[str] = None):
    query = {}
    if source:
        query["source"] = source
    if q:
        query["$or"] = [{"supplier_nome": {"$regex": q, "$options": "i"}}, {"numero": q}, {"chave": {"$regex": q}}]
    return await db.purchases.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/purchases/{pid}")
async def get_purchase(pid: str):
    p = await db.purchases.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Compra não encontrada")
    return p


@router.post("/purchases/manual")
async def manual_purchase(body: ManualPurchaseIn):
    if body.supplier_id:
        supplier = await db.suppliers.find_one({"id": body.supplier_id}, {"_id": 0})
        if not supplier:
            raise HTTPException(400, "Fornecedor não encontrado")
    elif body.new_supplier and body.new_supplier.nome.strip():
        supplier = await upsert_supplier(body.new_supplier.model_dump())
    else:
        raise HTTPException(400, "Selecione ou cadastre um fornecedor")
    lines = []
    for it in body.items:
        if not it.product_id and not it.new_product:
            raise HTTPException(400, "Todos os itens precisam de um produto")
        lines.append({"product_id": it.product_id, "new_product": it.new_product.model_dump() if it.new_product else None,
                      "descricao": it.descricao, "unidade": it.unidade, "quantidade": it.quantidade, "fator": it.fator,
                      "valor_unitario": it.valor_unitario, "valor_total": round(it.quantidade * it.valor_unitario, 2)})
    header = {"numero": body.numero, "data_emissao": body.data_emissao, "data_entrada": body.data_entrada,
              "observacao": body.observacao}
    return await create_purchase("manual", supplier, header, lines)


@router.delete("/purchases/{pid}")
async def delete_purchase(pid: str):
    p = await get_purchase(pid)
    await revert_purchase(p)
    return {"ok": True}


# Dashboard
@router.get("/dashboard")
async def dashboard():
    s = await get_settings()
    month = now_iso()[:7]
    pendentes = await db.nfe_documents.count_documents({"status": {"$in": ["resumo", "manifestada", "xml_completo"]}})
    month_rows = await db.purchases.aggregate([{"$match": {"data_entrada": {"$regex": f"^{month}"}}},
                                               {"$group": {"_id": None, "total": {"$sum": "$valor_total"},
                                                           "qtd": {"$sum": 1}}}]).to_list(1)
    monthly = await db.purchases.aggregate([{"$group": {"_id": {"$substr": ["$data_entrada", 0, 7]},
                                                        "total": {"$sum": "$valor_total"}}},
                                            {"$sort": {"_id": -1}}, {"$limit": 6}]).to_list(6)
    low = await db.products.find({"$expr": {"$and": [{"$gt": ["$estoque_minimo", 0]},
                                                      {"$lte": ["$estoque", "$estoque_minimo"]}]}},
                                 {"_id": 0}).to_list(10)
    return {
        "notas_pendentes": pendentes,
        "compras_mes_total": round(month_rows[0]["total"], 2) if month_rows else 0,
        "compras_mes_qtd": month_rows[0]["qtd"] if month_rows else 0,
        "produtos": await db.products.count_documents({}),
        "fornecedores": await db.suppliers.count_documents({}),
        "mensal": [{"mes": m["_id"], "total": round(m["total"], 2)} for m in reversed(monthly)],
        "estoque_baixo": low,
        "ultimas_compras": await db.purchases.find({}, {"_id": 0, "items": 0}).sort("created_at", -1).to_list(5),
        "ultimos_logs": await db.sync_logs.find({}, {"_id": 0}).sort("at", -1).to_list(5),
        "cert": {k: s["cert"][k] for k in ("subject", "not_after", "cnpj")} if s.get("cert") else None,
        "cnpj": s.get("cnpj"),
        "last_sync_at": s.get("last_sync_at"),
        "next_sync_at": s.get("next_sync_at"),
        "auto_sync": s.get("auto_sync"),
    }
