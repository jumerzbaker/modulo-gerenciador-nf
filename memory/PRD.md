# PRD — Módulo de Entrada de Compras (NF-e)

## Problema original
"preciso inserir no meu sistema de estoque, uma ferramenta que puxa as notas fiscais emitidas contra o CNPJ da empresa do meu marido, automaticamente do site da receita para realizar a importação dos produtos comprados. Isso ajudará no processo de compras. Considere também incluir o meio de importação via xml e também a importação de compras manualmente."

## Escolhas do usuário
- Módulo separado (tem sistema próprio, vai integrar depois)
- Possui Certificado Digital A1 (.pfx)
- Login e-mail/senha (JWT, cookies httpOnly)
- Itens vinculados a produto existente ou criados automaticamente, somando ao estoque
- Visual profissional, limpo, painel administrativo (pt-BR)

## Arquitetura
- Backend FastAPI: core.py (db, auth, criptografia Fernet), sefaz.py (NFeDistribuicaoDFe mTLS, consChNFe, Manifestação 210210 com XMLDSig rsa-sha1, sincronização automática de hora em hora), nfe_parser.py, purchase_service.py (custo médio ponderado, vínculo por código do fornecedor/EAN/nome, estorno), routes_*.py
- Frontend React + shadcn: Painel, Notas SEFAZ, Importar XML, Revisão/Mapeamento, Compra manual, Compras, Produtos, Fornecedores, Configurações
- Mongo: users, settings, nfe_documents, products, suppliers, purchases, sync_logs

## Implementado (jun/2026)
- Auth JWT + admin padrão
- Certificado A1 criptografado, validação de CNPJ/validade
- Sincronização SEFAZ (distNSU, respeita cStat 137/656 com espera de 1h), Ciência automática, download do XML completo por chave, cancelamentos
- Importação XML múltipla com deduplicação por chave
- Revisão com sugestão automática, fator de conversão, criação de produtos
- Compra manual, histórico, estorno, download de XML
- CRUD de produtos/fornecedores, painel com métricas

## Não validado
- Ida e volta real com a SEFAZ (depende do certificado real da empresa)

## Backlog
- P1: API/exportação (CSV/JSON) para integrar ao sistema de estoque existente
- P1: Confirmação da Operação / Desconhecimento (outros eventos de manifestação)
- P2: Vários usuários e permissões, alertas por e-mail de novas notas, sugestão de preço de venda por margem
