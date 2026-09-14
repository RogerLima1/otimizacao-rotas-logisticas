function aStar(nodes, edges, origemId, destinoId) {
    const inicio = performance.now();

    const distancias = {};
    const anteriores = {};
    const abertos = new Set();

    const nodesPorId = {};

    nodes.forEach(node => {
        nodesPorId[node.id] = node;

        distancias[node.id] = Infinity;
        anteriores[node.id] = null;
    });

    const origem = nodesPorId[Number(origemId)];
    const destino = nodesPorId[Number(destinoId)];

    if (!origem || !destino) {
        return null;
    }

    const grafo = {};

    nodes.forEach(node => {
        grafo[node.id] = [];
    });

    edges.forEach(edge => {
        grafo[edge.source_id].push(edge);
    });

    function distanciaGeografica(nodeA, nodeB) {
        const R = 6371;

        const lat1 =
            Number(nodeA.latitude) * Math.PI / 180;

        const lat2 =
            Number(nodeB.latitude) * Math.PI / 180;

        const deltaLat =
            (Number(nodeB.latitude) - Number(nodeA.latitude))
            * Math.PI / 180;

        const deltaLon =
            (Number(nodeB.longitude) - Number(nodeA.longitude))
            * Math.PI / 180;

        const a =
            Math.sin(deltaLat / 2) ** 2 +
            Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin(deltaLon / 2) ** 2;

        const c =
            2 * Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            );

        return R * c;
    }

    distancias[origem.id] = 0;

    abertos.add(origem.id);

    while (abertos.size > 0) {
        let atual = null;
        let menorF = Infinity;

        // Procura o node com menor valor de F
        abertos.forEach(nodeId => {
            const nodeAtual = nodesPorId[nodeId];

            const g = distancias[nodeId];

            const h =
                distanciaGeografica(
                    nodeAtual,
                    destino
                );

            const f = g + h;

            if (f < menorF) {
                menorF = f;
                atual = nodeId;
            }
        });

        if (atual === Number(destinoId)) {
            break;
        }

        abertos.delete(atual);

        const arestas = grafo[atual];

        arestas.forEach(edge => {
            const vizinho = edge.target_id;

            const novaDistancia =
                distancias[atual] +
                Number(edge.distance_km);

            if (novaDistancia < distancias[vizinho]) {
                distancias[vizinho] = novaDistancia;

                anteriores[vizinho] = atual;

                abertos.add(vizinho);
            }
        });
    }

    if (distancias[Number(destinoId)] === Infinity) {
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
        const origemRota = rota[i];
        const destinoRota = rota[i + 1];

        const edge = grafo[origemRota].find(
            edge => edge.target_id === destinoRota
        );

        if (edge) {
            custoTotal += Number(edge.cost_brl);
            tempoTotal += Number(edge.travel_time_min);
        }
    }

    const fim = performance.now();

    return {
        distancia_km: Number(
            distancias[Number(destinoId)].toFixed(3)
        ),

        custo_brl: Number(
            custoTotal.toFixed(2)
        ),

        tempo_min: Number(
            tempoTotal.toFixed(2)
        ),

        tempo_execucao_ms: Number(
            (fim - inicio).toFixed(4)
        ),

        rota
    };
}

module.exports = aStar;