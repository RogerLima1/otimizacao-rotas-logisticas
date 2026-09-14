/**
 * Rota de entrega completa: parte da origem (ex.: UNESC),
 * visita todos os demais nós do cenário e retorna à origem,
 * minimizando a distância total percorrida.
 *
 * Esse é o clássico Problema do Caixeiro Viajante (TSP), que
 * NÃO é resolvido diretamente por Dijkstra, Bellman-Ford ou A*
 * (esses resolvem o caminho mínimo entre DOIS pontos, não uma
 * rota que passa por todos). Este módulo usa esses três
 * algoritmos apenas como PEÇA de um método maior:
 *
 *   1) Constrói a matriz de menores distâncias entre TODOS os
 *      pares de nós do cenário, usando o algoritmo escolhido
 *      (Dijkstra, Bellman-Ford ou A*).
 *   2) Aplica a heurística do vizinho mais próximo sobre essa
 *      matriz para decidir a ORDEM de visita: a cada passo, vai
 *      para o nó não visitado mais próximo, até visitar todos,
 *      e então retorna à origem.
 *
 * Como os três algoritmos produzem a mesma distância mínima
 * entre dois pontos (só mudando o tempo de execução), a ROTA
 * final é a mesma independente de qual dos três for usado na
 * etapa 1 - o que muda é o tempo gasto para montar a matriz de
 * distâncias, que é justamente o que vale comparar aqui.
 *
 * IMPORTANTE: a heurística do vizinho mais próximo NÃO garante
 * a rota matematicamente ótima (o TSP exato é NP-difícil). É
 * uma aproximação amplamente usada na prática, e deve ser
 * descrita como tal no TCC.
 */

// Constrói a matriz de menores distâncias entre todos os pares
// de nós do cenário, usando o algoritmo informado. Retorna a
// matriz (resultados[origemId][destinoId] = resultado do
// algoritmo, ou null se inalcançável) e o tempo total gasto
// somando o tempo de execução de cada chamada individual.
function construirMatrizDistancias(nodes, edges, algoritmoFn) {
    const resultados = {};
    let tempoExecucaoTotalMs = 0;
    let chamadas = 0;

    for (const nodeA of nodes) {
        resultados[nodeA.id] = {};

        for (const nodeB of nodes) {
            if (nodeA.id === nodeB.id) continue;

            const resultado = algoritmoFn(nodes, edges, nodeA.id, nodeB.id);
            chamadas++;

            if (resultado) {
                tempoExecucaoTotalMs += resultado.tempo_execucao_ms;
            }

            resultados[nodeA.id][nodeB.id] = resultado;
        }
    }

    return { matriz: resultados, tempoExecucaoTotalMs, chamadas };
}

// Aplica a heurística do vizinho mais próximo sobre a matriz de
// distâncias já calculada, partindo de origemId, visitando
// todos os demais nós e retornando à origem no final. Soma
// tempoParadaMin a cada parada feita (não conta na origem).
function heuristicaVizinhoMaisProximo(nodes, matriz, origemId, tempoParadaMin) {
    const idsRestantes = new Set(nodes.map(n => n.id));
    idsRestantes.delete(origemId);

    const ordemVisita = [origemId];
    const rotaCompletaIds = [origemId];

    let atual = origemId;
    let distanciaTotalKm = 0;
    let tempoViagemTotalMin = 0;
    let custoTotalBrl = 0;

    while (idsRestantes.size > 0) {
        let melhorId = null;
        let melhorResultado = null;

        for (const candidatoId of idsRestantes) {
            const resultado = matriz[atual][candidatoId];
            if (!resultado) continue;

            if (!melhorResultado || resultado.distancia_km < melhorResultado.distancia_km) {
                melhorResultado = resultado;
                melhorId = candidatoId;
            }
        }

        if (melhorId === null) {
            return {
                sucesso: false,
                motivo: `Não há caminho a partir do nó ${atual} até os pontos ainda não visitados.`
            };
        }

        distanciaTotalKm += melhorResultado.distancia_km;
        tempoViagemTotalMin += melhorResultado.tempo_min;
        custoTotalBrl += melhorResultado.custo_brl;

        rotaCompletaIds.push(...melhorResultado.rota.slice(1));
        ordemVisita.push(melhorId);
        idsRestantes.delete(melhorId);
        atual = melhorId;
    }

    const resultadoVolta = matriz[atual][origemId];

    if (!resultadoVolta) {
        return {
            sucesso: false,
            motivo: `Não há caminho de volta do nó ${atual} até a origem.`
        };
    }

    distanciaTotalKm += resultadoVolta.distancia_km;
    tempoViagemTotalMin += resultadoVolta.tempo_min;
    custoTotalBrl += resultadoVolta.custo_brl;

    rotaCompletaIds.push(...resultadoVolta.rota.slice(1));
    ordemVisita.push(origemId);

    // Paradas = quantidade de pontos visitados, sem contar a
    // origem (nem na saída, nem na volta).
    const quantidadeParadas = ordemVisita.length - 2;
    const tempoParadasMin = quantidadeParadas * tempoParadaMin;
    const tempoTotalComParadasMin = tempoViagemTotalMin + tempoParadasMin;

    return {
        sucesso: true,
        ordemVisita,
        rotaCompletaIds,
        distanciaTotalKm,
        tempoViagemTotalMin,
        quantidadeParadas,
        tempoParadasMin,
        tempoTotalComParadasMin,
        custoTotalBrl
    };
}

module.exports = { construirMatrizDistancias, heuristicaVizinhoMaisProximo };
