CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS experiments CASCADE;
DROP TABLE IF EXISTS edges CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;

CREATE TABLE nodes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  node_type VARCHAR(30) NOT NULL DEFAULT 'intermediario',
  scenario VARCHAR(50) NOT NULL DEFAULT 'padrao',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(POINT, 4326) NOT NULL
);

CREATE TABLE edges (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  scenario VARCHAR(50) NOT NULL DEFAULT 'padrao',
  distance_km DOUBLE PRECISION NOT NULL CHECK (distance_km >= 0),
  travel_time_min DOUBLE PRECISION NOT NULL CHECK (travel_time_min >= 0),
  cost_brl DOUBLE PRECISION NOT NULL CHECK (cost_brl >= 0),
  road_type VARCHAR(40) DEFAULT 'simulada',
  geom GEOGRAPHY(LINESTRING, 4326) NOT NULL
);

CREATE INDEX idx_nodes_geom ON nodes USING GIST (geom);
CREATE INDEX idx_edges_geom ON edges USING GIST (geom);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_nodes_scenario ON nodes(scenario);
CREATE INDEX idx_edges_scenario ON edges(scenario);

CREATE TABLE experiments (
  id BIGSERIAL PRIMARY KEY,
  scenario VARCHAR(50) NOT NULL DEFAULT 'padrao',
  algorithm VARCHAR(30) NOT NULL,
  source_id INTEGER REFERENCES nodes(id),
  target_id INTEGER REFERENCES nodes(id),
  distance_km DOUBLE PRECISION,
  travel_time_min DOUBLE PRECISION,
  cost_brl DOUBLE PRECISION,
  execution_ms DOUBLE PRECISION,
  path_nodes INTEGER[],
  reachable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_experiments_scenario_algorithm
  ON experiments(scenario, algorithm);
