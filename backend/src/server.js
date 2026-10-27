const express = require('express');
const cors = require('cors');

const pool = require('./db/database');
const { buscarGrafo } = require('./db/grafo');
const dijkstra = require('./algorithms/dijkstra');
const bellmanFord = require('./algorithms/bellmanFord');
const aStar = require('./algorithms/aStar');
const {
    TEMPO_PARADA_MIN,
    MAX_NOS_ENTREGA,
    encontrarOrigem,
    calcularRotaEntrega
} = require('./algorithms/rotaEntrega');
const { rodarCenario } = require('../scripts/rodarExperimentosCompletos');

const app = express();

app.use(cors());
app.use(express.json());

const ALGORITMOS = [
    { nome: 'Dijkstra', caminho: 'dijkstra', funcao: dijkstra },
    { nome: 'Bellman-Ford', caminho: 'bellman-ford', funcao: bellmanFord },
    { nome: 'A*', caminho: 'a-star', funcao: aStar }
];

function obterCenario(req) {
    return (req.query.cenario || '').toString();
}

function responderErro(res, mensagem, erro) {
    console.error(`${mensagem}:`, erro);

    res.status(500).json({
        sucesso: false,
        mensagem,
        erro: erro.message
    });
}

app.get('/api/teste-banco', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT NOW()');

        res.json({
            sucesso: true,
            mensagem: 'Banco de dados conectado com sucesso!',
            horario: resultado.rows[0].now
        });

    } catch (erro) {
        responderErro(res, 'Erro ao conectar ao banco de dados', erro);
    }
});

app.get('/api/cenarios', async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                n.scenario AS cenario,
                COUNT(*) AS total_nodes,
                (SELECT COUNT(*) FROM edges e WHERE e.scenario = n.scenario) AS total_edges
            FROM nodes n
            GROUP BY n.scenario
            ORDER BY total_nodes, cenario
        `);

        res.json({
            sucesso: true,
            cenarios: resultado.rows.map(linha => ({
                cenario: linha.cenario,
                total_nodes: Number(linha.total_nodes),
                total_edges: Number(linha.total_edges)
            }))
        });

    } catch (erro) {
        responderErro(res, 'Erro ao listar os cenários', erro);
    }
});

app.get('/api/grafo', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const { nodes, edges } = await buscarGrafo(cenario);

        res.json({
            sucesso: true,
            cenario,
            nodes,
            edges
        });

    } catch (erro) {
        responderErro(res, 'Erro ao buscar os dados do grafo', erro);
    }
});

function validarOrigemDestino(req, res, nodes) {
    const origemId = Number(req.query.origem);
    const destinoId = Number(req.query.destino);

    if (!req.query.origem || !req.query.destino || Number.isNaN(origemId) || Number.isNaN(destinoId)) {
        res.status(400).json({
            sucesso: false,
            mensagem: 'Informe origem e destino numéricos.'
        });
        return null;
    }

    if (origemId === destinoId) {
        res.status(400).json({
            sucesso: false,
            mensagem: 'A origem e o destino devem ser diferentes.'
        });
        return null;
    }

    if (!nodes.some(n => n.id === origemId) || !nodes.some(n => n.id === destinoId)) {
        res.status(404).json({
            sucesso: false,
            mensagem: 'Origem ou destino não pertencem ao cenário informado.'
        });
        return null;
    }

    return { origemId, destinoId };
}

ALGORITMOS.forEach(algoritmo => {
    app.get(`/api/rotas/${algoritmo.caminho}`, async (req, res) => {
        try {
            const { nodes, edges } = await buscarGrafo(obterCenario(req));

            const ids = validarOrigemDestino(req, res, nodes);
            if (!ids) return;

            const resultado = algoritmo.funcao(nodes, edges, ids.origemId, ids.destinoId);

            if (!resultado) {
                return res.status(404).json({
                    sucesso: false,
                    mensagem: 'Não foi encontrada uma rota entre os nodes informados.'
                });
            }

            const nomePorId = id => nodes.find(n => n.id === id)?.name ?? `Node ${id}`;

            res.json({
                sucesso: true,
                algoritmo: algoritmo.nome,
                origem: { id: ids.origemId, nome: nomePorId(ids.origemId) },
                destino: { id: ids.destinoId, nome: nomePorId(ids.destinoId) },
                rota: resultado.rota.map(nomePorId),
                rota_ids: resultado.rota,
                distancia_km: resultado.distancia_km,
                custo_brl: resultado.custo_brl,
                tempo_min: resultado.tempo_min,
                tempo_execucao_ms: resultado.tempo_execucao_ms
            });

        } catch (erro) {
            responderErro(res, `Erro ao executar o algoritmo ${algoritmo.nome}`, erro);
        }
    });
});

app.get('/api/rotas/entrega', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const { nodes, edges } = await buscarGrafo(cenario);

        if (nodes.length === 0) {
            return res.status(404).json({
                sucesso: false,
                mensagem: `Cenário '${cenario}' não encontrado ou sem nodes.`
            });
        }

        if (nodes.length > MAX_NOS_ENTREGA) {
            return res.status(400).json({
                sucesso: false,
                mensagem: `Cenário grande demais para a rota de entrega completa ` +
                    `(mais de ${MAX_NOS_ENTREGA} nós). Use um cenário menor.`
            });
        }

        const nodeOrigem = encontrarOrigem(nodes);
        const nomePorId = id => nodes.find(n => n.id === id)?.name ?? `Node ${id}`;

        const resultados = {};

        for (const algoritmo of ALGORITMOS) {
            const { rota, tempoExecucaoTotalMs } =
                calcularRotaEntrega(nodes, edges, algoritmo.funcao);

            if (!rota.sucesso) {
                resultados[algoritmo.nome] = {
                    sucesso: false,
                    mensagem: rota.motivo
                };
                continue;
            }

            resultados[algoritmo.nome] = {
                sucesso: true,
                ordem_visita: rota.ordemVisita.map(nomePorId),
                ordem_visita_ids: rota.ordemVisita,
                rota_completa_ids: rota.rotaCompletaIds,
                distancia_total_km: Number(rota.distanciaTotalKm.toFixed(3)),
                tempo_viagem_total_min: Number(rota.tempoViagemTotalMin.toFixed(2)),
                quantidade_paradas: rota.quantidadeParadas,
                tempo_paradas_min: rota.tempoParadasMin,
                tempo_total_com_paradas_min: Number(rota.tempoTotalComParadasMin.toFixed(2)),
                custo_total_brl: Number(rota.custoTotalBrl.toFixed(2)),
                tempo_execucao_matriz_ms: Number(tempoExecucaoTotalMs.toFixed(4))
            };
        }

        res.json({
            sucesso: true,
            cenario,
            origem: { id: nodeOrigem.id, nome: nodeOrigem.name },
            total_nos: nodes.length,
            tempo_parada_por_no_min: TEMPO_PARADA_MIN,
            resultados
        });

    } catch (erro) {
        responderErro(res, 'Erro ao calcular a rota de entrega', erro);
    }
});

app.get('/api/experimentos/rodar', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const repeticoes = Number(req.query.repeticoes) || 10;

        if (repeticoes < 1 || repeticoes > 200) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'O número de repetições deve estar entre 1 e 200.'
            });
        }

        const resultado = await rodarCenario(cenario, repeticoes);

        if (!resultado.executado) {
            return res.status(400).json({
                sucesso: false,
                mensagem: resultado.mensagem
            });
        }

        res.json({
            sucesso: true,
            mensagem: 'Experimentos executados com sucesso.',
            cenario,
            repeticoes_por_algoritmo: repeticoes,
            ...resultado
        });

    } catch (erro) {
        responderErro(res, 'Erro ao rodar os experimentos', erro);
    }
});

app.get('/api/experimentos/resumo', async (req, res) => {
    try {
        const cenarioFiltro = req.query.cenario || null;

        const resultado = await pool.query(`
            SELECT
                scenario,
                execution_round,
                order_position,
                algorithm,
                COUNT(*) FILTER (WHERE reachable) AS execucoes_com_rota,
                AVG(distance_km) FILTER (WHERE reachable) AS rota_distancia_km,
                AVG(cost_brl) FILTER (WHERE reachable) AS rota_custo_brl,
                AVG(travel_time_min) FILTER (WHERE reachable) AS rota_tempo_viagem_min,
                AVG(execution_ms) AS media_execucao_ms,
                STDDEV_POP(execution_ms) AS desvio_padrao_execucao_ms,
                MIN(execution_ms) AS min_execucao_ms,
                MAX(execution_ms) AS max_execucao_ms,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_ms) AS mediana_execucao_ms
            FROM experiments
            WHERE ($1::VARCHAR IS NULL OR scenario = $1)
            GROUP BY scenario, execution_round, order_position, algorithm
            ORDER BY scenario, execution_round, order_position
        `, [cenarioFiltro]);

        res.json({
            sucesso: true,
            resumo: resultado.rows
        });

    } catch (erro) {
        responderErro(res, 'Erro ao gerar o resumo dos experimentos', erro);
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
