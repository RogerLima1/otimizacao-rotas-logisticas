# Otimização de Rotas Logísticas — UNESC → Revendas de Tinta

Aplicação para o TCC de comparação dos algoritmos **Dijkstra**,
**Bellman-Ford** e **A\*** em um cenário logístico real: entregas da
UNESC até revendas/indústrias de tinta de Criciúma, Içara e
Siderópolis, com ruas reais (roteamento via OSRM).

## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+ com extensão PostGIS
- psql (linha de comando) ou pgAdmin
- Internet (só na hora de gerar cenários — usa Nominatim + OSRM)

## 1. Banco de dados

```bash
createdb rotas_logisticas
psql -d rotas_logisticas -f database/schema.sql
```

## 2. Backend

```bash
cd backend
npm install
```

Ajuste o `.env` com seu usuário/senha do PostgreSQL:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rotas_logisticas
DB_USER=postgres
DB_PASSWORD=sua_senha_aqui


Suba o servidor:

```bash
npm start
```

Teste: `curl http://localhost:3000/api/teste-banco`

## 3. Frontend

Abra `frontend/index.html` no navegador (backend precisa estar
rodando na porta 3000).

O campo **Origem** vem travado no nó de origem do cenário (a UNESC) —
só o **Destino** é selecionável.

## 4. Gerar os cenários

```bash
cd backend
node scripts/gerarCenarioTintas.js tintas_pequeno 9
node scripts/gerarCenarioTintas.js tintas_medio 14
node scripts/gerarCenarioTintas.js tintas_grande 19
```

Geocodifica os endereços reais (Nominatim) e calcula a rota real pelas
ruas entre pontos próximos (OSRM). Leva de 1 a 3 minutos por cenário.
Rodar o mesmo nome de novo apaga e recria os dados daquele cenário.

## 5. Rodar a bateria de experimentos

```bash
node scripts/rodarExperimentosCompletos.js
```

Roda os 3 algoritmos em vários pares origem/destino, salva no banco e
exporta CSVs em `backend/resultados/`. Parâmetros opcionais:
`--repeticoes=N` (default 10) e `--maxPares=N` (default 60).

Rodar de novo para um cenário apaga as execuções antigas dele antes de
gravar as novas.

## 6. Validar corretude dos algoritmos

```bash
node scripts/validarAlgoritmos.js
```

Confirma que os 3 algoritmos produzem a mesma distância para os mesmos
pares (esperado, já que resolvem o mesmo problema).

## Endpoints principais

| Rota | Descrição |
|---|---|
| `/api/cenarios` | Lista os cenários existentes |
| `/api/rotas/dijkstra?cenario=X&origem=1&destino=8` | Calcula rota (troque `dijkstra` por `bellman-ford` ou `a-star`) |
| `/api/rotas/entrega?cenario=X` | Rota completa: origem → todos os pontos → origem |
| `/api/experimentos/resumo?cenario=X` | Estatísticas agregadas dos experimentos |

## Limpar um cenário do banco

```sql
DELETE FROM experiments WHERE scenario = 'nome_do_cenario';
DELETE FROM edges WHERE scenario = 'nome_do_cenario';
DELETE FROM nodes WHERE scenario = 'nome_do_cenario';
```