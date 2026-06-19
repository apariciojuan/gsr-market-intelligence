FROM postgres:17

# Pin the exact PGDG package versions to avoid extension/volume version drift on
# rebuild. An unpinned upgrade breaks an existing data volume initialized with an
# older extension (Postgres then fails every query with
# "could not access file $libdir/timescaledb-<old>"). These versions match the
# version the data volume was initialized with. If a rebuild fails because PGDG
# rotated a version out of the repo, bump the pin to the new available version
# (check with: docker run --rm postgres:17 bash -c "apt-get update -qq && apt-cache policy postgresql-17-timescaledb")
# AND recreate the data volume (or run ALTER EXTENSION ... UPDATE).
RUN apt-get update && apt-get install -y \
    postgresql-17-pgvector=0.8.2-1.pgdg13+1 \
    postgresql-17-timescaledb=2.27.2+dfsg-1.pgdg13+1 \
    && rm -rf /var/lib/apt/lists/*
