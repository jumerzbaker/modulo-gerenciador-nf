from lxml import etree


def _txt(node, path):
    if node is None:
        return ""
    return (node.xpath(f"string({path})") or "").strip()


def _num(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _first(root, name):
    found = root.xpath(f"//*[local-name()='{name}']")
    return found[0] if found else None


def _ln(name):
    return f"./*[local-name()='{name}']"


def parse_nfe_xml(xml_bytes: bytes) -> dict:
    """Parse a full NF-e (NFe or nfeProc) into header + items."""
    try:
        root = etree.fromstring(xml_bytes, parser=etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError:
        raise ValueError("Arquivo XML inválido")
    inf = _first(root, "infNFe")
    if inf is None:
        raise ValueError("O XML não é uma NF-e (infNFe não encontrado)")
    ide = inf.xpath(_ln("ide"))
    ide = ide[0] if ide else None
    emit = inf.xpath(_ln("emit"))
    emit = emit[0] if emit else None
    dest = inf.xpath(_ln("dest"))
    dest = dest[0] if dest else None
    tot = _first(inf, "ICMSTot")
    items = []
    for det in inf.xpath(_ln("det")):
        prod = det.xpath(_ln("prod"))
        if not prod:
            continue
        p = prod[0]
        ean = _txt(p, _ln("cEAN"))
        items.append({
            "n_item": int(det.get("nItem") or len(items) + 1),
            "codigo": _txt(p, _ln("cProd")),
            "ean": "" if ean.upper() == "SEM GTIN" else ean,
            "descricao": _txt(p, _ln("xProd")),
            "ncm": _txt(p, _ln("NCM")),
            "cfop": _txt(p, _ln("CFOP")),
            "unidade": _txt(p, _ln("uCom")),
            "quantidade": _num(_txt(p, _ln("qCom"))),
            "valor_unitario": _num(_txt(p, _ln("vUnCom"))),
            "valor_desconto": _num(_txt(p, _ln("vDesc"))),
            "valor_total": _num(_txt(p, _ln("vProd"))),
        })
    chave = (inf.get("Id") or "").replace("NFe", "")
    return {
        "chave": chave,
        "numero": _txt(ide, _ln("nNF")),
        "serie": _txt(ide, _ln("serie")),
        "data_emissao": _txt(ide, _ln("dhEmi")) or _txt(ide, _ln("dEmi")),
        "natureza": _txt(ide, _ln("natOp")),
        "emit_cnpj": _txt(emit, _ln("CNPJ")) or _txt(emit, _ln("CPF")),
        "emit_nome": _txt(emit, _ln("xNome")),
        "emit_fantasia": _txt(emit, _ln("xFant")),
        "emit_ie": _txt(emit, _ln("IE")),
        "emit_uf": _txt(emit, "./*[local-name()='enderEmit']/*[local-name()='UF']"),
        "emit_cidade": _txt(emit, "./*[local-name()='enderEmit']/*[local-name()='xMun']"),
        "dest_cnpj": _txt(dest, _ln("CNPJ")) or _txt(dest, _ln("CPF")),
        "valor_produtos": _num(_txt(tot, _ln("vProd"))),
        "valor_frete": _num(_txt(tot, _ln("vFrete"))),
        "valor_desconto": _num(_txt(tot, _ln("vDesc"))),
        "valor_total": _num(_txt(tot, _ln("vNF"))),
        "items": items,
    }


def parse_res_nfe(root) -> dict:
    """Parse a resNFe summary element returned by the distribution service."""
    return {
        "chave": _txt(root, _ln("chNFe")),
        "emit_cnpj": _txt(root, _ln("CNPJ")) or _txt(root, _ln("CPF")),
        "emit_nome": _txt(root, _ln("xNome")),
        "emit_ie": _txt(root, _ln("IE")),
        "data_emissao": _txt(root, _ln("dhEmi")),
        "valor_total": _num(_txt(root, _ln("vNF"))),
        "situacao": _txt(root, _ln("cSitNFe")),
        "numero": "",
        "serie": "",
        "items": [],
    }
