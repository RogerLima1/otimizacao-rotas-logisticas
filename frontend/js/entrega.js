const btnAtualizarResumo = document.getElementById("btnAtualizarResumo");
const mensagemResumo = document.getElementById("mensagemResumo");
const btnCalcularEntrega = document.getElementById("btnCalcularEntrega");
const mensagemEntrega = document.getElementById("mensagemEntrega");
const gradeMapasK = document.getElementById("gradeMapasK");

let variantesK = {};
let paineisK = [];
let graficoK = null;

async function carregarCenarios() {

    try {

        const cenarios = await buscarCenarios();

        variantesK = {};

        cenarios.forEach(item => {
            const variante = separarVarianteK(item.cenario);
            if (!variante) return;

            if (!variantesK[variante.base]) variantesK[variante.base] = [];
            variantesK[variante.base].push({ k: variante.k, cenario: item.cenario, totalNodes: item.total_nodes });
        });

        Object.values(variantesK).forEach(lista => lista.sort((a, b) => a.k - b.k));

        preencherSelectCenarios(
            Object.keys(variantesK)
                .map(base => ({ nome: base, totalNodes: variantesK[base][0].totalNodes }))
                .sort((a, b) => a.totalNodes - b.totalNodes)
        );

        if (!cenarioSelect.value) {
            mensagemEntrega.textContent =
                "Nenhum cenário com k gerado. Rode na pasta backend: " +
                "node scripts/gerarCenarioTintas.js tintas_pequeno 9 3,5,8";
        }

    } catch (erro) {

        console.error(erro);
        mensagemEntrega.textContent =
            "Erro ao carregar os cenários. Verifique se o backend está rodando.";
    }
}

function variantesAtuais() {
    return variantesK[cenarioAtual()] || [];
}

async function carregarRedesK() {

    paineisK.forEach(p => p.mapa.remove());
    paineisK = [];
    gradeMapasK.innerHTML = "";
    limparComparacao();

    paineisK = variantesAtuais().map((variante, indice) => {

        const cartao = document.createElement("div");
        cartao.className = "mapa-k";
        cartao.innerHTML = `
            <div class="mapa-k__cabecalho">
                <h3>${indice + 1}º mapa · k = ${variante.k}</h3>
                <span class="mapa-k__selo" hidden>Mais rápido</span>
            </div>
            <div class="mapa-k__mapa" id="mapaK${variante.k}"></div>
            <div class="mapa-k__dados">Clique em "Calcular Rota de Entrega".</div>
        `;
        gradeMapasK.appendChild(cartao);

        return { variante, cartao, mapa: criarMapa(`mapaK${variante.k}`), grafo: null, camadaRota: null };
    });

    try {

        await Promise.all(paineisK.map(async painel => {
            painel.grafo = await buscarGrafo(painel.variante.cenario);
            painel.mapa.invalidateSize();
            desenharRede(painel.mapa, painel.grafo);
        }));

    } catch (erro) {

        console.error(erro);
        mensagemEntrega.textContent = "Erro ao carregar as redes do cenário.";
    }
}

function algoritmoMaisRapido(resultados) {
    return NOMES_ALGORITMOS
        .filter(nome => resultados[nome] && resultados[nome].sucesso)
        .reduce((melhor, nome) =>
            !melhor || resultados[nome].tempo_execucao_matriz_ms < resultados[melhor].tempo_execucao_matriz_ms
                ? nome
                : melhor
        , null);
}

function rotasIguais(resultados) {
    const rotas = NOMES_ALGORITMOS
        .map(nome => resultados[nome])
        .filter(r => r && r.sucesso)
        .map(r => r.rota_completa_ids.join(","));

    return rotas.length > 0 && rotas.every(r => r === rotas[0]);
}

async function calcularRotaEntrega() {

    if (paineisK.length === 0 || paineisK.some(p => !p.grafo)) {
        mensagemEntrega.textContent = "Selecione um cenário e aguarde os mapas carregarem.";
        return;
    }

    mensagemEntrega.textContent =
        `Calculando a rota de entrega com k = ${paineisK.map(p => p.variante.k).join(", ")} ` +
        "(pode levar alguns segundos em cenários maiores)...";

    btnCalcularEntrega.disabled = true;

    try {

        const comparacoes = [];

        for (const painel of paineisK) {

            const resposta = await fetch(
                `${API_URL}/api/rotas/entrega?cenario=${encodeURIComponent(painel.variante.cenario)}`
            );
            const entrega = await resposta.json();

            const dadosDiv = painel.cartao.querySelector(".mapa-k__dados");
            const vencedor = entrega.sucesso ? algoritmoMaisRapido(entrega.resultados) : null;

            if (painel.camadaRota) {
                painel.mapa.removeLayer(painel.camadaRota);
                painel.camadaRota = null;
            }

            if (!vencedor) {
                dadosDiv.textContent = entrega.mensagem ||
                    "Nenhum algoritmo encontrou uma rota que passe por todos os pontos.";
                comparacoes.push({ painel, sucesso: false });
                continue;
            }

            const rota = entrega.resultados[vencedor];

            painel.camadaRota = desenharRota(painel.mapa, painel.grafo, rota.rota_completa_ids);

            dadosDiv.innerHTML = `
                <div><span>Arestas</span><strong>${painel.grafo.edges.length}</strong></div>
                <div><span>Distância</span><strong>${rota.distancia_total_km.toFixed(2)} km</strong></div>
                <div><span>Tempo de viagem</span><strong>${formatarHoras(rota.tempo_viagem_total_min)}</strong></div>
                <div><span>Algoritmo mais rápido</span><strong style="color: ${corAlgoritmo(vencedor)}">${vencedor}</strong></div>
            `;

            comparacoes.push({
                painel,
                sucesso: true,
                resultados: entrega.resultados,
                rota,
                vencedor,
                mesmasRotas: rotasIguais(entrega.resultados)
            });
        }

        preencherComparacao(comparacoes);

        mensagemEntrega.textContent =
            "Rota de entrega calculada nas três redes. Cada mapa mostra o caminho traçado em vermelho.";

    } catch (erro) {

        console.error(erro);
        mensagemEntrega.textContent =
            "Erro ao calcular a rota de entrega. Verifique se o backend está rodando.";

    } finally {
        btnCalcularEntrega.disabled = false;
    }
}

function limparComparacao() {

    document.getElementById("tabelaComparacaoK").innerHTML =
        `<tr><td colspan="11">Nenhuma rota calculada ainda.</td></tr>`;
    document.getElementById("vereditoK").innerHTML = "";
    document.getElementById("ordemVisitaK").innerHTML = "";

    if (graficoK) {
        graficoK.destroy();
        graficoK = null;
    }
}

function preencherComparacao(comparacoes) {

    const validas = comparacoes.filter(c => c.sucesso);
    const tabela = document.getElementById("tabelaComparacaoK");
    const vereditoDiv = document.getElementById("vereditoK");
    const ordemDiv = document.getElementById("ordemVisitaK");

    limparComparacao();

    paineisK.forEach(p => {
        p.cartao.classList.remove("mapa-k--melhor");
        p.cartao.querySelector(".mapa-k__selo").hidden = true;
    });

    if (validas.length === 0) {
        tabela.innerHTML = `<tr><td colspan="11">Nenhuma rede produziu uma rota válida.</td></tr>`;
        return;
    }

    tabela.innerHTML = "";

    const melhor = validas.reduce((a, b) =>
        b.rota.tempo_viagem_total_min < a.rota.tempo_viagem_total_min ? b : a
    );
    const pior = validas.reduce((a, b) =>
        b.rota.tempo_viagem_total_min > a.rota.tempo_viagem_total_min ? b : a
    );

    const empatados = validas.filter(c =>
        Math.abs(c.rota.tempo_viagem_total_min - melhor.rota.tempo_viagem_total_min) < 0.01
    );

    empatados.forEach(c => {
        c.painel.cartao.classList.add("mapa-k--melhor");
        c.painel.cartao.querySelector(".mapa-k__selo").hidden = false;
    });

    comparacoes.forEach(c => {

        const k = c.painel.variante.k;
        const tr = document.createElement("tr");

        if (!c.sucesso) {
            tr.innerHTML = `<td>k = ${k}</td><td colspan="10">Sem rota válida</td>`;
            tabela.appendChild(tr);
            return;
        }

        const ehMelhor = empatados.includes(c);
        if (ehMelhor) tr.className = "linha-melhor";

        const tempos = NOMES_ALGORITMOS.map(nome => {
            const r = c.resultados[nome];
            if (!r || !r.sucesso) return `<td>—</td>`;
            const destaque = nome === c.vencedor ? ` class="celula-vencedor"` : "";
            return `<td${destaque}>${r.tempo_execucao_matriz_ms.toFixed(2)}</td>`;
        }).join("");

        tr.innerHTML = `
            <td>k = ${k}${ehMelhor ? " ★" : ""}</td>
            <td>${c.painel.grafo.edges.length}</td>
            <td>${c.rota.distancia_total_km.toFixed(2)}</td>
            <td>${formatarHoras(c.rota.tempo_viagem_total_min)}</td>
            <td>${c.rota.quantidade_paradas}</td>
            <td>${formatarHoras(c.rota.tempo_total_com_paradas_min)}</td>
            <td>R$ ${c.rota.custo_total_brl.toFixed(2)}</td>
            ${tempos}
            <td style="color: ${corAlgoritmo(c.vencedor)}">${c.vencedor}</td>
        `;

        tabela.appendChild(tr);

        const ordem = document.createElement("div");
        ordem.className = "ordem-visita";
        ordem.innerHTML =
            `<strong>Ordem de visita com k = ${k}:</strong><br>` +
            c.rota.ordem_visita.join(" → ");
        ordemDiv.appendChild(ordem);
    });

    const economiaMin = pior.rota.tempo_viagem_total_min - melhor.rota.tempo_viagem_total_min;
    const economiaKm = pior.rota.distancia_total_km - melhor.rota.distancia_total_km;
    const todasMesmasRotas = validas.every(c => c.mesmasRotas);
    const kMelhor = melhor.painel.variante.k;
    const rotuloMelhor = empatados.map(c => `k = ${c.painel.variante.k}`).join(" e ");

    vereditoDiv.innerHTML = `
        <div class="veredito-k__item">
            <span>Caminho mais rápido</span>
            <strong>${rotuloMelhor}</strong>
            <p>
                ${empatados.length > 1 ? "Empate: mesma rota nessas redes. " : ""}
                ${formatarHoras(melhor.rota.tempo_viagem_total_min)} de viagem,
                ${melhor.rota.distancia_total_km.toFixed(2)} km.
                ${economiaMin > 0.01
                    ? `${formatarHoras(economiaMin)} e ${economiaKm.toFixed(2)} km a menos que k = ${pior.painel.variante.k}.`
                    : ""}
            </p>
        </div>
        <div class="veredito-k__item">
            <span>Algoritmo que decidiu o melhor caminho</span>
            <strong style="color: ${corAlgoritmo(melhor.vencedor)}">${melhor.vencedor}</strong>
            <p>
                Montou a matriz de distâncias da rede k = ${kMelhor} em
                ${melhor.resultados[melhor.vencedor].tempo_execucao_matriz_ms.toFixed(2)} ms,
                o menor tempo entre os três.
            </p>
        </div>
        <p class="veredito-k__nota">
            ${todasMesmasRotas
                ? "Dentro de cada rede, Dijkstra, Bellman-Ford e A* encontraram exatamente o mesmo caminho — o que muda entre eles é o tempo de execução."
                : "Atenção: em alguma rede os algoritmos traçaram caminhos diferentes (provável empate de distância); o mapa mostra o do algoritmo mais rápido."}
            O que muda o caminho é o k: mais conexões dão mais opções de ruas.
            Os tempos em ms variam um pouco a cada execução.
        </p>
    `;

    atualizarGraficoK(validas);
}

function atualizarGraficoK(validas) {

    if (graficoK) graficoK.destroy();

    graficoK = new Chart(document.getElementById("graficoK"), {
        type: "bar",
        data: {
            labels: validas.map(c => `k = ${c.painel.variante.k}`),
            datasets: NOMES_ALGORITMOS.map(nome => ({
                label: nome,
                data: validas.map(c => {
                    const r = c.resultados[nome];
                    return r && r.sucesso ? r.tempo_execucao_matriz_ms : null;
                }),
                backgroundColor: corAlgoritmo(nome),
                borderRadius: 3
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "Tempo para montar a matriz (ms)" }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: "Tempo de execução de cada algoritmo por rede"
                }
            }
        }
    });
}

async function carregarResumoExperimentos() {

    const tabela = document.getElementById("tabelaResumoExperimentos");
    const variantes = variantesAtuais();

    if (variantes.length === 0) {
        tabela.innerHTML = `<tr><td colspan="11">Nenhum cenário selecionado.</td></tr>`;
        return;
    }

    mensagemResumo.textContent = "Carregando resumo...";

    try {

        const respostas = await Promise.all(variantes.map(v =>
            fetch(`${API_URL}/api/experimentos/resumo?cenario=${encodeURIComponent(v.cenario)}`)
                .then(res => res.json())
                .then(dados => {
                    if (!dados.sucesso) throw new Error("Não foi possível carregar o resumo.");
                    return dados.resumo.map(linha => ({ ...linha, k: v.k }));
                })
        ));

        const linhas = respostas.flat();

        tabela.innerHTML = "";

        if (linhas.length === 0) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="11">
                        Nenhum experimento salvo para as redes deste cenário.
                        Clique em "Atualizar Resumo" para rodar.
                    </td>
                </tr>
            `;
            mensagemResumo.textContent = "";
            return;
        }

        linhas.forEach(linha => {

            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>k = ${linha.k}</td>
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
            `Resumo atualizado (${linhas.length} combinações de rede/algoritmo).`;

    } catch (erro) {

        console.error(erro);
        mensagemResumo.textContent = "Erro ao carregar o resumo dos experimentos.";
    }
}

async function rodarERecarregarResumo() {

    const variantes = variantesAtuais();

    if (variantes.length === 0) return;

    mensagemResumo.textContent =
        "Rodando experimentos para todos os pares de cada rede (5 repetições " +
        "cada)... isso pode levar alguns segundos, principalmente em " +
        "cenários maiores.";

    btnAtualizarResumo.disabled = true;

    try {

        for (const variante of variantes) {

            const resposta = await fetch(
                `${API_URL}/api/experimentos/rodar?cenario=${encodeURIComponent(variante.cenario)}&repeticoes=5&maxPares=1000`
            );
            const dados = await resposta.json();

            if (!dados.sucesso) {
                throw new Error(dados.mensagem || "Não foi possível rodar os experimentos.");
            }
        }

        await carregarResumoExperimentos();

    } catch (erro) {

        console.error(erro);
        mensagemResumo.textContent =
            "Erro ao rodar os experimentos. Verifique se o backend está rodando.";

    } finally {
        btnAtualizarResumo.disabled = false;
    }
}

btnAtualizarResumo.addEventListener("click", rodarERecarregarResumo);
btnCalcularEntrega.addEventListener("click", calcularRotaEntrega);

cenarioSelect.addEventListener("change", async () => {
    mensagemEntrega.textContent = "";
    mensagemResumo.textContent = "";

    await carregarRedesK();
    await carregarResumoExperimentos();
});

async function iniciar() {
    await carregarCenarios();
    await carregarRedesK();
    await carregarResumoExperimentos();
}

iniciar();
