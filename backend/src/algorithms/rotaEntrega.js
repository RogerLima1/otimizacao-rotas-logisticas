function construirMatrizDistancias(nodes, edges, algoritmoFn) {
    const resultados = {};
    let tempoExecucaoTotalMs = 0;

    for (const nodeA of nodes) {
        resultados[nodeA.id] = {};

        for (const nodeB of nodes) {
            if (nodeA.id === nodeB.id) continue;

            const resultado = algoritmoFn(nodes, edges, nodeA.id, nodeB.id);

            if (resultado) {
                tempoExecucaoTotalMs += resultado.tempo_execucao_ms;
            }

            resultados[nodeA.id][nodeB.id] = resultado;
        }
    }

    return { matriz: resultados, tempoExecucaoTotalMs };
}

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
