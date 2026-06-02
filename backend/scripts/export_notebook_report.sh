#!/bin/sh
# Export polymarket_ontology_analysis.ipynb to HTML and optionally PDF.
# Does NOT call Polymarket/Etherscan APIs — only reads parquet + executes notebook cells.
set -e

cd "$(dirname "$0")/.."
MANIFEST="data/datasets/ontology/manifest.json"
NOTEBOOK="notebooks/polymarket_ontology_analysis.ipynb"
OUT_DIR="notebooks/output"

if [ ! -f "$MANIFEST" ]; then
  echo "Missing $MANIFEST"
  echo "Run first: uv run python scripts/extract_market_datasets.py --output-dir data/datasets/ontology"
  exit 1
fi

mkdir -p "$OUT_DIR"

echo ">> Executing notebook (reads parquet only, no live APIs)..."
uv run jupyter execute "$NOTEBOOK" --inplace

echo ">> Exporting HTML..."
uv run jupyter nbconvert --to html "$NOTEBOOK" --output-dir "$OUT_DIR"

if uv run python -c "import playwright" 2>/dev/null; then
  echo ">> Exporting PDF (webpdf / Chromium)..."
  uv run jupyter nbconvert --to webpdf "$NOTEBOOK" --output-dir "$OUT_DIR"
  echo "Done: $OUT_DIR/polymarket_ontology_analysis.pdf"
else
  echo ""
  echo "PDF directo no generado (falta Playwright)."
  echo "Opciones:"
  echo "  1) uv sync --extra report && uv run playwright install chromium"
  echo "     luego vuelve a ejecutar este script"
  echo "  2) Abre $OUT_DIR/polymarket_ontology_analysis.html en el navegador → Imprimir → Guardar como PDF"
fi

echo "HTML: $OUT_DIR/polymarket_ontology_analysis.html"
