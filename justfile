# Show all available recipes.
default:
    @just --list --list-submodules

mod db
mod worker

# Build all Docker Compose services.
build:
    docker compose build
alias b := build

# Start the full stack in the background, rebuilding images first.
up:
    docker compose up -d --build
alias u := up

# Stop the stack without deleting volumes.
down:
    docker compose down
alias d := down

# Stop the stack and delete volumes for a clean local database reset.
reset:
    docker compose down -v
alias r := reset

# Show Docker Compose service status.
ps:
    docker compose ps
alias p := ps

# Follow logs for all services, or pass one service: just logs backend.
logs service="":
    @if [ -n "{{service}}" ]; then docker compose logs -f "{{service}}"; else docker compose logs -f; fi
alias l := logs

# Check backend root and API health endpoints.
health:
    curl -fsS http://localhost:8000/health
    curl -fsS http://localhost:8000/api/v1/health
alias h := health

# Seed the Chainlink feed registry used by the worker.
seed-chainlink:
    docker compose exec backend uv run python -m scripts.seed_chainlink_feeds
alias seed := seed-chainlink

# Smoke test representative backend API endpoints.
smoke:
    curl -fsS 'http://localhost:8000/health'
    curl -fsS 'http://localhost:8000/api/v1/markets?limit=5'
    curl -fsS 'http://localhost:8000/api/v1/dashboard/summary'
    curl -fsS 'http://localhost:8000/api/v1/ecosystem/kpis'
    curl -fsS 'http://localhost:8000/api/v1/signals?limit=5'
alias s := smoke

# Open an interactive shell in the backend container.
shell:
    docker compose exec backend sh
alias sh := shell

# Run backend Ruff linting locally through uv.
lint-backend:
    cd backend && uv run ruff check .
alias lb := lint-backend

# Run frontend linting locally.
lint-frontend:
    cd frontend/app && npm run lint
alias lf := lint-frontend

# Build the frontend locally.
build-frontend:
    cd frontend/app && npm run build
alias bf := build-frontend

# Run the core local verification checks.
check: lint-backend lint-frontend build-frontend
alias c := check
