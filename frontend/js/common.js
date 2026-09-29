const API_URL = "http://localhost:3000";

const cenarioSelect = document.getElementById("cenario");

let mapa = null;
let camadaGrafo = null;
let nodesPorIdAtual = {};
let edgesPorParAtual = {};

function cenarioAtual() {
    return cenarioSelect.value || "padrao";
}

async function carregarCenarios() {

    try {

        const resposta = await fetch(`${API_URL}/api/cenarios`);
        const dados = await resposta.json();

        if (!dados.sucesso || dados.cenarios.length === 0) {
            throw new Error("Nenhum cenário encontrado no banco.");
        }

        cenarioSelect.innerHTML = "";

        dados.cenarios.forEach(item => {
            const option = document.createElement("option");
            option.value = item.cenario;
            option.textContent =
                `${item.cenario} (${item.total_nodes} nós, ${item.total_edges} arestas)`;
            cenarioSelect.appendChild(option);
        });

        const existePadrao = dados.cenarios.some(c => c.cenario === "padrao");
        cenarioSelect.value = existePadrao ? "padrao" : dados.cenarios[0].cenario;

    } catch (erro) {

        console.error(erro);

        const mensagem = document.getElementById("mensagem");
        if (mensagem) {
            mensagem.textContent =
                "Erro ao carregar os cenários. Verifique se o banco foi " +
                "populado (schema.sql + seed.sql).";
        }
    }
}

function corAlgoritmo(nome) {
    if (nome === "Dijkstra") return "#0E7C86";
    if (nome === "Bellman-Ford") return "#B8752E";
    if (nome === "A*") return "#6D4E9C";
    return "inherit";
}

function formatarHoras(minutosTotais) {
    const horas = Math.floor(minutosTotais / 60);
    const minutos = Math.round(minutosTotais % 60);
    if (horas === 0) {
        return `${minutos}min`;
    }
    return `${horas}h ${minutos.toString().padStart(2, "0")}min`;
}

function fmtNum(valor, casas) {
    if (valor === null || valor === undefined) {
        return "—";
    }
    return Number(valor).toFixed(casas);
}

async function inicializarMapa() {

    mapa = L.map("mapa").setView(
        [-28.6786, -49.3696],
        13
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                '&copy; OpenStreetMap contributors'
        }
    ).addTo(mapa);

    await carregarGrafoNoMapa();
}

async function carregarGrafoNoMapa() {

    try {

        const resposta = await fetch(
            `${API_URL}/api/grafo?cenario=${cenarioAtual()}`
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            throw new Error(
                "Não foi possível carregar o grafo."
            );
        }

        if (camadaGrafo) {
            mapa.removeLayer(camadaGrafo);
        }

        camadaGrafo = L.layerGroup().addTo(mapa);

        const nodes = dados.nodes;
        const edges = dados.edges;

        nodesPorIdAtual = {};
        edgesPorParAtual = {};

        const pontos = [];

        nodes.forEach(node => {

            nodesPorIdAtual[node.id] = node;

            const latlng = [
                Number(node.latitude),
                Number(node.longitude)
            ];

            pontos.push(latlng);

            const marcador = L.marker(latlng).addTo(camadaGrafo);

            marcador.bindPopup(`
                <strong>${node.name}</strong><br>
                ID: ${node.id}<br>
                Tipo: ${node.node_type}
            `);

        });

        edges.forEach(edge => {

            const origem = nodesPorIdAtual[edge.source_id];
            const destino = nodesPorIdAtual[edge.target_id];

            if (!origem || !destino) {
                return;
            }

            edgesPorParAtual[`${edge.source_id}-${edge.target_id}`] = edge;

            const pontosLinha = (edge.geometria && edge.geometria.length > 1)
                ? edge.geometria
                : [
                    [Number(origem.latitude), Number(origem.longitude)],
                    [Number(destino.latitude), Number(destino.longitude)]
                ];

            L.polyline(pontosLinha, {
                weight: 2,
                color: "#94a3b8"
            }).addTo(camadaGrafo);

        });

        if (pontos.length > 0) {
            mapa.fitBounds(pontos, { padding: [30, 30] });
        }

    } catch (erro) {

        console.error(
            "Erro ao carregar mapa:",
            erro
        );

    }

}

function limparRotaDestacada() {

    if (window.__linhaRotaDestaque) {
        mapa.removeLayer(window.__linhaRotaDestaque);
        window.__linhaRotaDestaque = null;
    }

    if (window.__marcadoresRotaDestaque) {
        window.__marcadoresRotaDestaque.forEach(marcador => mapa.removeLayer(marcador));
        window.__marcadoresRotaDestaque = null;
    }
}

function destacarRotaNoMapa(rotaIds) {

    if (!mapa || !rotaIds || rotaIds.length < 2) {
        return;
    }

    const pontosRota = [];

    for (let i = 0; i < rotaIds.length - 1; i++) {
        const origemId = rotaIds[i];
        const destinoId = rotaIds[i + 1];

        const edge = edgesPorParAtual[`${origemId}-${destinoId}`];

        if (edge && edge.geometria && edge.geometria.length > 1) {
            pontosRota.push(...edge.geometria);
        } else {
            const origem = nodesPorIdAtual[origemId];
            const destino = nodesPorIdAtual[destinoId];

            if (origem && destino) {
                pontosRota.push(
                    [Number(origem.latitude), Number(origem.longitude)],
                    [Number(destino.latitude), Number(destino.longitude)]
                );
            }
        }
    }

    limparRotaDestacada();

    window.__linhaRotaDestaque = L.polyline(pontosRota, {
        weight: 5,
        color: "#dc2626"
    }).addTo(mapa);

        window.__marcadoresRotaDestaque = (() => {

        const posicoesPorNode = {};

        rotaIds.forEach((nodeId, indice) => {
            if (!posicoesPorNode[nodeId]) {
                posicoesPorNode[nodeId] = [];
            }
            posicoesPorNode[nodeId].push(indice + 1);
        });

        return Object.keys(posicoesPorNode).map(nodeIdStr => {

            const nodeId = Number(nodeIdStr);
            const node = nodesPorIdAtual[nodeId];

            if (!node) {
                return null;
            }

            const rotulo = posicoesPorNode[nodeId].join("/");

            const icone = L.divIcon({
                className: "marcador-numerado",
                html: `<span>${rotulo}</span>`,
                iconSize: [32, 26],
                iconAnchor: [16, 13]
            });

            return L.marker(
                [Number(node.latitude), Number(node.longitude)],
                { icon: icone, zIndexOffset: 1000 }
            )
                .addTo(mapa)
                .bindPopup(`<strong>Parada ${rotulo}:</strong> ${node.name}`);

        }).filter(marcador => marcador !== null);

    })();
}