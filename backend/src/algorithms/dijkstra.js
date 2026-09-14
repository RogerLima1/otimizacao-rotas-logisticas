function dijkstra(nodes, edges, origemId, destinoId) {
    const inicio = performance.now();

    const distancias = {};
    const anteriores = {};
    const visitados = new Set();

    const grafo = {};

    nodes.forEach(node => {
        distancias[node.id] = Infinity;
        anteriores[node.id] = null;
        grafo[node.id] = [];
    });

    edges.forEach(edge => {
        grafo[edge.source_id].push(edge);
    });

    distancias[origemId] = 0;

    while (true) {
        let atual = null;
        let menorDistancia = Infinity;

        nodes.forEach(node => {
            if (
                !visitados.has(node.id) &&
                distancias[node.id] < menorDistancia
            ) {
                menorDistancia = distancias[node.id];
                atual = node.id;
            }
        });

        if (atual === null) {
            break;
        }

        if (atual === Number(destinoId)) {
            break;
        }

        visitados.add(atual);

        grafo[atual].forEach(edge => {
            const vizinho = edge.target_id;

            const novaDistancia =
                distancias[atual] +
                Number(edge.distance_km);

            if (novaDistancia < distancias[vizinho]) {
                distancias[vizinho] = novaDistancia;
                anteriores[vizinho] = atual;
            }
        });
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

    let custoTotal = 0;
    let tempoTotal = 0;

    for (let i = 0; i < rota.length - 1; i++) {
        const origem = rota[i];
        const destino = rota[i + 1];

        const edge = grafo[origem].find(
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

module.exports = dijkstra;