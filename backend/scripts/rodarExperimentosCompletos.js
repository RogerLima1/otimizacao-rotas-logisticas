const fs = require('fs');
const path = require('path');

const pool = require('../src/db/database');
const { listarCenarios, buscarGrafo } = require('../src/db/grafo');
const dijkstra = require('../src/algorithms/dijkstra');
const bellmanFord = require('../src/algorithms/bellmanFord');
const aStar = require('../src/algorithms/aStar');
const {
    MAX_NOS_ENTREGA,
    encontrarOrigem,
    calcularRotaEntrega
} = require('../src/algorithms/rotaEntrega');

const ALGORITMOS = [
    { nome: 'Dijkstra', funcao: dijkstra },
    { nome: 'Bellman-Ford', funcao: bellmanFord },
    { nome: 'A*', funcao: aStar }
];

function parseArgumentos() {
    const cenarios = [];
    const flags = { repeticoes: 10 };

    process.argv.slice(2).forEach(arg => {
        if (arg.startsWith('--repeticoes=')) {
            flags.repeticoes = Number(arg.split('=')[1]);
        } else {
            cenarios.push(arg);
        }
    });

    return { cenarios, flags };
}

function embaralhar(lista) {
    return lista
        .map(item => ({ item, chave: Math.random() }))
        .sort((a, b) => a.chave - b.chave)
        .map(({ item }) => item);
}

const RODADAS_ALEATORIAS = 2;

function mesmaOrdem(a, b) {
    return a.every((algoritmo, i) => algoritmo === b[i]);
}

function montarRodadas() {
    const rodadas = [{ numero: 1, algoritmos: ALGORITMOS }];

    for (let i = 0; i < RODADAS_ALEATORIAS; i++) {
        let ordemAleatoria;

        // Sorteia de novo se repetir a ordem de alguma rodada anterior.
        do {
            ordemAleatoria = embaralhar(ALGORITMOS);
        } while (rodadas.some(r => mesmaOrdem(r.algoritmos, ordemAleatoria)));

        rodadas.push({ numero: rodadas.length + 1, algoritmos: ordemAleatoria });
    }

    return rodadas;
}

// Cada execução é a rota de entrega completa: monta a matriz de caminhos
// mínimos entre todos os pontos e aplica o vizinho mais próximo
// (origem → todos os pontos → origem). O tempo medido cobre as duas etapas.
async function rodarCenario(cenario, repeticoes) {
    console.log(`\n=== Cenário: ${cenario} ===`);

    const { nodes, edges } = await buscarGrafo(cenario);

    if (nodes.length < 2) {
        console.log(`  Ignorado (menos de 2 nós encontrados).`);
        return {
            executado: false,
            mensagem: 'Cenário com menos de 2 nós — nada para testar.'
        };
    }

    if (nodes.length > MAX_NOS_ENTREGA) {
        console.log(`  Ignorado (mais de ${MAX_NOS_ENTREGA} nós).`);
        return {
            executado: false,
            mensagem: `Cenário grande demais para a rota de entrega completa ` +
                `(mais de ${MAX_NOS_ENTREGA} nós).`
        };
    }

    const apagados = await pool.query(
        `DELETE FROM experiments WHERE scenario = $1`,
        [cenario]
    );
    if (apagados.rowCount > 0) {
        console.log(`  ${apagados.rowCount} execuções antigas deste cenário foram apagadas.`);
    }

    const rodadas = montarRodadas();
    const origemId = encontrarOrigem(nodes).id;

    console.log(`  Nós: ${nodes.length} | Arestas: ${edges.length} | ` +
        `Repetições da rota por algoritmo: ${repeticoes}`);

    let inseridos = 0;
    let semRota = 0;
    let inconsistencias = 0;

    for (const rodada of rodadas) {

        console.log(`  Rodada ${rodada.numero}: ` +
            rodada.algoritmos.map(a => a.nome).join(' → '));

        for (let i = 0; i < repeticoes; i++) {

            let distanciaReferencia = null;

            for (const [indice, algoritmo] of rodada.algoritmos.entries()) {
                const inicio = performance.now();
                const { rota } = calcularRotaEntrega(nodes, edges, algoritmo.funcao);
                const execucaoMs = performance.now() - inicio;

                if (!rota.sucesso) {
                    semRota++;
                    continue;
                }

                await pool.query(`
                    INSERT INTO experiments (
                        scenario, algorithm, source_id, target_id,
                        distance_km, travel_time_min, cost_brl,
                        execution_ms, path_nodes, reachable,
                        execution_round, order_position
                    )
                    VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)
                `, [
                    cenario, algoritmo.nome, origemId,
                    rota.distanciaTotalKm, rota.tempoViagemTotalMin,
                    rota.custoTotalBrl, execucaoMs,
                    rota.rotaCompletaIds, rodada.numero, indice + 1
                ]);

                inseridos++;

                if (distanciaReferencia === null) {
                    distanciaReferencia = rota.distanciaTotalKm;
                } else if (Math.abs(rota.distanciaTotalKm - distanciaReferencia) > 0.01) {
                    inconsistencias++;
                    console.warn(
                        `  [ALERTA] Divergência de distância da rota ` +
                        `(${algoritmo.nome}): ${rota.distanciaTotalKm.toFixed(3)} km ` +
                        `vs referência ${distanciaReferencia.toFixed(3)} km`
                    );
                }
            }
        }
    }

    console.log(`  Execuções salvas: ${inseridos} | ` +
        `Rotas que não fecharam: ${semRota} | ` +
        `Divergências entre algoritmos: ${inconsistencias}`);

    return {
        executado: true,
        execucoes_salvas: inseridos,
        rotas_sem_sucesso: semRota,
        divergencias: inconsistencias,
        execucoes_antigas_apagadas: apagados.rowCount,
        rodadas: rodadas.map(r => ({
            numero: r.numero,
            ordem: r.algoritmos.map(a => a.nome)
        }))
    };
}

function paraCsv(linhas, colunas) {
    const cabecalho = colunas.join(';');
    const corpo = linhas.map(linha =>
        colunas.map(coluna => {
            const valor = linha[coluna];
            return valor === null || valor === undefined ? '' : valor;
        }).join(';')
    );
    return [cabecalho, ...corpo].join('\n');
}

async function exportarCsvs(cenarios) {
    const pastaResultados = path.join(__dirname, '..', 'resultados');
    if (!fs.existsSync(pastaResultados)) {
        fs.mkdirSync(pastaResultados, { recursive: true });
    }

    const detalhado = await pool.query(`
        SELECT scenario, execution_round, order_position, algorithm,
               distance_km, travel_time_min, cost_brl,
               execution_ms, created_at
        FROM experiments
        WHERE scenario = ANY($1)
        ORDER BY scenario, execution_round, created_at, order_position
    `, [cenarios]);

    const csvDetalhado = paraCsv(detalhado.rows, [
        'scenario', 'execution_round', 'order_position', 'algorithm',
        'distance_km', 'travel_time_min', 'cost_brl', 'execution_ms', 'created_at'
    ]);

    const caminhoDetalhado = path.join(pastaResultados, 'experimentos_detalhado.csv');
    fs.writeFileSync(caminhoDetalhado, csvDetalhado, 'utf8');

    const resumo = await pool.query(`
        SELECT
            scenario,
            execution_round,
            order_position,
            algorithm,
            COUNT(*) AS execucoes,
            ROUND(AVG(distance_km)::numeric, 3) AS media_distancia_km,
            ROUND(AVG(cost_brl)::numeric, 2) AS media_custo_brl,
            ROUND(AVG(travel_time_min)::numeric, 2) AS media_tempo_min,
            ROUND(AVG(execution_ms)::numeric, 4) AS media_execucao_ms,
            ROUND(STDDEV_POP(execution_ms)::numeric, 4) AS desvio_padrao_execucao_ms,
            ROUND(MIN(execution_ms)::numeric, 4) AS min_execucao_ms,
            ROUND(MAX(execution_ms)::numeric, 4) AS max_execucao_ms,
            ROUND(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_ms)::numeric, 4
            ) AS mediana_execucao_ms
        FROM experiments
        WHERE scenario = ANY($1)
        GROUP BY scenario, execution_round, order_position, algorithm
        ORDER BY scenario, execution_round, order_position
    `, [cenarios]);

    const csvResumo = paraCsv(resumo.rows, [
        'scenario', 'execution_round', 'order_position', 'algorithm',
        'execucoes', 'media_distancia_km',
        'media_custo_brl', 'media_tempo_min', 'media_execucao_ms',
        'desvio_padrao_execucao_ms', 'min_execucao_ms', 'max_execucao_ms',
        'mediana_execucao_ms'
    ]);

    const caminhoResumo = path.join(pastaResultados, 'resumo_estatistico.csv');
    fs.writeFileSync(caminhoResumo, csvResumo, 'utf8');

    console.log(`\nCSV detalhado exportado para: ${caminhoDetalhado}`);
    console.log(`CSV resumo exportado para: ${caminhoResumo}`);

    console.log('\n=== Resumo estatístico ===');
    console.table(resumo.rows);
}

async function main() {
    const { cenarios: cenariosArgumento, flags } = parseArgumentos();

    const cenarios = cenariosArgumento.length > 0
        ? cenariosArgumento
        : await listarCenarios();

    if (cenarios.length === 0) {
        console.error(
            'Nenhum cenário encontrado no banco. Gere um cenário antes com ' +
            'node scripts/gerarCenarioTintas.js.'
        );
        process.exitCode = 1;
        return;
    }

    console.log(`Cenários a processar: ${cenarios.join(', ')}`);
    console.log(`Repetições da rota por algoritmo: ${flags.repeticoes}`);

    for (const cenario of cenarios) {
        await rodarCenario(cenario, flags.repeticoes);
    }

    await exportarCsvs(cenarios);
}

module.exports = { rodarCenario };

if (require.main === module) {
    main()
        .catch(erro => {
            console.error('Erro ao rodar experimentos:', erro);
            process.exitCode = 1;
        })
        .finally(async () => {
            await pool.end();
        });
}