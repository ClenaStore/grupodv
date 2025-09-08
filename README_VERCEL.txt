# Deploy no Vercel

## Variáveis de ambiente (Environment Variables)
Defina as seguintes variáveis no projeto:

- **UPSTREAM_ABC_VENDAS** = `https://script.google.com/macros/s/AKfycbxu0HjXsbvXr9OGYDAEfN8Kqyle4d2GFb26wu8aAcAtfM-RkcILV9AywDjf1Fu8rW_NwQ/exec`
- **UPSTREAM_AVALIACOES** = `https://script.google.com/macros/s/AKfycbyK3A5CDn_EgA3pbRVToh87_qKWvbIry886OkR1AdkJi7RyvSgcwY0BmRqhbKQnEKwgrA/exec`
- **UPSTREAM_CANCELAMENTOS** = `https://script.google.com/macros/s/AKfycby6kNirWdyaFymip0MFrqTNoItMgqkXJrzwf41Qxe2P1j8BoBILtnyws8o4f5sUdg-T3w/exec`
- **UPSTREAM_CONCILIACAO** = `https://script.google.com/macros/s/AKfycbypZ0ibLQGEbGLQNr-UdmmSn-fbde-nz4KUt6RFUjp0lZbHmGTxcHvKVZmmFxL5b5roLA/exec`
- **UPSTREAM_COUVERT_ABC** = `https://script.google.com/macros/s/AKfycbxxv-9kLzyqS9Qy8WX_qPp7UG8He3OaEbIxZMV3HoRaSpdBfRYqZZZODLQlIJZDufso/exec`
- **UPSTREAM_COUVERT_PAGAMENTOS** = `https://script.google.com/macros/s/AKfycbxWaj8E9HFvxJLojit8u8dvTopG0RLTtbBXQdmD6U93dgBSiupHyu79idCkeFD0a4FZ6w/exec`
- **UPSTREAM_DELIVERY** = `https://script.google.com/macros/s/AKfycby3tGjtsUXcak51bcWG175VU4SWT2RV6pA9vJLyQxlMXSt3bGJFoi2R0YmDmuwzbcbOnw/exec`
- **UPSTREAM_LOGIN_API** = `https://script.google.com/macros/s/AKfycbzVR_6hWjV3znWB41HQjhUhGjDT-nq9RmIJy89LXETGJ9tJmf9_cAv6msxa7MNCf4JpZw/exec`
- **UPSTREAM_META** = `https://script.google.com/macros/s/AKfycbzyiL6yNCj_FYWiQ2PS88mthToCvWM1wJ0q7CQy8asyg-59L8YezKzFY6d-lgQU0ni3/exec`
- **UPSTREAM_RESERVAS** = `https://script.google.com/macros/s/AKfycbxWbA4zKPe771UKHhq5N5Hq3LuLECoYa-a4S6dcb4wJvK03A8NDmnRZGOmoJ50rlNVP/exec`
- **UPSTREAM_RESUMO_FINANCEIRO** = `https://script.google.com/macros/s/AKfycbz9GQLrIB4oiX0jBQ7yaDO_IiMz3ER7lQT094sp5y2VUGgQWBaz3G1fa7s4ZbiWli_O/exec`
- **UPSTREAM_TRAVAS_COMPARACAO** = `https://script.google.com/macros/s/AKfycbyDGQ-srD7OFMORoRo7ZH2BDaz_tJVVlsqjdlLTI0OpkEKv3tQ5Ny02h3blo7GKjsFEIw/exec`
- **APP_PASSWORD** = `sua-senha-secreta`  *(a mesma que o usuário digitará no primeiro acesso; ficará salva no localStorage)*

## Endpoints
- `/api/abc_vendas` → `UPSTREAM_ABC_VENDAS`
- `/api/avaliacoes` → `UPSTREAM_AVALIACOES`
- `/api/cancelamentos` → `UPSTREAM_CANCELAMENTOS`
- `/api/conciliacao` → `UPSTREAM_CONCILIACAO`
- `/api/couvert_abc` → `UPSTREAM_COUVERT_ABC`
- `/api/couvert_pagamentos` → `UPSTREAM_COUVERT_PAGAMENTOS`
- `/api/delivery` → `UPSTREAM_DELIVERY`
- `/api/login_api` → `UPSTREAM_LOGIN_API`
- `/api/meta` → `UPSTREAM_META`
- `/api/reservas` → `UPSTREAM_RESERVAS`
- `/api/resumo_financeiro` → `UPSTREAM_RESUMO_FINANCEIRO`
- `/api/travas_comparacao` → `UPSTREAM_TRAVAS_COMPARACAO`
- `/api/ping` → teste de senha

## Observação
Os HTML desta pasta já foram ajustados para usar os endpoints `/api/...` e anexam automaticamente o cabeçalho `x-api-key` com a senha salva no `localStorage`.