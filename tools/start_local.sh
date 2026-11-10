#!/bin/sh
# Isolated persistence for this game. Only local sockets access PostgreSQL.
set -eu
cd "$(dirname "$0")/.."
base="${CHILLCAT_RUNTIME:-$HOME/Library/Application Support/ChillcatWeb}"
umask 077
mkdir -p "$base" "$base/socket"
if [ ! -s "$base/postgres/PG_VERSION" ]; then
  initdb -D "$base/postgres" --auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8 --locale=C >/dev/null
fi
if ! pg_ctl -D "$base/postgres" status >/dev/null 2>&1; then
  pg_ctl -D "$base/postgres" -l "$base/postgres.log" -o "-p 18849 -c listen_addresses='' -c unix_socket_directories='$base/socket'" -w start
fi
# Redis is shared only by Chillcat workers. Its socket path is private to the Mac account.
if ! redis-cli -s "$base/redis.sock" ping 2>/dev/null | grep -q PONG; then
  redis-server --port 0 --unixsocket "$base/redis.sock" --unixsocketperm 700 --dir "$base" --dbfilename rooms.rdb --daemonize yes --pidfile "$base/redis.pid" --logfile "$base/redis.log"
fi
export CHILLCAT_PG=$(node -e "console.log('postgresql:///postgres?port=18849&host='+encodeURIComponent(process.argv[1]))" "$base/socket")
export CHILLCAT_REDIS="$base/redis.sock"
exec node server/start.mjs
