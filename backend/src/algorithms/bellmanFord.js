function bellmanFord(nodes, edges, origemId, destinoId) {
    const inicio = performance.now();

    const distancias = {};
    const anteriores = {};

    nodes.forEach(node => {
        distancias[node.id] = Infinity;
        anteriores[node.id] = null;
    });

    distancias[origemId] = 0;

    for (let i = 1; i <= nodes.length - 1; i++) {
        let houveAlteracao = false;

        edges.forEach(edge => {
            const origem = edge.source_id;
            const destino = edge.target_id;
            const peso = Number(edge.distance_km);

            if (
                distancias[origem] !== Infinity &&
                distancias[origem] + peso < distancias[destino]
            ) {
                distancias[destino] =
                    distancias[origem] + peso;

                anteriores[destino] = origem;

                houveAlteracao = true;
            }
        });

        if (!houveAlteracao) {
            break;
        }
    }

    if (distancias[destinoId] === Infinity) {
        return null;
    }

    const rota = [];
    let atual = Number(destinoId);

    while (atual !== null) {
        rota.unshift(atual);
        atual = anteriores[atual];
    }

    const arestasPorOrigem = {};

    edges.forEach(edge => {
        if (!arestasPorOrigem[edge.source_id]) {
            arestasPorOrigem[edge.source_id] = [];
        }

        arestasPorOrigem[edge.source_id].push(edge);
    });

    let custoTotal = 0;
    let tempoTotal = 0;

    for (let i = 0; i < rota.length - 1; i++) {
        const origem = rota[i];
        const destino = rota[i + 1];

        const edge = arestasPorOrigem[origem]?.find(
            edge => edge.target_id === destino
        );

        if (edge) {
            custoTotal += Number(edge.cost_brl);
            tempoTotal += Number(edge.travel_time_min);
        }
    }

    const fim = performance.now();

    return {
        distancia_km: Number(distancias[destinoId].toFixed(3)),
        custo_brl: Number(custoTotal.toFixed(2)),
        tempo_min: Number(tempoTotal.toFixed(2)),
        tempo_execucao_ms: Number((fim - inicio).toFixed(4)),
        rota
    };
}

module.exports = bellmanFord;