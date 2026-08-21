-- =============================================================================
--  Diagnóstico de filas fantasma - Conciliación Manifiestos
--
--  Desde el código no se puede distinguir estas dos cosas, y llevan a arreglos
--  opuestos:
--
--    (a) siguen creándose fantasmas AHORA, y queda un camino sin cerrar;
--    (b) las que se ven son viejas, de antes de los arreglos, y lo único que
--        falta es retirarlas.
--
--  Estas consultas lo deciden con datos. Ninguna modifica nada.
--
--  La idea: cada camino que podía crear una fila vacía dejaba una huella
--  distinta de columnas rellenas. Sabiendo qué columnas trae un fantasma se
--  sabe por dónde entró.
--
--  Ejecutar en: Supabase -> SQL Editor -> Run
--
--  EMPIEZA POR LA CONSULTA 0. Devuelve las cuatro respuestas en un solo
--  resultado, que es lo que hace falta para el veredicto. Las consultas 1 a 4
--  de más abajo son las mismas por separado, para cuando quieras entrar en
--  detalle en una.
--
--  (El editor de Supabase muestra solo el resultado de la ÚLTIMA sentencia que
--  ejecutas, así que seleccionar el archivo entero y darle a Run enseñaría solo
--  la consulta 4. Selecciona el bloque que quieras correr, o usa la 0.)
-- =============================================================================


-- ─── Consulta 0: todo en uno ────────────────────────────────────────────────
--
-- Selecciona desde el WITH de aquí abajo hasta el punto y coma y dale a Run.

WITH marcadas AS (
    SELECT t.id,
           t."FECHA"             AS fecha,
           t."MES"               AS mes,
           t."CAPTURÓ"           AS capturo,
           t."ESTATUS MATRÍCULA" AS estatus,
           t.movement_key        AS movkey,
           count(*) FILTER (
               WHERE kv.key NOT IN (
                         'id', 'FECHA', 'MES', 'CAPTURÓ',
                         'ESTATUS MATRÍCULA', 'movement_key',
                         'created_at', 'updated_at'
                     )
                 AND kv.value IS NOT NULL
                 AND btrim(kv.value) <> ''
           ) AS campos
      FROM public."Conciliación Manifiestos" t
      CROSS JOIN LATERAL jsonb_each_text(to_jsonb(t)) AS kv(key, value)
     GROUP BY t.id, t."FECHA", t."MES", t."CAPTURÓ",
              t."ESTATUS MATRÍCULA", t.movement_key
),
fantasmas AS (SELECT * FROM marcadas WHERE campos = 0),
reales    AS (SELECT * FROM marcadas WHERE campos > 0),
duplicados AS (
    SELECT count(*) AS grupos, COALESCE(sum(veces - 1), 0) AS sobrantes
      FROM (
        SELECT count(*) AS veces
          FROM public."Conciliación Manifiestos"
         WHERE "# DE VUELO" IS NOT NULL
         GROUP BY "FECHA", "# DE VUELO", "TIPO DE MANIFIESTO", "AEROLINEA"
        HAVING count(*) > 1
      ) g
)
SELECT * FROM (
    SELECT 1 AS orden, 0 AS sub,
           '1. VEREDICTO' AS bloque,
           'Filas fantasma' AS detalle,
           (SELECT count(*)::text FROM fantasmas) AS valor
    UNION ALL
    SELECT 1, 1, '1. VEREDICTO', 'Total de filas',
           (SELECT count(*)::text FROM marcadas)
    UNION ALL
    SELECT 1, 2, '1. VEREDICTO', 'Ultimo id fantasma',
           COALESCE((SELECT max(id)::text FROM fantasmas), '(ninguno)')
    UNION ALL
    SELECT 1, 3, '1. VEREDICTO', 'Ultimo id con captura real',
           COALESCE((SELECT max(id)::text FROM reales), '(ninguno)')
    UNION ALL
    SELECT 1, 4, '1. VEREDICTO', '>>> CONCLUSION',
           CASE
               WHEN (SELECT count(*) FROM fantasmas) = 0
                   THEN 'No hay filas fantasma.'
               WHEN (SELECT max(id) FROM fantasmas)
                    > (SELECT COALESCE(max(id), 0) FROM reales)
                   THEN 'SE SIGUEN CREANDO: hay fantasmas posteriores a la ultima captura real.'
               ELSE 'SON ANTIGUAS: ningun fantasma es posterior a la ultima captura real.'
           END

    UNION ALL
    SELECT 2, 0, '2. HUELLA',
           NULLIF(
               CASE WHEN fecha   IS NOT NULL AND btrim(fecha::text)   <> '' THEN 'FECHA '   ELSE '' END ||
               CASE WHEN mes     IS NOT NULL AND btrim(mes::text)     <> '' THEN 'MES '     ELSE '' END ||
               CASE WHEN capturo IS NOT NULL AND btrim(capturo::text) <> '' THEN 'CAPTURO ' ELSE '' END ||
               CASE WHEN estatus IS NOT NULL AND btrim(estatus::text) <> '' THEN 'ESTATUS ' ELSE '' END ||
               CASE WHEN movkey  IS NOT NULL AND btrim(movkey::text)  <> '' THEN 'MOVKEY '  ELSE '' END,
               ''
           ),
           count(*)::text || ' filas (id ' || min(id)::text || '-' || max(id)::text || ')'
      FROM fantasmas
     GROUP BY 4

    UNION ALL
    SELECT 3, 0, '3. CAPTURISTA',
           COALESCE(NULLIF(btrim(capturo::text), ''), '(sin capturista)'),
           count(*)::text || ' filas'
      FROM fantasmas
     GROUP BY 4

    UNION ALL
    SELECT 4, 0, '4. DUPLICADOS', 'Grupos de captura repetida',
           (SELECT grupos::text FROM duplicados)
    UNION ALL
    SELECT 4, 1, '4. DUPLICADOS', 'Filas sobrantes por repeticion',
           (SELECT sobrantes::text FROM duplicados)
) r
ORDER BY orden, sub, detalle;


-- ─── Consulta 1: ¿se siguen creando, o son viejas? ──────────────────────────
--
-- Los id son de una secuencia: crecen con el tiempo. Si los fantasmas están
-- todos por debajo de las capturas buenas más recientes, son de antes y ya no
-- se generan. Si hay fantasmas con id POR ENCIMA del id de la última captura
-- buena, se están creando ahora y queda un camino abierto.

WITH marcadas AS (
    SELECT t.id,
           count(*) FILTER (
               WHERE kv.key NOT IN (
                         'id', 'FECHA', 'MES', 'CAPTURÓ',
                         'ESTATUS MATRÍCULA', 'movement_key',
                         'created_at', 'updated_at'
                     )
                 AND kv.value IS NOT NULL
                 AND btrim(kv.value) <> ''
           ) AS campos_con_dato
      FROM public."Conciliación Manifiestos" t
      CROSS JOIN LATERAL jsonb_each_text(to_jsonb(t)) AS kv(key, value)
     GROUP BY t.id
)
SELECT
    (SELECT count(*)  FROM marcadas WHERE campos_con_dato = 0)  AS fantasmas,
    (SELECT max(id)   FROM marcadas WHERE campos_con_dato = 0)  AS ultimo_fantasma,
    (SELECT max(id)   FROM marcadas WHERE campos_con_dato > 0)  AS ultima_captura_buena,
    CASE
        WHEN (SELECT max(id) FROM marcadas WHERE campos_con_dato = 0) IS NULL
            THEN 'No hay fantasmas.'
        WHEN (SELECT max(id) FROM marcadas WHERE campos_con_dato = 0)
             > (SELECT COALESCE(max(id), 0) FROM marcadas WHERE campos_con_dato > 0)
            THEN 'SE SIGUEN CREANDO: hay fantasmas mas nuevos que la ultima captura real.'
        ELSE 'Son antiguas: ningun fantasma es posterior a la ultima captura real.'
    END AS veredicto;


-- ─── Consulta 2: la huella — por dónde entró cada fantasma ──────────────────
--
-- Cómo leer el resultado:
--
--   solo FECHA
--       Entró heredando la fecha del filtro y nada más.
--
--   FECHA + CAPTURÓ
--       Entró por el autocompletado del capturista: la fila se dio por "con
--       datos" porque el sistema le puso el nombre de quien estaba en sesión.
--
--   FECHA + ESTATUS MATRÍCULA
--       Entró cuando a la fila recién creada se le pintaba "NO IDENTIFICADA"
--       sola. Ese pintado ya se quitó para filas nuevas sin matrícula.
--
--   movement_key relleno
--       Pasó por la recuperación de conflicto de movimiento, no por un alta
--       normal. Ése es otro camino y se mira aparte.
--
--   MES relleno pero nada más
--       Vino de un alta que sí calculó el mes: no es el alta desde la tabla.

WITH marcadas AS (
    SELECT t.id,
           t."FECHA"              AS fecha,
           t."MES"                AS mes,
           t."CAPTURÓ"            AS capturo,
           t."ESTATUS MATRÍCULA"  AS estatus_matricula,
           t.movement_key,
           count(*) FILTER (
               WHERE kv.key NOT IN (
                         'id', 'FECHA', 'MES', 'CAPTURÓ',
                         'ESTATUS MATRÍCULA', 'movement_key',
                         'created_at', 'updated_at'
                     )
                 AND kv.value IS NOT NULL
                 AND btrim(kv.value) <> ''
           ) AS campos_con_dato
      FROM public."Conciliación Manifiestos" t
      CROSS JOIN LATERAL jsonb_each_text(to_jsonb(t)) AS kv(key, value)
     GROUP BY t.id, t."FECHA", t."MES", t."CAPTURÓ",
              t."ESTATUS MATRÍCULA", t.movement_key
)
SELECT
    CASE WHEN fecha             IS NOT NULL AND btrim(fecha::text)             <> '' THEN 'FECHA '   ELSE '' END ||
    CASE WHEN mes               IS NOT NULL AND btrim(mes::text)               <> '' THEN 'MES '     ELSE '' END ||
    CASE WHEN capturo           IS NOT NULL AND btrim(capturo::text)           <> '' THEN 'CAPTURÓ ' ELSE '' END ||
    CASE WHEN estatus_matricula IS NOT NULL AND btrim(estatus_matricula::text) <> '' THEN 'ESTATUS ' ELSE '' END ||
    CASE WHEN movement_key      IS NOT NULL AND btrim(movement_key::text)      <> '' THEN 'MOVKEY '  ELSE '' END
        AS huella,
    count(*) AS cuantas,
    min(id)  AS id_menor,
    max(id)  AS id_mayor
  FROM marcadas
 WHERE campos_con_dato = 0
 GROUP BY 1
 ORDER BY cuantas DESC;


-- ─── Consulta 3: quién las creó ─────────────────────────────────────────────
--
-- Si la columna CAPTURÓ viene rellena, dice desde qué sesión se generaron. Un
-- solo nombre concentrando casi todas apunta a un flujo concreto (una persona,
-- un equipo, una forma de trabajar) y no a un fallo general.

WITH marcadas AS (
    SELECT t.id,
           t."CAPTURÓ" AS capturo,
           count(*) FILTER (
               WHERE kv.key NOT IN (
                         'id', 'FECHA', 'MES', 'CAPTURÓ',
                         'ESTATUS MATRÍCULA', 'movement_key',
                         'created_at', 'updated_at'
                     )
                 AND kv.value IS NOT NULL
                 AND btrim(kv.value) <> ''
           ) AS campos_con_dato
      FROM public."Conciliación Manifiestos" t
      CROSS JOIN LATERAL jsonb_each_text(to_jsonb(t)) AS kv(key, value)
     GROUP BY t.id, t."CAPTURÓ"
)
SELECT COALESCE(NULLIF(btrim(capturo), ''), '(sin capturista)') AS capturista,
       count(*) AS fantasmas,
       min(id)  AS id_menor,
       max(id)  AS id_mayor
  FROM marcadas
 WHERE campos_con_dato = 0
 GROUP BY 1
 ORDER BY fantasmas DESC;


-- ─── Consulta 4: ¿hay duplicados de una misma captura? ──────────────────────
--
-- Otro síntoma que se ve como "filas que no deberían crearse": la MISMA captura
-- insertada varias veces. Pasa cuando un alta responde sin devolver el id: la
-- fila se queda en pantalla creyendo que aún no existe y el siguiente guardado
-- la vuelve a insertar.
--
-- Si esta consulta devuelve algo, el problema NO son filas vacías sino altas
-- repetidas, y se arregla en otro sitio.

SELECT "FECHA", "# DE VUELO", "TIPO DE MANIFIESTO", "AEROLINEA",
       count(*)                  AS veces,
       array_agg(id ORDER BY id) AS ids
  FROM public."Conciliación Manifiestos"
 WHERE "# DE VUELO" IS NOT NULL
 GROUP BY "FECHA", "# DE VUELO", "TIPO DE MANIFIESTO", "AEROLINEA"
HAVING count(*) > 1
 ORDER BY veces DESC, "FECHA"
 LIMIT 100;
