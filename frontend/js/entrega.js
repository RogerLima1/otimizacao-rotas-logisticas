const btnAtualizarResumo = document.getElementById("btnAtualizarResumo");
const mensagemResumo = document.getElementById("mensagemResumo");
const btnCalcularEntrega = document.getElementById("btnCalcularEntrega");
const mensagemEntrega = document.getElementById("mensagemEntrega");

let graficoEntrega = null;

function atualizarGraficoEntrega(resultados) {

    const canvas = document.getElementById("graficoEntrega");

    const nomesAlgoritmos = ["Dijkstra", "Bellman-Ford", "A*"];
    const coresAlgoritmos = ["#0E7C86", "#B8752E", "#6D4E9C"];

    const dados = nomesAlgoritmos.map(nome => {
        const r = resultados[nome];
        return (r && r.sucesso) ? r.tempo_execucao_matriz_ms : 0;
    });

    if (graficoEntrega) {
        graficoEntrega.destroy();
    }

    graficoEntrega = new Chart(canvas, {

        type: "bar",

        data: {
            labels: nomesAlgoritmos,
            datasets: [
                {
                    label: "Tempo para montar a matriz (ms)",
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
                    text: "Comparação do tempo para montar a matriz de distâncias"
                }
            }
        }

    });
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

async function rodarERecarregarResumo() {

    mensagemResumo.textContent =
        "Rodando experimentos para todos os pares do cenário (5 repetições " +
        "cada)... isso pode levar alguns segundos, principalmente em " +
        "cenários maiores.";

    try {

        const resposta = await fetch(
            `${API_URL}/api/experimentos/rodar?cenario=${cenarioAtual()}&repeticoes=5&maxPares=1000`
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            throw new Error(dados.mensagem || "Não foi possível rodar os experimentos.");
        }

        await carregarResumoExperimentos();

    } catch (erro) {

        console.error(erro);

        mensagemResumo.textContent =
            "Erro ao rodar os experimentos. Verifique se o backend está rodando.";
    }
}

btnAtualizarResumo.addEventListener("click", rodarERecarregarResumo);
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

        atualizarGraficoEntrega(dados.resultados);

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

cenarioSelect.addEventListener("change", async () => {
    mensagemEntrega.textContent = "";

    limparRotaDestacada();

    await carregarGrafoNoMapa();
    await carregarResumoExperimentos();
});

async function iniciar() {
    await carregarCenarios();
    await inicializarMapa();
    await carregarResumoExperimentos();
}

iniciar();