const origemSelect = document.getElementById("origem");
const destinoSelect = document.getElementById("destino");
const btnCalcular = document.getElementById("btnCalcular");
const mensagem = document.getElementById("mensagem");

const PREFIXOS_CARD = { "Dijkstra": "dijkstra", "Bellman-Ford": "bellman", "A*": "astar" };
const CAMINHOS_API = { "Dijkstra": "dijkstra", "Bellman-Ford": "bellman-ford", "A*": "a-star" };

const mapa = criarMapa("mapa");

let grafoAtual = null;
let camadaRede = null;
let camadaRota = null;
let graficoExecucao = null;

async function carregarCenarios() {

    try {

        const cenarios = await buscarCenarios();

        preencherSelectCenarios(
            cenarios
                .filter(c => !separarVarianteK(c.cenario))
                .map(c => ({ nome: c.cenario, totalNodes: c.total_nodes }))
        );

        if (!cenarioSelect.value) {
            mensagem.textContent =
                "Nenhum cenário encontrado no banco. Gere um com node scripts/gerarCenarioTintas.js.";
        }

    } catch (erro) {

        console.error(erro);
        mensagem.textContent =
            "Erro ao carregar os cenários. Verifique se o backend está rodando.";
    }
}

async function carregarCenarioNoMapa() {

    limparResultados();

    if (camadaRede) {
        mapa.removeLayer(camadaRede);
        camadaRede = null;
    }

    if (!cenarioAtual()) return;

    try {

        grafoAtual = await buscarGrafo(cenarioAtual());
        camadaRede = desenharRede(mapa, grafoAtual);

        const nodeOrigem =
            grafoAtual.nodes.find(node => node.node_type === "origem") ||
            grafoAtual.nodes[0];

        origemSelect.innerHTML = `<option value="${nodeOrigem.id}">${nodeOrigem.name}</option>`;
        origemSelect.disabled = true;

        destinoSelect.innerHTML = "";

        grafoAtual.nodes
            .filter(node => node.id !== nodeOrigem.id)
            .forEach(node => {
                const option = document.createElement("option");
                option.value = node.id;
                option.textContent = node.name;
                destinoSelect.appendChild(option);
            });

        if (destinoSelect.options.length > 0) {
            destinoSelect.value = destinoSelect.options[destinoSelect.options.length - 1].value;
        }

    } catch (erro) {

        console.error(erro);
        mensagem.textContent = "Erro ao carregar os pontos da rede.";
    }
}

function limparResultados() {

    mensagem.textContent = "";

    if (camadaRota) {
        mapa.removeLayer(camadaRota);
        camadaRota = null;
    }

    Object.values(PREFIXOS_CARD).forEach(prefixo => {
        ["distancia", "custo", "tempo", "execucao"].forEach(campo => {
            document.getElementById(`${prefixo}-${campo}`).textContent = "-";
        });
    });

    document.getElementById("tabelaResultados").innerHTML =
        `<tr><td colspan="5">Nenhum resultado calculado.</td></tr>`;
    document.getElementById("caminhoRotaSimples").innerHTML = "";

    if (graficoExecucao) {
        graficoExecucao.destroy();
        graficoExecucao = null;
    }
}

async function calcularRotas() {

    const origem = origemSelect.value;
    const destino = destinoSelect.value;
    const cenario = encodeURIComponent(cenarioAtual());

    if (!origem || !destino) {
        mensagem.textContent = "Selecione a origem e o destino.";
        return;
    }

    mensagem.textContent = "Calculando rotas...";

    try {

        const resultados = await Promise.all(NOMES_ALGORITMOS.map(nome =>
            fetch(
                `${API_URL}/api/rotas/${CAMINHOS_API[nome]}?cenario=${cenario}&origem=${origem}&destino=${destino}`
            ).then(res => res.json())
        ));

        const falha = resultados.find(r => !r.sucesso);

        if (falha) {
            throw new Error(falha.mensagem || "Um ou mais algoritmos não retornaram resultados.");
        }

        resultados.forEach(mostrarResultado);
        atualizarTabela(resultados);
        atualizarGraficoExecucao(resultados);

        document.getElementById("caminhoRotaSimples").innerHTML = resultados
            .map(r => `<strong style="color: ${corAlgoritmo(r.algoritmo)}">${r.algoritmo}:</strong> ${r.rota.join(" → ")}`)
            .join("<br>");

        if (camadaRota) {
            mapa.removeLayer(camadaRota);
        }

        camadaRota = desenharRota(mapa, grafoAtual, resultados[0].rota_ids);

        mensagem.textContent = "Rotas calculadas com sucesso.";

    } catch (erro) {

        console.error(erro);
        mensagem.textContent = "Erro ao calcular as rotas.";
    }
}

function mostrarResultado(resultado) {

    const prefixo = PREFIXOS_CARD[resultado.algoritmo];

    document.getElementById(`${prefixo}-distancia`).textContent = `${resultado.distancia_km} km`;
    document.getElementById(`${prefixo}-custo`).textContent = `R$ ${resultado.custo_brl.toFixed(2)}`;
    document.getElementById(`${prefixo}-tempo`).textContent = formatarHoras(resultado.tempo_min);
    document.getElementById(`${prefixo}-execucao`).textContent = `${resultado.tempo_execucao_ms} ms`;
}

function atualizarTabela(resultados) {

    const tabela = document.getElementById("tabelaResultados");
    tabela.innerHTML = "";

    resultados.forEach(resultado => {

        const linha = document.createElement("tr");

        linha.innerHTML = `
            <td style="color: ${corAlgoritmo(resultado.algoritmo)}">${resultado.algoritmo}</td>
            <td>${resultado.distancia_km} km</td>
            <td>R$ ${resultado.custo_brl.toFixed(2)}</td>
            <td>${formatarHoras(resultado.tempo_min)}</td>
            <td>${resultado.tempo_execucao_ms} ms</td>
        `;

        tabela.appendChild(linha);
    });
}

function atualizarGraficoExecucao(resultados) {

    if (graficoExecucao) {
        graficoExecucao.destroy();
    }

    graficoExecucao = new Chart(document.getElementById("graficoExecucao"), {
        type: "bar",
        data: {
            labels: resultados.map(r => r.algoritmo),
            datasets: [
                {
                    label: "Tempo de execução (ms)",
                    data: resultados.map(r => r.tempo_execucao_ms),
                    backgroundColor: resultados.map(r => corAlgoritmo(r.algoritmo)),
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
                    title: { display: true, text: "Tempo de execução (ms)" }
                },
                x: {
                    title: { display: true, text: "Algoritmo" }
                }
            },
            plugins: {
                legend: { display: false },
                title: { display: true, text: "Comparação do tempo de execução" }
            }
        }
    });
}

btnCalcular.addEventListener("click", calcularRotas);
cenarioSelect.addEventListener("change", carregarCenarioNoMapa);

async function iniciar() {
    await carregarCenarios();
    await carregarCenarioNoMapa();
}

iniciar();
