const express = require('express');
const cors = require('cors');

const pool = require('./db/database');
const dijkstra = require('./algorithms/dijkstra');
const bellmanFord = require('./algorithms/bellmanFord');
const aStar = require('./algorithms/aStar');
const { construirMatrizDistancias, heuristicaVizinhoMaisProximo } = require('./algorithms/rotaEntrega');

const app = express();

app.use(cors());
app.use(express.json());

// Lista de algoritmos disponíveis, usada pelas rotas de
// comparação e pelo benchmark em lote.
const ALGORITMOS = [
    { nome: 'Dijkstra', funcao: dijkstra },
    { nome: 'Bellman-Ford', funcao: bellmanFord },
    { nome: 'A*', funcao: aStar }
];

// Extrai o cenário informado na query string, com
// 'padrao' como valor default (cenário original, 12 nós).
function obterCenario(req) {
    return (req.query.cenario || 'padrao').toString();
}

// Busca nodes e edges de um cenário específico no banco,
// incluindo a geometria de cada aresta em GeoJSON (necessária
// para desenhar no mapa a rota seguindo as ruas reais, quando
// disponível, em vez de apenas uma linha reta entre os nodes).
async function buscarGrafo(cenario) {
    const resultadoNodes = await pool.query(
        `SELECT * FROM nodes WHERE scenario = $1 ORDER BY id`,
        [cenario]
    );

    const resultadoEdges = await pool.query(
        `SELECT *, ST_AsGeoJSON(geom) AS geom_geojson
         FROM edges WHERE scenario = $1 ORDER BY id`,
        [cenario]
    );

    const edgesComGeometria = resultadoEdges.rows.map(edge => {
        let geometria = null;

        try {
            const geoJson = JSON.parse(edge.geom_geojson);
            // GeoJSON usa [longitude, latitude]; o Leaflet espera
            // [latitude, longitude], então invertemos aqui.
            geometria = geoJson.coordinates.map(([lon, lat]) => [lat, lon]);
        } catch (erro) {
            geometria = null;
        }

        const { geom_geojson, ...resto } = edge;
        return { ...resto, geometria };
    });

    return {
        nodes: resultadoNodes.rows,
        edges: edgesComGeometria
    };
}

app.get('/', (req, res) => {
    res.json({
        mensagem: 'API de Rotas Logísticas funcionando!'
    });
});

app.get('/api/teste-banco', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT NOW()');

        res.json({
            sucesso: true,
            mensagem: 'Banco de dados conectado com sucesso!',
            horario: resultado.rows[0].now
        });

    } catch (erro) {
        console.error('Erro ao conectar ao banco:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao conectar ao banco de dados.',
            erro: erro.message
        });
    }
});

// Lista os cenários existentes no banco, com a
// quantidade de nodes e edges de cada um. Usado pelo
// frontend para popular o seletor de cenário e pelos
// scripts de experimento para saber o que já existe.
app.get('/api/cenarios', async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                n.scenario AS cenario,
                COUNT(DISTINCT n.id) AS total_nodes,
                COUNT(DISTINCT e.id) AS total_edges
            FROM nodes n
            LEFT JOIN edges e ON e.scenario = n.scenario
            GROUP BY n.scenario
            ORDER BY total_nodes ASC
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
        console.error('Erro ao listar cenários:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao listar os cenários.',
            erro: erro.message
        });
    }
});

app.get('/api/nodes', async (req, res) => {
    try {
        const cenario = obterCenario(req);

        const resultado = await pool.query(
            `SELECT * FROM nodes WHERE scenario = $1 ORDER BY id`,
            [cenario]
        );

        res.json({
            sucesso: true,
            cenario,
            quantidade: resultado.rows.length,
            nodes: resultado.rows
        });

    } catch (erro) {
        console.error('Erro ao buscar nodes:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao buscar os nodes.',
            erro: erro.message
        });
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
        console.error('Erro ao buscar o grafo:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao buscar os dados do grafo.',
            erro: erro.message
        });
    }
});

// Monta a resposta padrão de uma rota calculada por um
// algoritmo, reaproveitada pelas 3 rotas de algoritmo abaixo.
function montarRespostaRota(nomeAlgoritmo, resultado, nodes, origemId, destinoId) {
    const nomesRota = resultado.rota.map(id => {
        const node = nodes.find(n => n.id === id);
        return node ? node.name : `Node ${id}`;
    });

    return {
        sucesso: true,
        algoritmo: nomeAlgoritmo,
        origem: {
            id: origemId,
            nome: nodes.find(n => n.id === origemId)?.name
        },
        destino: {
            id: destinoId,
            nome: nodes.find(n => n.id === destinoId)?.name
        },
        rota: nomesRota,
        rota_ids: resultado.rota,
        distancia_km: resultado.distancia_km,
        custo_brl: resultado.custo_brl,
        tempo_min: resultado.tempo_min,
        tempo_execucao_ms: resultado.tempo_execucao_ms
    };
}

// Valida e extrai origem/destino da query string, retornando
// null e já respondendo o erro em caso de parâmetros inválidos.
function validarOrigemDestino(req, res, nodes) {
    const { origem, destino } = req.query;

    if (!origem || !destino) {
        res.status(400).json({
            sucesso: false,
            mensagem: 'Informe os parâmetros origem e destino.'
        });
        return null;
    }

    const origemId = Number(origem);
    const destinoId = Number(destino);

    if (Number.isNaN(origemId) || Number.isNaN(destinoId)) {
        res.status(400).json({
            sucesso: false,
            mensagem: 'Os parâmetros origem e destino devem ser numéricos.'
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

    const origemExiste = nodes.some(n => n.id === origemId);
    const destinoExiste = nodes.some(n => n.id === destinoId);

    if (!origemExiste || !destinoExiste) {
        res.status(404).json({
            sucesso: false,
            mensagem: 'Origem ou destino não pertencem ao cenário informado.'
        });
        return null;
    }

    return { origemId, destinoId };
}

app.get('/api/rotas/dijkstra', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const { nodes, edges } = await buscarGrafo(cenario);

        const idsValidados = validarOrigemDestino(req, res, nodes);
        if (!idsValidados) return;
        const { origemId, destinoId } = idsValidados;

        const resultado = dijkstra(nodes, edges, origemId, destinoId);

        if (!resultado) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Não foi encontrada uma rota entre os nodes informados.'
            });
        }

        res.json(montarRespostaRota('Dijkstra', resultado, nodes, origemId, destinoId));

    } catch (erro) {
        console.error('Erro ao executar Dijkstra:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao executar o algoritmo Dijkstra.',
            erro: erro.message
        });
    }
});

app.get('/api/rotas/bellman-ford', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const { nodes, edges } = await buscarGrafo(cenario);

        const idsValidados = validarOrigemDestino(req, res, nodes);
        if (!idsValidados) return;
        const { origemId, destinoId } = idsValidados;

        const resultado = bellmanFord(nodes, edges, origemId, destinoId);

        if (!resultado) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Não foi encontrada uma rota entre os nodes informados.'
            });
        }

        res.json(montarRespostaRota('Bellman-Ford', resultado, nodes, origemId, destinoId));

    } catch (erro) {
        console.error('Erro ao executar Bellman-Ford:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao executar o algoritmo Bellman-Ford.',
            erro: erro.message
        });
    }
});

app.get('/api/rotas/a-star', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const { nodes, edges } = await buscarGrafo(cenario);

        const idsValidados = validarOrigemDestino(req, res, nodes);
        if (!idsValidados) return;
        const { origemId, destinoId } = idsValidados;

        const resultado = aStar(nodes, edges, origemId, destinoId);

        if (!resultado) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Não foi encontrada uma rota entre os nodes informados.'
            });
        }

        res.json(montarRespostaRota('A*', resultado, nodes, origemId, destinoId));

    } catch (erro) {
        console.error('Erro ao executar A*:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao executar o algoritmo A*.',
            erro: erro.message
        });
    }
});

// Roda os 3 algoritmos várias vezes para o mesmo par
// origem/destino, salvando cada execução na tabela
// experiments. Útil para medir o tempo de execução com
// estabilidade estatística (o tempo de uma única execução
// é muito suscetível a ruído do sistema operacional).
app.get('/api/benchmark', async (req, res) => {
    try {
        const cenario = obterCenario(req);
        const { nodes, edges } = await buscarGrafo(cenario);

        if (nodes.length === 0) {
            return res.status(404).json({
                sucesso: false,
                mensagem: `Cenário '${cenario}' não encontrado ou sem nodes.`
            });
        }

        const origem = Number(req.query.origem) || nodes[0].id;
        const destino = Number(req.query.destino) || nodes[nodes.length - 1].id;
        const repeticoes = Number(req.query.repeticoes) || 100;

        if (repeticoes < 1 || repeticoes > 1000) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'O número de repetições deve estar entre 1 e 1000.'
            });
        }

        const resultados = [];

        for (const algoritmo of ALGORITMOS) {
            for (let i = 0; i < repeticoes; i++) {

                const resultado = algoritmo.funcao(nodes, edges, origem, destino);

                if (!resultado) {
                    continue;
                }

                await pool.query(`
                    INSERT INTO experiments (
                        scenario, algorithm, source_id, target_id,
                        distance_km, travel_time_min, cost_brl,
                        execution_ms, path_nodes, reachable
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
                `, [
                    cenario,
                    algoritmo.nome,
                    origem,
                    destino,
                    resultado.distancia_km,
                    resultado.tempo_min,
                    resultado.custo_brl,
                    resultado.tempo_execucao_ms,
                    resultado.rota
                ]);

                resultados.push({
                    algoritmo: algoritmo.nome,
                    execucao: i + 1,
                    distancia_km: resultado.distancia_km,
                    custo_brl: resultado.custo_brl,
                    tempo_min: resultado.tempo_min,
                    tempo_execucao_ms: resultado.tempo_execucao_ms
                });
            }
        }

        res.json({
            sucesso: true,
            mensagem: 'Benchmark executado com sucesso.',
            cenario,
            origem,
            destino,
            repeticoes_por_algoritmo: repeticoes,
            total_execucoes: resultados.length,
            resultados
        });

    } catch (erro) {
        console.error('Erro ao executar benchmark:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao executar o benchmark.',
            erro: erro.message
        });
    }
});

// Retorna um resumo estatístico (média, mediana, desvio
// padrão, mínimo e máximo) dos experimentos já salvos no
// banco, agrupado por cenário e algoritmo. É a base das
// tabelas comparativas do capítulo de resultados do TCC.
app.get('/api/experimentos/resumo', async (req, res) => {
    try {
        const cenarioFiltro = req.query.cenario || null;

        const resultado = await pool.query(`
            SELECT
                scenario,
                algorithm,
                COUNT(*) FILTER (WHERE reachable) AS execucoes_com_rota,
                COUNT(*) FILTER (WHERE NOT reachable) AS execucoes_sem_rota,
                AVG(distance_km) FILTER (WHERE reachable) AS media_distancia_km,
                AVG(cost_brl) FILTER (WHERE reachable) AS media_custo_brl,
                AVG(travel_time_min) FILTER (WHERE reachable) AS media_tempo_min,
                AVG(execution_ms) AS media_execucao_ms,
                STDDEV_POP(execution_ms) AS desvio_padrao_execucao_ms,
                MIN(execution_ms) AS min_execucao_ms,
                MAX(execution_ms) AS max_execucao_ms,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_ms) AS mediana_execucao_ms
            FROM experiments
            WHERE ($1::VARCHAR IS NULL OR scenario = $1)
            GROUP BY scenario, algorithm
            ORDER BY scenario, algorithm
        `, [cenarioFiltro]);

        res.json({
            sucesso: true,
            resumo: resultado.rows
        });

    } catch (erro) {
        console.error('Erro ao gerar resumo dos experimentos:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao gerar o resumo dos experimentos.',
            erro: erro.message
        });
    }
});

// Quantos minutos são somados ao tempo total da rota de
// entrega para cada ponto visitado (tempo estimado de parada,
// descarga/entrega no local). Não é somado para a origem.
const TEMPO_PARADA_MIN = 20;

// Rota de entrega completa: parte da origem do cenário (ex.:
// UNESC), visita TODOS os demais nós e retorna à origem,
// minimizando a distância total (heurística do vizinho mais
// próximo sobre a matriz de distâncias calculada por cada um
// dos 3 algoritmos). Ver comentários em algorithms/rotaEntrega.js
// para detalhes do método.
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

        if (nodes.length > 60) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Cenário grande demais para a rota de entrega completa ' +
                    '(mais de 60 nós). Use um cenário menor.'
            });
        }

        const nodeOrigem = nodes.find(n => n.node_type === 'origem') || nodes[0];

        const resultadosPorAlgoritmo = {};

        for (const algoritmo of ALGORITMOS) {
            const { matriz, tempoExecucaoTotalMs } =
                construirMatrizDistancias(nodes, edges, algoritmo.funcao);

            const rota = heuristicaVizinhoMaisProximo(
                nodes, matriz, nodeOrigem.id, TEMPO_PARADA_MIN
            );

            if (!rota.sucesso) {
                resultadosPorAlgoritmo[algoritmo.nome] = {
                    sucesso: false,
                    mensagem: rota.motivo
                };
                continue;
            }

            const nomesOrdemVisita = rota.ordemVisita.map(id => {
                const node = nodes.find(n => n.id === id);
                return node ? node.name : `Node ${id}`;
            });

            resultadosPorAlgoritmo[algoritmo.nome] = {
                sucesso: true,
                ordem_visita: nomesOrdemVisita,
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
            resultados: resultadosPorAlgoritmo
        });

    } catch (erro) {
        console.error('Erro ao calcular rota de entrega:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao calcular a rota de entrega.',
            erro: erro.message
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
