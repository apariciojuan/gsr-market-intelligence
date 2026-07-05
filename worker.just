# Show all worker module recipes.
default:
    @just --list worker

# Follow worker logs.
logs:
    docker compose logs -f worker
alias l := logs

# Run the Chainlink signal collector once.
signals:
    docker compose exec worker uv run python -m scripts.run_worker_once signals
alias s := signals

# Run the Polymarket market ingestor once.
markets:
    docker compose exec worker uv run python -m scripts.run_worker_once markets
alias m := markets

# Run the market price-history collector once.
prices:
    docker compose exec worker uv run python -m scripts.run_worker_once prices
alias p := prices

# Run the ecosystem metric aggregator once.
ecosystem:
    docker compose exec worker uv run python -m scripts.run_worker_once ecosystem
alias e := ecosystem

# Run the divergence calculator once.
divergences:
    docker compose exec worker uv run python -m scripts.run_worker_once divergences
alias d := divergences

# Run all worker pipelines once in dependency order.
all:
    docker compose exec worker uv run python -m scripts.run_worker_once all
alias a := all
