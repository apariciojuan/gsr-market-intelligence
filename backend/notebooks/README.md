# Notebooks de investigación

## Principio: extract-once → analyze-many

| Fase | ¿Llama APIs? | Herramienta |
|------|----------------|-------------|
| Extracción de datos | **Sí** (una vez) | `scripts/extract_market_datasets.py` |
| Notebook de análisis | **No** | `polymarket_deep_insights.ipynb` |
| Exportar informe (HTML/PDF) | **No** | `scripts/export_notebook_report.sh` |

El notebook principal lee `backend/data/datasets/ontology/` y la capa curada `backend/data/datasets/curated/`. Si el manifest indica `quality_passed: true`, el snapshot tiene joins UMA y series Chainlink alineadas suficientes para el análisis.

---

## 1. Extraer el dataset (única fase con APIs)

Desde la raíz del repo, con Docker:

```bash
docker compose run --rm --no-deps backend \
  uv run python scripts/extract_market_datasets.py \
  --output-dir data/datasets/ontology --sample-size 120
```

Si `chainlink_series` queda por debajo del umbral tras la extracción completa:

```bash
docker compose run --rm --no-deps backend \
  uv run python scripts/backfill_chainlink_series.py
```

Validar calidad:

```bash
docker compose run --rm --no-deps backend \
  uv run python scripts/validate_dataset_manifest.py
```

Construir dataset curado para análisis temporal:

```bash
docker compose run --rm --no-deps backend \
  uv run python scripts/build_curated_analysis_dataset.py
```

Opcional: snapshot de tablas core en PostgreSQL (`markets`, `price_history`, `chainlink_prices`, `divergences`, `external_signals`, `ecosystem_metrics`):

```bash
docker compose run --rm --no-deps backend \
  uv run python scripts/export_core_tables_snapshot.py
```

Salida:

```
backend/data/datasets/ontology/
  manifest.json
  markets.parquet
  price_series.parquet
  market_resolution_links.parquet
  chainlink_series.parquet
  …

backend/data/datasets/curated/
  manifest.json
  market_hourly_features.parquet
  market_summary.parquet
```

Variables en `backend/.env`:

- Polymarket (Gamma / CLOB / Data): sin clave.
- `ETHERSCAN_API_KEY`: necesaria para UMA y Chainlink on-chain.

El script falla con código de salida 1 si no se cumplen los umbrales de calidad (`quality_passed: false` en el manifest).
Se endurecieron quality gates para evitar snapshots con cobertura insuficiente en `price_series`, `chainlink_series`, `wallet_activity` o `external_signals`.

---

## 2. Ejecutar el notebook sin llamar a la API

### Requisito previo

```bash
test -f backend/data/datasets/ontology/manifest.json && echo OK
```

### Opción A — JupyterLab

```bash
docker compose run --rm -p 8888:8888 --no-deps backend \
  uv run jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root
```

Abre `notebooks/polymarket_deep_insights.ipynb` y ejecuta las celdas en orden.

### Opción B — Ejecutar todo desde terminal

```bash
docker compose run --rm --no-deps backend \
  uv run jupyter execute notebooks/polymarket_deep_insights.ipynb --inplace
```

### Sin Docker

```bash
cd backend
uv run jupyter execute notebooks/polymarket_deep_insights.ipynb --inplace
```

---

## 3. Exportar informe

```bash
docker compose run --rm --no-deps backend \
  sh scripts/export_notebook_report.sh notebooks/polymarket_deep_insights.ipynb
```

Genera `backend/notebooks/output/polymarket_deep_insights.html`.

---

## 4. Contenido del cuaderno

[`polymarket_deep_insights.ipynb`](polymarket_deep_insights.ipynb) se **edita y amplía a mano** en Jupyter. No hay script que regenere el cuaderno entero; solo lectura de `data/datasets/ontology/`, `data/datasets/curated/` y celdas de interpretación que se refinan con los números impresos al ejecutar.

Audita cobertura del snapshot, enlaces UMA, microestructura por cohorte, relación entre señales externas y retornos por lag, estudio de eventos y benchmark temporal contra baseline. Las conclusiones citan cifras de las celdas ejecutadas.

### Estructura de capítulos (numeración jerárquica)

| Capítulo | Tema |
|----------|------|
| 1 | Limpieza y calidad de tablas (1.1 código, 1.2 lectura por capa) |
| 2 | Inventario de cobertura por mercado |
| 3 | UMA y Gamma en la muestra |
| 4 | Microestructura y cohortes |
| 5 | Análisis de lags entre señales y volatilidad |
| 6 | Event study de shocks de señales |
| 7 | Benchmark temporal: baseline vs regresión lineal |
| 8 | Conclusiones (hallazgos y acciones) |

Para estadísticas rápidas del manifest sin abrir el notebook: `uv run python scripts/generate_ontology_notebook.py`.

---

## 5. Archivo legacy

[`polymarket_ontology_analysis.ipynb`](polymarket_ontology_analysis.ipynb) y [`polymarket_insights_exploration.ipynb`](polymarket_insights_exploration.ipynb) quedan como histórico/referencia.
