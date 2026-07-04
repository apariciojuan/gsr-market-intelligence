# Show all database module recipes.
default:
    @just --list db

# Show migration version, installed extensions, and key table counts.
check:
    docker compose exec db psql -U userdb -d postgresdb -c "select version_num as alembic_version from alembic_version;"
    docker compose exec db psql -U userdb -d postgresdb -c "select extname, extversion from pg_extension where extname in ('timescaledb', 'vector', 'pgcrypto') order by extname;"
    docker compose exec db psql -U userdb -d postgresdb -c "select 'chainlink_feeds' as table_name, count(*) from chainlink_feeds union all select 'chainlink_prices', count(*) from chainlink_prices union all select 'markets', count(*) from markets union all select 'price_history', count(*) from price_history union all select 'divergences', count(*) from divergences;"
alias c := check

# Show the seeded Chainlink feed registry.
feeds:
    docker compose exec db psql -U userdb -d postgresdb -c "select asset_pair, feed_address, heartbeat_seconds, active from chainlink_feeds order by asset_pair;"
alias f := feeds

# Show recent stored Chainlink price readings.
prices:
    docker compose exec db psql -U userdb -d postgresdb -c "select f.asset_pair, p.time, p.answer_usd, p.block_number from chainlink_prices p join chainlink_feeds f on f.id = p.feed_id order by p.time desc limit 10;"
alias p := prices

# Open an interactive psql session in the database container.
shell:
    docker compose exec db psql -U userdb -d postgresdb
alias sh := shell
