const pool = require('../src/db/database');
const dijkstra = require('../src/algorithms/dijkstra');
const bellmanFord = require('../src/algorithms/bellmanFord');
const aStar = require('../src/algorithms/aStar');

const TOLERANCIA_KM = 0.01;

async function descobrirCenarios() {
    const resultado = await pool.query(
        `SELECT DISTINCT scenario FROM nodes ORDER BY scenario`
    );
    return resultado.rows.map(r => r.scenario);
}

async function buscarGrafo(cenario) {
    const resultadoNodes = await pool.query(
        `SELECT * FROM nodes WHERE scenario = $1 ORDER BY id`,
        [cenario]
    );
    const resultadoEdges = await pool.query(
        `SELECT * FROM edges WHERE scenario = $1 ORDER BY id`,
        [cenario]
    );
    return { nodes: resultadoNodes.rows, edges: resultadoEdges.rows };
}

async function validarCenario(cenario) {
    const { nodes, edges } = await buscarGrafo(cenario);

    if (nodes.length < 2) {
        console.log(`[${cenario}] Ignorado (menos de 2 nós).`);
        return { testados: 0, falhas: 0 };
    }

    const ids = nodes.map(n => n.id);
    let testados = 0;
    let falhas = 0;
    let semRotaDivergente = 0;

    for (const origem of ids) {
        for (const destino of ids) {
            if (origem === destino) continue;

            const resDijkstra = dijkstra(nodes, edges, origem, destino);
            const resBellman = bellmanFord(nodes, edges, origem, destino);
            const resAStar = aStar(nodes, edges, origem, destino);

            testados++;

            const alcancavel = [resDijkstra, resBellman, resAStar];
            const algumAlcancavel = alcancavel.some(r => r !== null);
            const todosAlcancaveis = alcancavel.every(r => r !== null);

            if (algumAlcancavel && !todosAlcancaveis) {
                semRotaDivergente++;
                falhas++;
                console.error(
                    `[${cenario}] FALHA (${origem}->${destino}): algoritmos ` +
                    `divergem sobre se existe rota. Dijkstra=` +
                    `${resDijkstra ? 'encontrou' : 'não encontrou'}, ` +
                    `Bellman-Ford=${resBellman ? 'encontrou' : 'não encontrou'}, ` +
                    `A*=${resAStar ? 'encontrou' : 'não encontrou'}`
                );
                continue;
            }

            if (!todosAlcancaveis) {
                continue;
            }

            const distancias = {
                Dijkstra: resDijkstra.distancia_km,
                'Bellman-Ford': resBellman.distancia_km,
                'A*': resAStar.distancia_km
            };

            const valores = Object.values(distancias);
            const maxDiff = Math.max(...valores) - Math.min(...valores);

            if (maxDiff > TOLERANCIA_KM) {
                falhas++;
                console.error(
                    `[${cenario}] FALHA (${origem}->${destino}): distâncias ` +
                    `divergem além da tolerância (${TOLERANCIA_KM} km): ` +
                    JSON.stringify(distancias)
                );
            }
        }
    }

    console.log(
        `[${cenario}] Pares testados: ${testados} | ` +
        `Divergências de alcançabilidade: ${semRotaDivergente} | ` +
        `Divergências de distância: ${falhas - semRotaDivergente} | ` +
        `Resultado: ${falhas === 0 ? 'TODOS OS TESTES PASSARAM ✓' : 'HÁ FALHAS ✗'}`
    );

    return { testados, falhas };
}

async function main() {
    const cenarioArgumento = process.argv[2];
    const cenarios = cenarioArgumento
        ? [cenarioArgumento]
        : await descobrirCenarios();

    if (cenarios.length === 0) {
        console.error('Nenhum cenário encontrado no banco.');
        process.exitCode = 1;
        return;
    }

    console.log(`Validando corretude dos algoritmos nos cenários: ` +
        `${cenarios.join(', ')}\n`);

    let totalTestados = 0;
    let totalFalhas = 0;

    for (const cenario of cenarios) {
        const { testados, falhas } = await validarCenario(cenario);
        totalTestados += testados;
        totalFalhas += falhas;
    }

    console.log(`\n=== RESULTADO FINAL ===`);
    console.log(`Total de pares testados: ${totalTestados}`);
    console.log(`Total de divergências encontradas: ${totalFalhas}`);
    console.log(
        totalFalhas === 0
            ? 'Todos os algoritmos produziram rotas equivalentes em todos os testes. ✓'
            : 'Foram encontradas divergências — revise os algoritmos antes de usar os resultados no TCC. ✗'
    );

    process.exitCode = totalFalhas === 0 ? 0 : 1;
}

main()
    .catch(erro => {
        console.error('Erro ao validar algoritmos:', erro);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
