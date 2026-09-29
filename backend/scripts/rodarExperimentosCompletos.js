const fs = require('fs');
const path = require('path');

const pool = require('../src/db/database');
const dijkstra = require('../src/algorithms/dijkstra');
const bellmanFord = require('../src/algorithms/bellmanFord');
const aStar = require('../src/algorithms/aStar');

const ALGORITMOS = [
    { nome: 'Dijkstra', funcao: dijkstra },
    { nome: 'Bellman-Ford', funcao: bellmanFord },
    { nome: 'A*', funcao: aStar }
];

function parseArgumentos() {
    const cenarios = [];
    const flags = { repeticoes: 10, maxPares: 60 };

    process.argv.slice(2).forEach(arg => {
        if (arg.startsWith('--repeticoes=')) {
            flags.repeticoes = Number(arg.split('=')[1]);
        } else if (arg.startsWith('--maxPares=')) {
            flags.maxPares = Number(arg.split('=')[1]);
        } else {
            cenarios.push(arg);
        }
    });

    return { cenarios, flags };
}

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

function escolherPares(nodes, maxPares) {
    const ids = nodes.map(n => n.id);
    const todosPares = [];

    for (const origem of ids) {
        for (const destino of ids) {
            if (origem !== destino) {
                todosPares.push({ origem, destino });
            }
        }
    }

    if (todosPares.length <= maxPares) {
        return todosPares;
    }

    const embaralhado = todosPares
        .map(par => ({ par, chave: Math.random() }))
        .sort((a, b) => a.chave - b.chave)
        .map(item => item.par);

    return embaralhado.slice(0, maxPares);
}

async function rodarCenario(cenario, repeticoes, maxPares) {
    console.log(`\n=== Cenário: ${cenario} ===`);

    const { nodes, edges } = await buscarGrafo(cenario);

        if (nodes.length < 2) {
        console.log(`  Ignorado (menos de 2 nós encontrados).`);
        return {
            executado: false,
            mensagem: 'Cenário com menos de 2 nós — nada para testar.'
        };
    }

        const apagados = await pool.query(
        `DELETE FROM experiments WHERE scenario = $1`,
        [cenario]
    );
    if (apagados.rowCount > 0) {
        console.log(`  ${apagados.rowCount} execuções antigas deste cenário foram apagadas.`);
    }

    const pares = escolherPares(nodes, maxPares);

    console.log(`  Nós: ${nodes.length} | Arestas: ${edges.length} | ` +
        `Pares testados: ${pares.length} | Repetições por par: ${repeticoes}`);

    let inseridos = 0;
    let semRota = 0;
    let inconsistencias = 0;

    for (const { origem, destino } of pares) {

        let distanciaReferencia = null;

        for (const algoritmo of ALGORITMOS) {
            let ultimoResultado = null;

            for (let i = 0; i < repeticoes; i++) {
                const resultado = algoritmo.funcao(nodes, edges, origem, destino);

                if (!resultado) {
                    if (i === 0) semRota++;
                    continue;
                }

                ultimoResultado = resultado;

                await pool.query(`
                    INSERT INTO experiments (
                        scenario, algorithm, source_id, target_id,
                        distance_km, travel_time_min, cost_brl,
                        execution_ms, path_nodes, reachable
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
                `, [
                    cenario, algoritmo.nome, origem, destino,
                    resultado.distancia_km, resultado.tempo_min,
                    resultado.custo_brl, resultado.tempo_execucao_ms,
                    resultado.rota
                ]);

                inseridos++;
            }

            if (ultimoResultado) {
                if (distanciaReferencia === null) {
                    distanciaReferencia = ultimoResultado.distancia_km;
                } else if (
                    Math.abs(ultimoResultado.distancia_km - distanciaReferencia) > 0.01
                ) {
                    inconsistencias++;
                    console.warn(
                        `  [ALERTA] Divergência de distância no par ` +
                        `${origem}->${destino} (${algoritmo.nome}): ` +
                        `${ultimoResultado.distancia_km} km vs referência ` +
                        `${distanciaReferencia} km`
                    );
                }
            }
        }
    }

    console.log(`  Execuções salvas: ${inseridos} | ` +
        `Pares sem rota encontrada: ${semRota} | ` +
        `Divergências entre algoritmos: ${inconsistencias}`);

    return {
        executado: true,
        execucoes_salvas: inseridos,
        pares_testados: pares.length,
        pares_sem_rota: semRota,
        divergencias: inconsistencias,
        execucoes_antigas_apagadas: apagados.rowCount
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
        SELECT scenario, algorithm, source_id, target_id,
               distance_km, travel_time_min, cost_brl,
               execution_ms, created_at
        FROM experiments
        WHERE scenario = ANY($1)
        ORDER BY scenario, algorithm, source_id, target_id, created_at
    `, [cenarios]);

    const csvDetalhado = paraCsv(detalhado.rows, [
        'scenario', 'algorithm', 'source_id', 'target_id',
        'distance_km', 'travel_time_min', 'cost_brl', 'execution_ms', 'created_at'
    ]);

    const caminhoDetalhado = path.join(pastaResultados, 'experimentos_detalhado.csv');
    fs.writeFileSync(caminhoDetalhado, csvDetalhado, 'utf8');

    const resumo = await pool.query(`
        SELECT
            scenario,
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
        GROUP BY scenario, algorithm
        ORDER BY scenario, algorithm
    `, [cenarios]);

    const csvResumo = paraCsv(resumo.rows, [
        'scenario', 'algorithm', 'execucoes', 'media_distancia_km',
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
        : await descobrirCenarios();

    if (cenarios.length === 0) {
        console.error(
            'Nenhum cenário encontrado no banco. Rode antes o seed.sql ' +
            '(cenário "padrao") ou gere um cenário com gerarCenario.js.'
        );
        process.exitCode = 1;
        return;
    }

    console.log(`Cenários a processar: ${cenarios.join(', ')}`);
    console.log(`Repetições por par: ${flags.repeticoes} | ` +
        `Máx. de pares por cenário: ${flags.maxPares}`);

    for (const cenario of cenarios) {
        await rodarCenario(cenario, flags.repeticoes, flags.maxPares);
    }

    await exportarCsvs(cenarios);
}

module.exports = {
    rodarCenario,
    buscarGrafo,
    escolherPares,
    descobrirCenarios
};

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