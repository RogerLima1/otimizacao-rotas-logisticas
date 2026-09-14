INSERT INTO nodes (name,node_type,latitude,longitude,geom) VALUES
('Centro Logístico','origem',-28.6786,-49.3696,ST_SetSRID(ST_MakePoint(-49.3696,-28.6786),4326)::geography),
('Ponto A','intermediario',-28.6705,-49.3550,ST_SetSRID(ST_MakePoint(-49.3550,-28.6705),4326)::geography),
('Ponto B','intermediario',-28.6880,-49.3500,ST_SetSRID(ST_MakePoint(-49.3500,-28.6880),4326)::geography),
('Ponto C','intermediario',-28.6610,-49.3430,ST_SetSRID(ST_MakePoint(-49.3430,-28.6610),4326)::geography),
('Ponto D','intermediario',-28.7000,-49.3420,ST_SetSRID(ST_MakePoint(-49.3420,-28.7000),4326)::geography),
('Ponto E','intermediario',-28.6700,-49.3280,ST_SetSRID(ST_MakePoint(-49.3280,-28.6700),4326)::geography),
('Ponto F','intermediario',-28.6910,-49.3220,ST_SetSRID(ST_MakePoint(-49.3220,-28.6910),4326)::geography),
('Destino Norte','destino',-28.6500,-49.3150,ST_SetSRID(ST_MakePoint(-49.3150,-28.6500),4326)::geography),
('Destino Sul','destino',-28.7160,-49.3180,ST_SetSRID(ST_MakePoint(-49.3180,-28.7160),4326)::geography),
('Ponto G','intermediario',-28.6530,-49.3340,ST_SetSRID(ST_MakePoint(-49.3340,-28.6530),4326)::geography),
('Ponto H','intermediario',-28.7050,-49.3600,ST_SetSRID(ST_MakePoint(-49.3600,-28.7050),4326)::geography),
('Ponto I','intermediario',-28.6820,-49.3100,ST_SetSRID(ST_MakePoint(-49.3100,-28.6820),4326)::geography);


DO $$
DECLARE r RECORD; d DOUBLE PRECISION; t DOUBLE PRECISION; c DOUBLE PRECISION;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    (1,2),(1,3),(1,11),(2,3),(2,4),(2,10),(3,5),(3,11),(4,6),(4,10),(4,8),(5,7),(5,9),(6,7),(6,8),(7,8),(7,9),(7,12),(10,8),(11,5),(11,9),(12,8),(12,7)
  ) AS x(a,b) LOOP
    SELECT ST_Distance(n1.geom,n2.geom)/1000.0 INTO d FROM nodes n1,nodes n2 WHERE n1.id=r.a AND n2.id=r.b;
    t := d / 45.0 * 60.0;
    c := d * 3.9826;
    INSERT INTO edges(source_id,target_id,distance_km,travel_time_min,cost_brl,road_type,geom)
    SELECT r.a,r.b,d,t,c,'simulada',ST_MakeLine(n1.geom::geometry,n2.geom::geometry)::geography
    FROM nodes n1,nodes n2 WHERE n1.id=r.a AND n2.id=r.b;
    INSERT INTO edges(source_id,target_id,distance_km,travel_time_min,cost_brl,road_type,geom)
    SELECT r.b,r.a,d,t,c,'simulada',ST_MakeLine(n2.geom::geometry,n1.geom::geometry)::geography
    FROM nodes n1,nodes n2 WHERE n1.id=r.a AND n2.id=r.b;
  END LOOP;
END $$;
