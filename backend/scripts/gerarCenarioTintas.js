const pool = require('../src/db/database');

const NOME_CENARIO = process.argv[2];
const QTD_DESTINOS = Number(process.argv[3]);

const ORIGEM = {
    nome: 'UNESC - Universidade do Extremo Sul Catarinense',
    tipo: 'origem',
    endereco: 'Avenida Universitária, 1105, Criciúma, Santa Catarina, Brasil'
};

const DESTINOS = [
    { nome: 'Anjo Tintas (Fábrica Matriz)', tipo: 'industria',
      endereco: 'Vila Macarini, Criciúma, Santa Catarina, Brasil' },
    { nome: 'DZ Tintas', tipo: 'revenda',
      endereco: 'Rua Coronel Marcos Rovaris, 675, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Arco-Íris Tintas', tipo: 'revenda',
      endereco: 'Rua Henrique Lage, 529, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Tintacor', tipo: 'revenda',
      endereco: 'Avenida Santos Dumont, 1456, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Empório Tintas (Santa Luzia)', tipo: 'revenda',
      endereco: 'Santa Luzia, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Distribuidora de Tintas - Içara', tipo: 'revenda',
      endereco: 'Içara, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas - Siderópolis', tipo: 'revenda',
      endereco: 'Siderópolis, Santa Catarina, Brasil' },
    { nome: 'Nordeste Tintas (Comerciário)', tipo: 'revenda',
      endereco: 'Comerciário, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Centro)', tipo: 'revenda',
      endereco: 'Avenida Centenário, 3069, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (São Luiz)', tipo: 'revenda',
      endereco: 'Rodovia Luiz Rosso, 310, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Próspera)', tipo: 'revenda',
      endereco: 'Rua General Osvaldo Pinto da Veiga, 751, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Centro II)', tipo: 'revenda',
      endereco: 'Rua Marechal Deodoro, 183, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (São Luiz II)', tipo: 'revenda',
      endereco: 'Rua Rodrigues Alves, 936, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Renascer)', tipo: 'revenda',
      endereco: 'Renascer, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Pinheirinho)', tipo: 'revenda',
      endereco: 'Pinheirinho, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Boa Vista)', tipo: 'revenda',
      endereco: 'Boa Vista, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Mina do Mato)', tipo: 'revenda',
      endereco: 'Mina do Mato, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Cristo Redentor)', tipo: 'revenda',
      endereco: 'Cristo Redentor, Criciúma, Santa Catarina, Brasil' },
    { nome: 'Revenda de Tintas (Argentina)', tipo: 'revenda',
      endereco: 'Argentina, Criciúma, Santa Catarina, Brasil' }
];

function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function validarArgumentos() {
    if (!NOME_CENARIO || !QTD_DESTINOS || QTD_DESTINOS < 1) {
        console.error(
            'Uso: node scripts/gerarCenarioTintas.js <nomeCenario> <quantidadeDeDestinos>'
        );
        console.error('Exemplo: node scripts/gerarCenarioTintas.js tintas_pequeno 9');
        process.exit(1);
    }

    if (QTD_DESTINOS > DESTINOS.length) {
        console.warn(
            `Aviso: só há ${DESTINOS.length} destinos cadastrados. Usando todos ` +
            `os ${DESTINOS.length} em vez de ${QTD_DESTINOS}.`
        );
    }
}

async function buscarNominatim(endereco) {
    const query = encodeURIComponent(endereco);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`;

    const resposta = await fetch(url, {
        headers: {
            'User-Agent': 'TCC-RotasLogisticas-Unesc/1.0 (uso academico)'
        }
    });

    if (!resposta.ok) {
        throw new Error(`Nominatim retornou status ${resposta.status}`);
    }

    const dados = await resposta.json();

    if (!dados || dados.length === 0) {
        throw new Error(`Nenhum resultado para "${endereco}".`);
    }

    return {
        latitude: Number(dados[0].lat),
        longitude: Number(dados[0].lon)
    };
}

async function geocodificarEndereco(enderecoCompleto) {
    const partes = enderecoCompleto.split(',').map(p => p.trim());
    const minPartes = 2;

    let ultimoErro = null;

    for (let i = 0; i <= partes.length - minPartes; i++) {
        const tentativa = partes.slice(i).join(', ');

        try {
            const coord = await buscarNominatim(tentativa);

            if (i > 0) {
                console.log(`    (endereço simplificado para: "${tentativa}")`);
            }

            return coord;

        } catch (erro) {
            ultimoErro = erro;

            if (i < partes.length - minPartes) {
                await aguardar(1100);
            }
        }
    }

    throw new Error(
        `Não foi possível geocodificar "${enderecoCompleto}" nem com ` +
        `versões simplificadas (${ultimoErro?.message || 'sem detalhes'}).`
    );
}

async function calcularRotaReal(origem, destino) {
    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${origem.longitude},${origem.latitude};` +
        `${destino.longitude},${destino.latitude}` +
        `?overview=full&geometries=geojson`;

    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error(`OSRM retornou status ${resposta.status}`);
    }

    const dados = await resposta.json();

    if (dados.code !== 'Ok' || !dados.routes || dados.routes.length === 0) {
        throw new Error(`OSRM não encontrou rota (código: ${dados.code})`);
    }

    const rota = dados.routes[0];

    return {
        distanciaKm: rota.distance / 1000,
        duracaoMin: rota.duration / 60,
        geometriaGeoJson: rota.geometry
    };
}

function distanciaHaversine(a, b) {
    const R = 6371;
    const dLat = (b.latitude - a.latitude) * Math.PI / 180;
    const dLon = (b.longitude - a.longitude) * Math.PI / 180;
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.latitude * Math.PI / 180) *
        Math.cos(b.latitude * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function gerarConexoesPorProximidade(coordenadas, k = 3) {
    const quantidade = coordenadas.length;
    const conexoes = new Set();
    const chave = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

    for (let i = 0; i < quantidade; i++) {
        const distancias = [];

        for (let j = 0; j < quantidade; j++) {
            if (i === j) continue;
            distancias.push({ j, dist: distanciaHaversine(coordenadas[i], coordenadas[j]) });
        }

        distancias.sort((a, b) => a.dist - b.dist);

        distancias.slice(0, k).forEach(({ j }) => {
            conexoes.add(chave(i, j));
        });
    }

    function componentesConexas() {
        const adj = Array.from({ length: quantidade }, () => []);
        conexoes.forEach(par => {
            const [a, b] = par.split('-').map(Number);
            adj[a].push(b);
            adj[b].push(a);
        });

        const visitado = new Array(quantidade).fill(false);
        const fila = [0];
        visitado[0] = true;

        while (fila.length) {
            const atual = fila.pop();
            for (const viz of adj[atual]) {
                if (!visitado[viz]) {
                    visitado[viz] = true;
                    fila.push(viz);
                }
            }
        }

        return visitado;
    }

    let visitado = componentesConexas();
    let isolados = visitado
        .map((v, idx) => (v ? null : idx))
        .filter(idx => idx !== null);

    while (isolados.length > 0) {
        const alcancaveis = visitado
            .map((v, idx) => (v ? idx : null))
            .filter(idx => idx !== null);

        let melhorPar = null;
        let melhorDist = Infinity;

        for (const i of isolados) {
            for (const j of alcancaveis) {
                const d = distanciaHaversine(coordenadas[i], coordenadas[j]);
                if (d < melhorDist) {
                    melhorDist = d;
                    melhorPar = [i, j];
                }
            }
        }

        conexoes.add(chave(melhorPar[0], melhorPar[1]));

        visitado = componentesConexas();
        isolados = visitado
            .map((v, idx) => (v ? null : idx))
            .filter(idx => idx !== null);
    }

    return Array.from(conexoes).map(par => {
        const [a, b] = par.split('-').map(Number);
        return [a, b];
    });
}

const CUSTO_POR_KM = 3.9826;

async function gerarCenario() {
    validarArgumentos();

    const destinosEscolhidos = DESTINOS.slice(0, Math.min(QTD_DESTINOS, DESTINOS.length));
    const pontos = [ORIGEM, ...destinosEscolhidos];

    console.log(`Gerando cenário '${NOME_CENARIO}' com ${pontos.length} nós ` +
        `(UNESC + ${destinosEscolhidos.length} revendas/indústrias de tinta)...\n`);

    console.log('Geocodificando endereços (Nominatim)...');

    const pontosValidos = [];
    const coordenadas = [];

    for (const ponto of pontos) {
        try {
            const coord = await geocodificarEndereco(ponto.endereco);
            pontosValidos.push(ponto);
            coordenadas.push(coord);
            console.log(`  ✓ ${ponto.nome}: ${coord.latitude}, ${coord.longitude}`);
        } catch (erro) {
            console.error(`  ✗ ${ponto.nome}: ${erro.message}`);
            console.error(`    (esse ponto será deixado de fora do cenário)`);
        }

        await aguardar(1100);
    }

    if (pontosValidos.length < 2) {
        console.error(
            '\nMenos de 2 pontos foram geocodificados com sucesso. Não é ' +
            'possível gerar um cenário. Verifique sua conexão e tente de novo.'
        );
        process.exitCode = 1;
        return;
    }

    if (pontosValidos.length < pontos.length) {
        console.log(
            `\nAviso: ${pontos.length - pontosValidos.length} de ${pontos.length} ` +
            `pontos não foram geocodificados e ficaram de fora do cenário. ` +
            `O cenário será gerado com ${pontosValidos.length} nós.`
        );
    }

    const TOLERANCIA_GRAUS = 0.0005;
    const avisosDuplicidade = [];

    for (let i = 0; i < coordenadas.length; i++) {
        for (let j = i + 1; j < coordenadas.length; j++) {
            const dLat = Math.abs(coordenadas[i].latitude - coordenadas[j].latitude);
            const dLon = Math.abs(coordenadas[i].longitude - coordenadas[j].longitude);

            if (dLat < TOLERANCIA_GRAUS && dLon < TOLERANCIA_GRAUS) {
                avisosDuplicidade.push(
                    `"${pontosValidos[i].nome}" e "${pontosValidos[j].nome}" ` +
                    `ficaram com coordenadas praticamente idênticas`
                );
            }
        }
    }

    if (avisosDuplicidade.length > 0) {
        console.log(
            `\n⚠ Atenção: ${avisosDuplicidade.length} par(es) de pontos ficaram ` +
            `com coordenadas muito próximas (possível falha de geocodificação ` +
            `específica, caindo num ponto genérico da cidade):`
        );
        avisosDuplicidade.forEach(aviso => console.log(`  - ${aviso}`));
        console.log(
            '  Isso vai gerar distâncias de ~0 km entre esses pontos. Considere ' +
            'ajustar o endereço deles na lista DESTINOS do script e gerar de novo.\n'
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(`DELETE FROM experiments WHERE scenario = $1`, [NOME_CENARIO]);
        await client.query(`DELETE FROM edges WHERE scenario = $1`, [NOME_CENARIO]);
        await client.query(`DELETE FROM nodes WHERE scenario = $1`, [NOME_CENARIO]);

        const idsInseridos = [];

        for (let i = 0; i < pontosValidos.length; i++) {
            const resultado = await client.query(`
                INSERT INTO nodes (name, node_type, scenario, latitude, longitude, geom)
                VALUES ($1, $2, $3, $4, $5,
                    ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography)
                RETURNING id
            `, [
                pontosValidos[i].nome,
                pontosValidos[i].tipo,
                NOME_CENARIO,
                coordenadas[i].latitude,
                coordenadas[i].longitude
            ]);

            idsInseridos.push(resultado.rows[0].id);
        }

        console.log('\nCalculando rotas reais pelas ruas (OSRM)...');

        const conexoes = gerarConexoesPorProximidade(coordenadas, 3);
        let totalArestas = 0;
        let falhasRoteamento = 0;

        for (const [a, b] of conexoes) {
            for (const [origemIdx, destinoIdx] of [[a, b], [b, a]]) {
                try {
                    const rota = await calcularRotaReal(
                        coordenadas[origemIdx],
                        coordenadas[destinoIdx]
                    );

                    const custoBrl = rota.distanciaKm * CUSTO_POR_KM;

                    await client.query(`
                        INSERT INTO edges (
                            source_id, target_id, scenario,
                            distance_km, travel_time_min, cost_brl,
                            road_type, geom
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, 'real_osrm',
                            ST_GeomFromGeoJSON($7)::geography
                        )
                    `, [
                        idsInseridos[origemIdx],
                        idsInseridos[destinoIdx],
                        NOME_CENARIO,
                        rota.distanciaKm,
                        rota.duracaoMin,
                        custoBrl,
                        JSON.stringify(rota.geometriaGeoJson)
                    ]);

                    totalArestas++;
                    console.log(
                        `  ✓ ${pontosValidos[origemIdx].nome} -> ${pontosValidos[destinoIdx].nome}: ` +
                        `${rota.distanciaKm.toFixed(2)} km, ${rota.duracaoMin.toFixed(1)} min`
                    );

                } catch (erro) {
                    falhasRoteamento++;
                    console.error(
                        `  ✗ ${pontosValidos[origemIdx].nome} -> ${pontosValidos[destinoIdx].nome}: ${erro.message}`
                    );
                }

                await aguardar(500);
            }
        }

        await client.query('COMMIT');

        console.log(`\nCenário '${NOME_CENARIO}' gerado com sucesso:`);
        console.log(`  - ${pontosValidos.length} nós (de ${pontos.length} planejados)`);
        console.log(`  - ${totalArestas} trechos de rua reais (arestas)`);
        if (falhasRoteamento > 0) {
            console.log(`  - ${falhasRoteamento} conexões falharam ao rotear (ver acima)`);
        }
        console.log(`  - ID da UNESC (origem): ${idsInseridos[0]}`);

    } catch (erro) {
        await client.query('ROLLBACK');
        console.error('Erro ao gerar cenário:', erro);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

gerarCenario();