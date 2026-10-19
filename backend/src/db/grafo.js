const pool = require('./database');

async function listarCenarios() {
    const resultado = await pool.query(
        `SELECT DISTINCT scenario FROM nodes ORDER BY scenario`
    );
    return resultado.rows.map(r => r.scenario);
}

async function buscarGrafo(cenario) {
    const resultadoNodes = await pool.query(
        `SELECT * FROM nodes WHERE scenario = $1 ORDER BY id`,
        [cenario]
    );

    const resultadoEdges = await pool.query(
        `SELECT id, source_id, target_id, scenario, distance_km,
                travel_time_min, cost_brl, road_type,
                ST_AsGeoJSON(geom) AS geom_geojson
         FROM edges WHERE scenario = $1 ORDER BY id`,
        [cenario]
    );

    const edges = resultadoEdges.rows.map(({ geom_geojson, ...edge }) => {
        let geometria = null;

        try {
            geometria = JSON.parse(geom_geojson).coordinates.map(([lon, lat]) => [lat, lon]);
        } catch (erro) {
            geometria = null;
        }

        return { ...edge, geometria };
    });

    return { nodes: resultadoNodes.rows, edges };
}

module.exports = { listarCenarios, buscarGrafo };
