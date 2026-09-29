const origemSelect = document.getElementById("origem");
const destinoSelect = document.getElementById("destino");
const btnCalcular = document.getElementById("btnCalcular");
const mensagem = document.getElementById("mensagem");

let graficoExecucao = null;

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

btnCalcular.addEventListener(
"click",
calcularRotas
);

cenarioSelect.addEventListener("change", async () => {
    mensagem.textContent = "";

    limparRotaDestacada();

    await carregarNodes();
    await carregarGrafoNoMapa();
});

async function iniciar() {
    await carregarCenarios();
    await carregarNodes();
    await inicializarMapa();
}

iniciar();