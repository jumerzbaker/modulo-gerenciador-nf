"""End-to-end backend tests for the NF-e stock system.

Covers: auth, XML upload, notes list/filter, review, import (create products +
weighted stock), supplier auto-create, re-import prevention, second XML w/
supplier-code linking, purchase revert, manual purchase, catalog CRUD,
settings + certificate upload/remove and SEFAZ graceful failure.
"""
import os
import time
from pathlib import Path

import pytest
import requests

_url = os.environ.get("REACT_APP_BACKEND_URL")
if not _url:
    # read from frontend .env
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            _url = line.split("=", 1)[1].strip()
            break
BASE = _url.rstrip("/") + "/api"
FIX = Path("/app/tests/fixtures")


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": "admin@estoque.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session", autouse=True)
def clean_db(client):
    """Purge test data between runs so tests are deterministic."""
    # revert purchases first (updates products), then wipe
    for p in client.get(f"{BASE}/purchases").json():
        client.delete(f"{BASE}/purchases/{p['id']}")
    for d in client.get(f"{BASE}/documents").json():
        client.delete(f"{BASE}/documents/{d['id']}")
    for p in client.get(f"{BASE}/products").json():
        client.delete(f"{BASE}/products/{p['id']}")
    for s_ in client.get(f"{BASE}/suppliers").json():
        client.delete(f"{BASE}/suppliers/{s_['id']}")
    client.delete(f"{BASE}/settings/certificate")
    yield


# ---------- auth ----------
class TestAuth:
    def test_login_wrong_password(self):
        r = requests.post(f"{BASE}/auth/login", json={"email": "admin@estoque.com", "password": "wrong"})
        assert r.status_code == 401
        assert "senha" in r.json()["detail"].lower() or "email" in r.json()["detail"].lower()

    def test_me_without_cookie(self):
        r = requests.get(f"{BASE}/auth/me")
        assert r.status_code == 401

    def test_login_and_me(self, client):
        r = client.get(f"{BASE}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == "admin@estoque.com"

    def test_logout(self):
        s = requests.Session()
        s.post(f"{BASE}/auth/login", json={"email": "admin@estoque.com", "password": "admin123"})
        r = s.post(f"{BASE}/auth/logout")
        assert r.status_code == 200
        # After logout, cookie is gone; hitting me should 401
        s.cookies.clear()
        assert s.get(f"{BASE}/auth/me").status_code == 401


# ---------- settings ----------
class TestSettings:
    def test_save_settings(self, client):
        r = client.put(f"{BASE}/settings", json={"cnpj": "11222333000181", "razao_social": "EMPRESA DESTINO",
                                                 "uf": "SP", "ambiente": 2, "auto_sync": False, "auto_manifest": True})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cnpj"] == "11222333000181"
        assert data["uf"] == "SP"

    def test_bad_cnpj(self, client):
        r = client.put(f"{BASE}/settings", json={"cnpj": "123", "uf": "SP", "ambiente": 1})
        assert r.status_code == 400

    def test_upload_cert_wrong_password(self, client):
        with open(FIX / "certificado_teste.pfx", "rb") as f:
            r = client.post(f"{BASE}/settings/certificate", files={"file": ("c.pfx", f, "application/x-pkcs12")},
                            data={"password": "wrong"})
        assert r.status_code == 400

    def test_upload_cert_ok(self, client):
        with open(FIX / "certificado_teste.pfx", "rb") as f:
            r = client.post(f"{BASE}/settings/certificate", files={"file": ("c.pfx", f, "application/x-pkcs12")},
                            data={"password": "teste123"})
        assert r.status_code == 200, r.text
        cert = r.json()["cert"]
        assert cert and "11222333000181" in cert["cnpj"]
        # GET settings should include cert
        s = client.get(f"{BASE}/settings").json()
        assert s["cert"]["cnpj"] == "11222333000181"


# ---------- XML upload + import ----------
class TestXmlImport:
    def test_upload_invalid_xml(self, client):
        with open(FIX / "invalido.xml", "rb") as f:
            r = client.post(f"{BASE}/documents/upload-xml", files=[("files", ("i.xml", f, "text/xml"))])
        assert r.status_code == 200
        assert r.json()[0]["ok"] is False

    def test_upload_nfe_1(self, client):
        with open(FIX / "nfe_exemplo_1.xml", "rb") as f:
            r = client.post(f"{BASE}/documents/upload-xml", files=[("files", ("nfe1.xml", f, "text/xml"))])
        assert r.status_code == 200, r.text
        entry = r.json()[0]
        assert entry["ok"] is True
        assert entry["novo"] is True
        assert entry["numero"] == "1234"

    def test_dedup(self, client):
        with open(FIX / "nfe_exemplo_1.xml", "rb") as f:
            r = client.post(f"{BASE}/documents/upload-xml", files=[("files", ("nfe1.xml", f, "text/xml"))])
        entry = r.json()[0]
        assert entry["ok"] is True
        assert entry["novo"] is False

    def test_list_documents(self, client):
        docs = client.get(f"{BASE}/documents").json()
        assert any(d["numero"] == "1234" for d in docs)

    def test_review_and_import_1(self, client):
        docs = client.get(f"{BASE}/documents").json()
        doc = next(d for d in docs if d["numero"] == "1234")
        rev = client.get(f"{BASE}/documents/{doc['id']}/review").json()
        assert len(rev["items"]) == 3
        # None of items have suggestions yet (empty catalog)
        assert all(i.get("sugestao") is None for i in rev["items"])

        lines = []
        for it in rev["items"]:
            fator = 12 if it["descricao"].startswith("CAFE") else 1
            lines.append({"n_item": it["n_item"], "new_product": {"nome": it["descricao"], "ean": it.get("ean", ""),
                                                                   "ncm": it.get("ncm", ""),
                                                                   "unidade": it.get("unidade", "UN")},
                          "fator": fator})
        r = client.post(f"{BASE}/documents/{doc['id']}/import", json={"lines": lines, "observacao": "test"})
        assert r.status_code == 200, r.text
        purchase = r.json()
        assert purchase["valor_total"] == 348.00

        # Verify stock: café 2*12=24; açúcar 10; leite 12
        products = {p["nome"]: p for p in client.get(f"{BASE}/products").json()}
        assert products["CAFE TORRADO 500G"]["estoque"] == 24
        assert products["ACUCAR REFINADO 1KG"]["estoque"] == 10
        assert products["LEITE INTEGRAL 1L"]["estoque"] == 12
        # custo_medio café = 240/24 = 10
        assert round(products["CAFE TORRADO 500G"]["custo_medio"], 2) == 10.00

        # Supplier auto-created
        suppliers = client.get(f"{BASE}/suppliers").json()
        assert any(s["cnpj"] == "12345678000195" for s in suppliers)

    def test_reimport_fails(self, client):
        doc = next(d for d in client.get(f"{BASE}/documents").json() if d["numero"] == "1234")
        assert doc["status"] == "importada"
        # Try to import again
        r = client.post(f"{BASE}/documents/{doc['id']}/import", json={"lines": []})
        assert r.status_code == 400
        assert "importada" in r.json()["detail"].lower()

    def test_upload_and_import_2_suggests(self, client):
        with open(FIX / "nfe_exemplo_2.xml", "rb") as f:
            r = client.post(f"{BASE}/documents/upload-xml", files=[("files", ("nfe2.xml", f, "text/xml"))])
        entry = r.json()[0]
        assert entry["ok"] is True
        doc_id = entry["id"]
        rev = client.get(f"{BASE}/documents/{doc_id}/review").json()
        cafe_item = next(i for i in rev["items"] if i["codigo"] == "A100")
        # Café should be auto-suggested via supplier code (or ean)
        assert cafe_item.get("sugestao") is not None
        assert cafe_item["sugestao"]["motivo"] in ("codigo_fornecedor", "ean")
        cafe_prod_id = cafe_item["sugestao"]["product_id"]

        filtro_item = next(i for i in rev["items"] if i["codigo"] == "B900")
        assert filtro_item.get("sugestao") is None

        lines = [
            {"n_item": cafe_item["n_item"], "product_id": cafe_prod_id, "fator": 12},
            {"n_item": filtro_item["n_item"],
             "new_product": {"nome": "FILTRO DE PAPEL 103", "unidade": "PCT"}, "fator": 1},
        ]
        r = client.post(f"{BASE}/documents/{doc_id}/import", json={"lines": lines})
        assert r.status_code == 200, r.text

        products = {p["nome"]: p for p in client.get(f"{BASE}/products").json()}
        # café: previous 24 + 1*12 = 36; total cost 240 + 130 = 370; avg 370/36 ≈ 10.277778
        assert products["CAFE TORRADO 500G"]["estoque"] == 36
        assert round(products["CAFE TORRADO 500G"]["custo_medio"], 4) == round(370 / 36, 4)
        # supplier still one
        cnpj_count = sum(1 for s in client.get(f"{BASE}/suppliers").json() if s["cnpj"] == "12345678000195")
        assert cnpj_count == 1


# ---------- purchases ----------
class TestPurchase:
    def test_list_and_get(self, client):
        purchases = client.get(f"{BASE}/purchases").json()
        assert len(purchases) >= 2
        pid = purchases[0]["id"]
        assert client.get(f"{BASE}/purchases/{pid}").status_code == 200

    def test_download_xml(self, client):
        docs = [d for d in client.get(f"{BASE}/documents").json() if d["status"] == "importada"]
        r = client.get(f"{BASE}/documents/{docs[0]['id']}/xml")
        assert r.status_code == 200
        assert b"nfeProc" in r.content

    def test_revert_purchase(self, client):
        # Revert the second purchase (nfe 1235)
        purchase = next(p for p in client.get(f"{BASE}/purchases").json() if p["numero"] == "1235")
        products_before = {p["nome"]: p["estoque"] for p in client.get(f"{BASE}/products").json()}
        r = client.delete(f"{BASE}/purchases/{purchase['id']}")
        assert r.status_code == 200
        products_after = {p["nome"]: p["estoque"] for p in client.get(f"{BASE}/products").json()}
        assert products_after["CAFE TORRADO 500G"] == products_before["CAFE TORRADO 500G"] - 12
        # Note status back to xml_completo
        doc = next(d for d in client.get(f"{BASE}/documents").json() if d["numero"] == "1235")
        assert doc["status"] == "xml_completo"

    def test_manual_purchase(self, client):
        # Reference existing product + a new one
        prods = client.get(f"{BASE}/products").json()
        existing = next(p for p in prods if p["nome"] == "ACUCAR REFINADO 1KG")
        payload = {
            "new_supplier": {"nome": "FORNECEDOR MANUAL"},
            "numero": "M-001", "data_emissao": "2026-01-10", "data_entrada": "2026-01-10",
            "items": [
                {"product_id": existing["id"], "descricao": existing["nome"], "unidade": "UN",
                 "quantidade": 5, "fator": 1, "valor_unitario": 5.00},
                {"new_product": {"nome": "OLEO DE SOJA 900ML", "unidade": "UN"}, "descricao": "OLEO",
                 "unidade": "UN", "quantidade": 3, "fator": 1, "valor_unitario": 10.00},
            ],
        }
        r = client.post(f"{BASE}/purchases/manual", json=payload)
        assert r.status_code == 200, r.text
        prods_after = {p["nome"]: p for p in client.get(f"{BASE}/products").json()}
        assert prods_after["ACUCAR REFINADO 1KG"]["estoque"] == 15
        assert prods_after["OLEO DE SOJA 900ML"]["estoque"] == 3


# ---------- catalog CRUD ----------
class TestCatalog:
    def test_product_crud(self, client):
        r = client.post(f"{BASE}/products", json={"nome": "TEST_PROD", "unidade": "UN"})
        assert r.status_code == 200
        pid = r.json()["id"]
        r = client.put(f"{BASE}/products/{pid}", json={"nome": "TEST_PROD_UP", "unidade": "UN"})
        assert r.status_code == 200
        assert r.json()["nome"] == "TEST_PROD_UP"
        assert client.delete(f"{BASE}/products/{pid}").status_code == 200

    def test_supplier_crud(self, client):
        r = client.post(f"{BASE}/suppliers", json={"nome": "TEST_SUP", "cnpj": "99887766000155"})
        assert r.status_code == 200
        sid = r.json()["id"]
        r = client.put(f"{BASE}/suppliers/{sid}", json={"nome": "TEST_SUP_UP", "cnpj": "99887766000155"})
        assert r.status_code == 200
        # Duplicate CNPJ rejected
        dup = client.post(f"{BASE}/suppliers", json={"nome": "X", "cnpj": "99887766000155"})
        assert dup.status_code == 400
        assert client.delete(f"{BASE}/suppliers/{sid}").status_code == 200


# ---------- dashboard + sefaz graceful ----------
class TestDashboardAndSefaz:
    def test_dashboard(self, client):
        d = client.get(f"{BASE}/dashboard").json()
        for k in ("notas_pendentes", "compras_mes_total", "produtos", "fornecedores", "mensal"):
            assert k in d

    def test_sync_now_graceful_error(self, client):
        # ensure cert loaded (from settings tests). Real SEFAZ will reject the self-signed cert.
        s = client.get(f"{BASE}/settings").json()
        if not s.get("cert"):
            pytest.skip("no cert loaded")
        r = client.post(f"{BASE}/sefaz/sync", timeout=180)
        # Must not be 200 - self-signed cert cannot pass real SEFAZ mTLS
        assert r.status_code >= 400
        # NOTE: backend currently raises HTTPException(502) for SEFAZ failures.
        # Cloudflare intercepts 502 responses and replaces them with its own HTML error page,
        # so the frontend never sees the friendly SEFAZ error message. This is a real bug.
        # We only require here that the request fails cleanly (no server crash).
        assert r.status_code in (400, 429, 502, 504), f"unexpected {r.status_code}: {r.text[:200]}"

    def test_remove_certificate(self, client):
        r = client.delete(f"{BASE}/settings/certificate")
        assert r.status_code == 200
        assert client.get(f"{BASE}/settings").json()["cert"] is None
