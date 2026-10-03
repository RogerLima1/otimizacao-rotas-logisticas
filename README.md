# Otimização de Rotas Logísticas 


## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+ com extensão PostGIS
- psql (linha de comando) ou pgAdmin
- Internet (só na hora de gerar cenários — usa Nominatim + OSRM)

## Instalando o projeto

Certifique-se de ter Node.js 18+ e PostgreSQL 14+ (com a extensão
PostGIS) instalados na sua máquina.

Rodar o projeto:

1. Faça um clone do projeto para sua máquina local

```
git clone https://github.com/RogerLima1/otimizacao-rotas-logisticas.git
```

2. Crie o banco de dados e rode o schema

```
createdb rotas_logisticas
psql -d rotas_logisticas -f database/schema.sql
```

3. Entre na pasta do backend e instale as dependências

```
cd backend
npm install
```

4. Crie o arquivo `.env` dentro da pasta `backend` com as credenciais
   do seu PostgreSQL local

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rotas_logisticas
DB_USER=postgres
DB_PASSWORD=sua_senha_aqui
```

5. Suba o servidor

```
npm start
```

6. Teste se a API e o banco estão respondendo

```
curl http://localhost:3000/api/teste-banco
```

7. Abra o frontend

Abra `frontend/index.html` no navegador (o backend precisa estar
rodando na porta 3000). O campo **Origem** vem travado no nó de
origem do cenário (a UNESC) — só o **Destino** é selecionável.

8. Gere os cenários

```
node scripts/gerarCenarioTintas.js tintas_pequeno 9
node scripts/gerarCenarioTintas.js tintas_medio 14
node scripts/gerarCenarioTintas.js tintas_grande 19
```

Geocodifica os endereços reais (Nominatim) e calcula a rota real pelas
ruas entre pontos próximos (OSRM). Leva de 1 a 3 minutos por cenário.
Rodar o mesmo nome de novo apaga e recria os dados daquele cenário.

9. Rode a bateria de experimentos

```
node scripts/rodarExperimentosCompletos.js
```

Roda os 3 algoritmos em vários pares origem/destino, salva no banco e
exporta CSVs em `backend/resultados/`. Parâmetros opcionais:
`--repeticoes=N` (default 10) e `--maxPares=N` (default 60).

Rodar de novo para um cenário apaga as execuções antigas dele antes de
gravar as novas.

10. Valide a corretude dos algoritmos

```
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
| `/api/experimentos/rodar?cenario=X&repeticoes=5&maxPares=1000` | Roda os experimentos sob demanda e atualiza o resumo |

