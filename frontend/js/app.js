const API_URL = "http://localhost:3000";

const cenarioSelect = document.getElementById("cenario");
const origemSelect = document.getElementById("origem");
const destinoSelect = document.getElementById("destino");
const btnCalcular = document.getElementById("btnCalcular");
const mensagem = document.getElementById("mensagem");

let graficoExecucao = null;
let mapa = null;
let camadaGrafo = null;

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

        mensagem.textContent =
            "Erro ao carregar os cenários. Verifique se o banco foi " +
            "populado (schema.sql + seed.sql).";
    }
}

async function carregarNodes() {

try {

    const resposta = await fetch(
        `${API_URL}/api/nodes?cenario=${cenarioAtual()}`
    );

    const dados = await resposta.json();

    if (!dados.sucesso) {
        throw new Error("Não foi possível carregar os nodes.");
    }

    origemSelect.innerHTML = "";
    destinoSelect.innerHTML = "";

    const nodeOrigem =
        dados.nodes.find(node => node.node_type === "origem") ||
        dados.nodes[0];

    const optionOrigem = document.createElement("option");
    optionOrigem.value = nodeOrigem.id;
    optionOrigem.textContent = nodeOrigem.name;
    origemSelect.appendChild(optionOrigem);

    origemSelect.value = nodeOrigem.id;
    origemSelect.disabled = true;

    dados.nodes
        .filter(node => node.id !== nodeOrigem.id)
        .forEach(node => {

            const optionDestino = document.createElement("option");

            optionDestino.value = node.id;
            optionDestino.textContent = node.name;

            destinoSelect.appendChild(optionDestino);

        });

    if (destinoSelect.options.length > 0) {
        destinoSelect.value = destinoSelect.options[destinoSelect.options.length - 1].value;
    }

} catch (erro) {

    console.error(erro);

    mensagem.textContent =
        "Erro ao carregar os pontos da rede.";

}

}

async function calcularRotas() {

const origem = origemSelect.value;
const destino = destinoSelect.value;
const cenario = cenarioAtual();

if (!origem || !destino) {

    mensagem.textContent =
        "Selecione a origem e o destino.";

    return;
}

if (origem === destino) {

    mensagem.textContent =
        "A origem e o destino devem ser diferentes.";

    return;
}

mensagem.textContent =
    "Calculando rotas...";

try {

    const [dijkstra, bellmanFord, aStar] =
        await Promise.all([

            fetch(
                `${API_URL}/api/rotas/dijkstra?cenario=${cenario}&origem=${origem}&destino=${destino}`
            ).then(res => res.json()),

            fetch(
                `${API_URL}/api/rotas/bellman-ford?cenario=${cenario}&origem=${origem}&destino=${destino}`
            ).then(res => res.json()),

            fetch(
                `${API_URL}/api/rotas/a-star?cenario=${cenario}&origem=${origem}&destino=${destino}`
            ).then(res => res.json())

        ]);

    if (
        !dijkstra.sucesso ||
        !bellmanFord.sucesso ||
        !aStar.sucesso
    ) {

        throw new Error(
            "Um ou mais algoritmos não retornaram resultados."
        );

    }

    mostrarResultado(
        "dijkstra",
        dijkstra
    );

    mostrarResultado(
        "bellman",
        bellmanFord
    );

    mostrarResultado(
        "astar",
        aStar
    );

    atualizarTabela(
        dijkstra,
        bellmanFord,
        aStar
    );

    document.getElementById("caminhoRotaSimples").innerHTML =
    `<strong style="color:${corAlgoritmo('Dijkstra')}">Dijkstra:</strong> ` +
    dijkstra.rota.join(" → ") +
    `<br><strong style="color:${corAlgoritmo('Bellman-Ford')}">Bellman-Ford:</strong> ` +
    bellmanFord.rota.join(" → ") +
    `<br><strong style="color:${corAlgoritmo('A*')}">A*:</strong> ` +
    aStar.rota.join(" → ");

    atualizarGraficoExecucao(
    dijkstra,
    bellmanFord,
    aStar
    );

    destacarRotaNoMapa(dijkstra.rota_ids);

    mensagem.textContent =
        "Rotas calculadas com sucesso.";

} catch (erro) {

    console.error(erro);

    mensagem.textContent =
        "Erro ao calcular as rotas.";

}

}

function mostrarResultado(prefixo, resultado) {

document.getElementById(
    `${prefixo}-distancia`
).textContent =
    `${resultado.distancia_km} km`;

document.getElementById(
    `${prefixo}-custo`
).textContent =
    `R$ ${resultado.custo_brl.toFixed(2)}`;

document.getElementById(
    `${prefixo}-tempo`
).textContent =
    `${formatarHoras(resultado.tempo_min)}`;

document.getElementById(
    `${prefixo}-execucao`
).textContent =
    `${resultado.tempo_execucao_ms} ms`;

}

function corAlgoritmo(nome) {
    if (nome === "Dijkstra") return "#0E7C86";
    if (nome === "Bellman-Ford") return "#B8752E";
    if (nome === "A*") return "#6D4E9C";
    return "inherit";
}

function atualizarTabela(
dijkstra,
bellmanFord,
aStar
) {

const tabela =
    document.getElementById(
        "tabelaResultados"
    );

tabela.innerHTML = "";

const resultados = [
    dijkstra,
    bellmanFord,
    aStar
];

resultados.forEach(resultado => {

    const linha =
        document.createElement("tr");

    linha.innerHTML = `

        <td style="color: ${corAlgoritmo(resultado.algoritmo)}">${resultado.algoritmo}</td>

        <td>
            ${resultado.distancia_km} km
        </td>

        <td>
            R$ ${resultado.custo_brl.toFixed(2)}
        </td>

        <td>
            ${formatarHoras(resultado.tempo_min)}
        </td>

        <td>
            ${resultado.tempo_execucao_ms} ms
        </td>

    `;

    tabela.appendChild(linha);

});

}

function atualizarGraficoExecucao(
    dijkstra,
    bellmanFord,
    aStar
) {

    const canvas =
        document.getElementById("graficoExecucao");

    const dados = [
        dijkstra.tempo_execucao_ms,
        bellmanFord.tempo_execucao_ms,
        aStar.tempo_execucao_ms
    ];

    const coresAlgoritmos = ["#0E7C86", "#B8752E", "#6D4E9C"];

    if (graficoExecucao) {
        graficoExecucao.destroy();
    }

    graficoExecucao = new Chart(canvas, {

        type: "bar",

        data: {

            labels: [
                "Dijkstra",
                "Bellman-Ford",
                "A*"
            ],

            datasets: [

                {
                    label: "Tempo de execução (ms)",
                    data: dados,
                    backgroundColor: coresAlgoritmos,
                    borderRadius: 3
                }

            ]

        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            scales: {

                y: {

                    beginAtZero: true,

                    title: {
                        display: true,
                        text: "Tempo de execução (ms)"
                    }

                },

                x: {

                    title: {
                        display: true,
                        text: "Algoritmo"
                    }

                }

            },

            plugins: {

                legend: {
                    display: false
                },

                title: {
                    display: true,
                    text: "Comparação do tempo de execução"
                }

            }

        }

    });
}

let nodesPorIdAtual = {};
let edgesPorParAtual = {};

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

    if (window.__linhaRotaDestaque) {
        mapa.removeLayer(window.__linhaRotaDestaque);
    }

    window.__linhaRotaDestaque = L.polyline(pontosRota, {
        weight: 5,
        color: "#dc2626"
    }).addTo(mapa);
}

const btnAtualizarResumo = document.getElementById("btnAtualizarResumo");
const mensagemResumo = document.getElementById("mensagemResumo");

function fmtNum(valor, casas) {
    if (valor === null || valor === undefined) {
        return "—";
    }
    return Number(valor).toFixed(casas);
}

async function carregarResumoExperimentos() {

    mensagemResumo.textContent = "Carregando resumo...";

    try {

        const resposta = await fetch(
            `${API_URL}/api/experimentos/resumo?cenario=${cenarioAtual()}`
        );
        const dados = await resposta.json();

        if (!dados.sucesso) {
            throw new Error("Não foi possível carregar o resumo.");
        }

        const tabela = document.getElementById("tabelaResumoExperimentos");
        tabela.innerHTML = "";

        if (!dados.resumo || dados.resumo.length === 0) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="11">
                        Nenhum experimento encontrado no banco. Rode antes,
                        na pasta backend: node scripts/rodarExperimentosCompletos.js
                    </td>
                </tr>
            `;
            mensagemResumo.textContent = "";
            return;
        }

        dados.resumo.forEach(linha => {

            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${linha.scenario}</td>
                <td style="color: ${corAlgoritmo(linha.algorithm)}">${linha.algorithm}</td>
                <td>${linha.execucoes_com_rota}</td>
                <td>${fmtNum(linha.media_distancia_km, 2)}</td>
                <td>R$ ${fmtNum(linha.media_custo_brl, 2)}</td>
                <td>${fmtNum(linha.media_tempo_min, 2)}</td>
                <td>${fmtNum(linha.media_execucao_ms, 4)}</td>
                <td>${fmtNum(linha.mediana_execucao_ms, 4)}</td>
                <td>${fmtNum(linha.desvio_padrao_execucao_ms, 4)}</td>
                <td>${fmtNum(linha.min_execucao_ms, 4)}</td>
                <td>${fmtNum(linha.max_execucao_ms, 4)}</td>
            `;

            tabela.appendChild(tr);
        });

        mensagemResumo.textContent =
            `Resumo atualizado (${dados.resumo.length} combinações de ` +
            `cenário/algoritmo encontradas).`;

    } catch (erro) {

        console.error(erro);

        mensagemResumo.textContent =
            "Erro ao carregar o resumo dos experimentos.";
    }
}

btnAtualizarResumo.addEventListener("click", carregarResumoExperimentos);

function formatarHoras(minutosTotais) {
    const horas = Math.floor(minutosTotais / 60);
    const minutos = Math.round(minutosTotais % 60);
    if (horas === 0) {
        return `${minutos}min`;
    }
    return `${horas}h ${minutos.toString().padStart(2, "0")}min`;
}

const btnCalcularEntrega = document.getElementById("btnCalcularEntrega");
const mensagemEntrega = document.getElementById("mensagemEntrega");

async function calcularRotaEntrega() {

    mensagemEntrega.textContent = "Calculando rota de entrega (pode levar alguns segundos em cenários maiores)...";

    try {

        const resposta = await fetch(
            `${API_URL}/api/rotas/entrega?cenario=${cenarioAtual()}`
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            throw new Error(dados.mensagem || "Não foi possível calcular a rota de entrega.");
        }

        const tabela = document.getElementById("tabelaRotaEntrega");
        tabela.innerHTML = "";

        const nomesAlgoritmos = ["Dijkstra", "Bellman-Ford", "A*"];
        let primeiraRotaValida = null;

        nomesAlgoritmos.forEach(nome => {

            const r = dados.resultados[nome];
            const tr = document.createElement("tr");

            if (!r || !r.sucesso) {
                tr.innerHTML = `
                    <td style="color: ${corAlgoritmo(nome)}">${nome}</td>
                    <td colspan="6">${r ? r.mensagem : "Sem resultado"}</td>
                `;
            } else {

                if (!primeiraRotaValida) {
                    primeiraRotaValida = r;
                }

                tr.innerHTML = `
                    <td style="color: ${corAlgoritmo(nome)}">${nome}</td>
                    <td>${r.distancia_total_km} km</td>
                    <td>${formatarHoras(r.tempo_viagem_total_min)}</td>
                    <td>${r.quantidade_paradas}</td>
                    <td>${formatarHoras(r.tempo_total_com_paradas_min)}</td>
                    <td>R$ ${r.custo_total_brl.toFixed(2)}</td>
                    <td>${r.tempo_execucao_matriz_ms} ms</td>
                `;
            }

            tabela.appendChild(tr);
        });

        const ordemDiv = document.getElementById("ordemVisitaEntrega");

        if (primeiraRotaValida) {

            ordemDiv.innerHTML =
                `<strong>Ordem de visita (${dados.origem.nome} é origem e destino final):</strong><br>` +
                primeiraRotaValida.ordem_visita.join(" → ");

            destacarRotaNoMapa(primeiraRotaValida.rota_completa_ids);

            mensagemEntrega.textContent =
                "Rota de entrega calculada com sucesso. A rota está destacada no mapa.";

        } else {

            ordemDiv.innerHTML = "";

            mensagemEntrega.textContent =
                "Não foi possível calcular uma rota que passe por todos os pontos deste cenário " +
                "(algum ponto pode estar desconectado do restante do grafo).";
        }

    } catch (erro) {

        console.error(erro);

        mensagemEntrega.textContent =
            "Erro ao calcular a rota de entrega.";
    }
}

btnCalcularEntrega.addEventListener("click", calcularRotaEntrega);

btnCalcular.addEventListener(
"click",
calcularRotas
);

cenarioSelect.addEventListener("change", async () => {
    mensagem.textContent = "";

    if (window.__linhaRotaDestaque) {
        mapa.removeLayer(window.__linhaRotaDestaque);
        window.__linhaRotaDestaque = null;
    }

    await carregarNodes();
    await carregarGrafoNoMapa();
    await carregarResumoExperimentos();
});

async function iniciar() {
    await carregarCenarios();
    await carregarNodes();
    await inicializarMapa();
    await carregarResumoExperimentos();
}

iniciar();