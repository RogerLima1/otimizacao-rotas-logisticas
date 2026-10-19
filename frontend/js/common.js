const API_URL = "http://localhost:3000";

const cenarioSelect = document.getElementById("cenario");

const NOMES_ALGORITMOS = ["Dijkstra", "Bellman-Ford", "A*"];

function cenarioAtual() {
    return cenarioSelect.value;
}

async function buscarCenarios() {

    const resposta = await fetch(`${API_URL}/api/cenarios`);
    const dados = await resposta.json();

    if (!dados.sucesso) {
        throw new Error("Não foi possível listar os cenários.");
    }

    return dados.cenarios;
}

function separarVarianteK(nomeCenario) {
    const casamento = nomeCenario.match(/^(.+)_k(\d+)$/);
    return casamento ? { base: casamento[1], k: Number(casamento[2]) } : null;
}

function preencherSelectCenarios(cenarios) {

    cenarioSelect.innerHTML = "";

    cenarios.forEach(({ nome, totalNodes }) => {
        const option = document.createElement("option");
        option.value = nome;
        option.textContent = `${nome} (${totalNodes} nós)`;
        cenarioSelect.appendChild(option);
    });
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

function criarMapa(elementoId) {

    const mapa = L.map(elementoId).setView([-28.6786, -49.3696], 12);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "&copy; OpenStreetMap contributors" }
    ).addTo(mapa);

    return mapa;
}

async function buscarGrafo(cenario) {

    const resposta = await fetch(`${API_URL}/api/grafo?cenario=${encodeURIComponent(cenario)}`);
    const dados = await resposta.json();

    if (!dados.sucesso) {
        throw new Error("Não foi possível carregar o grafo.");
    }

    const nodesPorId = {};
    const edgesPorPar = {};

    dados.nodes.forEach(node => {
        nodesPorId[node.id] = node;
    });

    dados.edges.forEach(edge => {
        edgesPorPar[`${edge.source_id}-${edge.target_id}`] = edge;
    });

    return { nodes: dados.nodes, edges: dados.edges, nodesPorId, edgesPorPar };
}

function latlngNode(grafo, id) {
    const node = grafo.nodesPorId[id];
    return [Number(node.latitude), Number(node.longitude)];
}

function geometriaAresta(grafo, origemId, destinoId) {
    const edge = grafo.edgesPorPar[`${origemId}-${destinoId}`];

    return (edge && edge.geometria && edge.geometria.length > 1)
        ? edge.geometria
        : [latlngNode(grafo, origemId), latlngNode(grafo, destinoId)];
}

function desenharRede(mapa, grafo) {

    const camada = L.layerGroup().addTo(mapa);

    grafo.edges.forEach(edge => {
        if (!grafo.nodesPorId[edge.source_id] || !grafo.nodesPorId[edge.target_id]) return;

        L.polyline(geometriaAresta(grafo, edge.source_id, edge.target_id), {
            weight: 2,
            color: "#94a3b8",
            opacity: 0.7
        }).addTo(camada);
    });

    grafo.nodes.forEach(node => {
        L.circleMarker([Number(node.latitude), Number(node.longitude)], {
            radius: 5,
            color: "#10242E",
            weight: 1,
            fillColor: "#ffffff",
            fillOpacity: 1
        })
            .addTo(camada)
            .bindPopup(`<strong>${node.name}</strong><br>Tipo: ${node.node_type}`);
    });

    if (grafo.nodes.length > 0) {
        mapa.fitBounds(
            grafo.nodes.map(n => [Number(n.latitude), Number(n.longitude)]),
            { padding: [20, 20] }
        );
    }

    return camada;
}

function desenharRota(mapa, grafo, rotaIds) {

    const camada = L.layerGroup().addTo(mapa);
    const pontosRota = [];

    for (let i = 0; i < rotaIds.length - 1; i++) {
        pontosRota.push(...geometriaAresta(grafo, rotaIds[i], rotaIds[i + 1]));
    }

    L.polyline(pontosRota, { weight: 4, color: "#C23B2E" }).addTo(camada);

    const posicoesPorNode = {};

    rotaIds.forEach((nodeId, indice) => {
        if (!posicoesPorNode[nodeId]) posicoesPorNode[nodeId] = [];
        posicoesPorNode[nodeId].push(indice + 1);
    });

    Object.keys(posicoesPorNode).forEach(nodeIdStr => {
        const nodeId = Number(nodeIdStr);
        const rotulo = posicoesPorNode[nodeId].join("/");

        const icone = L.divIcon({
            className: "marcador-numerado",
            html: `<span>${rotulo}</span>`,
            iconSize: [32, 26],
            iconAnchor: [16, 13]
        });

        L.marker(latlngNode(grafo, nodeId), { icon: icone, zIndexOffset: 1000 })
            .addTo(camada)
            .bindPopup(`<strong>Parada ${rotulo}:</strong> ${grafo.nodesPorId[nodeId].name}`);
    });

    return camada;
}
