#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${AI_NEWS_PORT:-8765}"
HOST="${AI_NEWS_HOST:-0.0.0.0}"
PID_FILE="$ROOT_DIR/.ai-news-dashboard.pid"
LOG_FILE="$ROOT_DIR/server.log"
URL_HOST="${AI_NEWS_URL_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
URL="http://${URL_HOST:-127.0.0.1}:$PORT"

get_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

start_dashboard() {
  if pid="$(get_pid)"; then
    echo "AI News Dashboard is already running. PID: $pid"
    echo "URL: $URL"
    return 0
  fi

  cd "$ROOT_DIR"
  nohup node "$ROOT_DIR/server.js" > "$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
  sleep 1

  if pid="$(get_pid)"; then
    echo "AI News Dashboard started. PID: $pid"
    echo "URL: $URL"
  else
    echo "Start failed. Check $LOG_FILE"
    return 1
  fi
}

stop_dashboard() {
  if pid="$(get_pid)"; then
    kill "$pid"
    rm -f "$PID_FILE"
    echo "AI News Dashboard stopped. PID: $pid"
  else
    echo "AI News Dashboard is already stopped."
  fi
}

status_dashboard() {
  if pid="$(get_pid)"; then
    echo "AI News Dashboard is running. PID: $pid"
    echo "URL: $URL"
  else
    echo "AI News Dashboard is stopped."
  fi
}

case "${1:-menu}" in
  start)
    start_dashboard
    ;;
  stop)
    stop_dashboard
    ;;
  restart)
    stop_dashboard
    start_dashboard
    ;;
  status)
    status_dashboard
    ;;
  menu)
    while true; do
      echo
      echo "AI News Dashboard Menu"
      echo "1. Start dashboard"
      echo "2. Stop dashboard"
      echo "3. Show status"
      echo "4. Manual update now"
      echo "5. Exit"
      echo
      read -r -p "Enter your selection (1, 2, 3, 4, or 5): " selection

      case "$selection" in
        1) start_dashboard ;;
        2) stop_dashboard ;;
        3) status_dashboard ;;
        4) "$ROOT_DIR/update-with-codex.sh" ;;
        5) echo "Exiting."; exit 0 ;;
        *) echo "Invalid selection. Please enter 1, 2, 3, 4, or 5." ;;
      esac
    done
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|menu}"
    exit 2
    ;;
esac
