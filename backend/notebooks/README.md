# Notebooks de investigación

## Principio: extract-once → analyze-many

| Fase | ¿Llama APIs? | Herramienta |
|------|----------------|-------------|
| Extracción de datos | **Sí** (una vez) | `scripts/extract_market_datasets.py` |
| Notebook de análisis | **No** | `polymarket_ontology_analysis.ipynb` |
| Exportar informe (HTML/PDF) | **No** | `scripts/export_notebook_report.sh` |

El notebook **solo lee** ficheros en `backend/data/datasets/ontology/` (`*.parquet` + `manifest.json`). Si el manifest indica `quality_passed: true`, el snapshot tiene joins UMA y series Chainlink alineadas suficientes para el análisis.

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

Salida:

```
backend/data/datasets/ontology/
  manifest.json
  markets.parquet
  price_series.parquet
  market_resolution_links.parquet
  chainlink_series.parquet
  …
```

Variables en `backend/.env`:

- Polymarket (Gamma / CLOB / Data): sin clave.
- `ETHERSCAN_API_KEY`: necesaria para UMA y Chainlink on-chain.

El script falla con código de salida 1 si no se cumplen los umbrales de calidad (`quality_passed: false` en el manifest).

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

Abre `notebooks/polymarket_ontology_analysis.ipynb` y ejecuta las celdas en orden.

### Opción B — Ejecutar todo desde terminal

```bash
docker compose run --rm --no-deps backend \
  uv run jupyter execute notebooks/polymarket_ontology_analysis.ipynb --inplace
```

### Sin Docker

```bash
cd backend
uv run jupyter execute notebooks/polymarket_ontology_analysis.ipynb --inplace
```

---

## 3. Exportar informe

```bash
docker compose run --rm --no-deps backend \
  sh scripts/export_notebook_report.sh
```

Genera `backend/notebooks/output/polymarket_ontology_analysis.html`.

---

## 4. Contenido del cuaderno

[`polymarket_ontology_analysis.ipynb`](polymarket_ontology_analysis.ipynb) se **edita y amplía a mano** en Jupyter. No hay script que regenere el cuaderno entero; solo lectura de `data/datasets/ontology/` y celdas de interpretación que se refinan con los números impresos al ejecutar.

Audita cobertura del snapshot, enlaces UMA, microestructura por cohorte, replay offline de detectores de divergencia, concentración de wallets y un experimento de baselines vs MLP. Las conclusiones citan cifras de las celdas ejecutadas.

### Estructura de capítulos (numeración jerárquica)

| Capítulo | Tema |
|----------|------|
| 1 | Limpieza y calidad de tablas (1.1 código, 1.2 lectura por capa) |
| 2 | Inventario de cobertura por mercado |
| 3 | UMA y Gamma en la muestra |
| 4 | Microestructura y cohortes |
| 5 | Catálogo de reglas R1–R7 (5.1 evaluación, 5.2 utilidad en producto) |
| 6 | Concentración de participación (Data API) |
| 7 | Experimento predictivo: baselines vs MLP |
| 8 | Conclusiones (8.1 hallazgos, 8.2 acciones) |

Para estadísticas rápidas del manifest sin abrir el notebook: `uv run python scripts/generate_ontology_notebook.py`.

---

## 5. Archivo legacy

[`polymarket_insights_exploration.ipynb`](polymarket_insights_exploration.ipynb) — borrador inicial; sustituido por este flujo.
