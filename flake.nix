{
  description = "OpenBeam dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, rust-overlay }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ rust-overlay.overlays.default ];
      };

      rustToolchain = pkgs.rust-bin.stable.latest.default.override {
        extensions = [ "rust-src" "clippy" "rustfmt" ];
      };

      # --- Build script: compile + bundle, then serve ---

      buildScript = pkgs.writeShellScriptBin "build" ''
        set -euo pipefail
        PROJECT_ROOT="''${PROJECT_ROOT:-$PWD}"

        echo "── Building API server (release) ──"
        (cd "$PROJECT_ROOT/apps/server" && cargo build --release)
        echo "  ✓ apps/server/target/release/openbeam-server"

        echo ""
        echo "── Building web frontend ──"
        (cd "$PROJECT_ROOT/apps/web" && pnpm install --frozen-lockfile && pnpm build)
        echo "  ✓ apps/web/build/"

        echo ""
        echo "✅ Build complete"
      '';

      startScript = pkgs.writeShellScriptBin "start" ''
        set -euo pipefail
        DEV_DIR="''${OPENBEAM_DEV_DIR:-.dev}"
        PROJECT_ROOT="''${PROJECT_ROOT:-$PWD}"

        API_PID="$DEV_DIR/api.pid"
        API_LOG="$DEV_DIR/api.log"
        WEB_PID="$DEV_DIR/web.pid"
        WEB_LOG="$DEV_DIR/web.log"
        API_BIN="$PROJECT_ROOT/apps/server/target/release/openbeam-server"
        WEB_DIR="$PROJECT_ROOT/apps/web/build"

        mkdir -p "$DEV_DIR"

        # Source env
        if [ -f "$PROJECT_ROOT/.env" ]; then
          set -a; source "$PROJECT_ROOT/.env"; set +a
        fi

        # Check builds exist
        if [ ! -f "$API_BIN" ]; then
          echo "api:  binary not found — run 'build' first"
          exit 1
        fi
        if [ ! -d "$WEB_DIR" ]; then
          echo "web:  build not found — run 'build' first"
          exit 1
        fi

        # ── API Server (release binary on :4001) ──────────────
        if [ -f "$API_PID" ] && kill -0 "$(cat "$API_PID")" 2>/dev/null; then
          echo "api:  already running (pid $(cat "$API_PID"))"
        else
          echo "api:  starting release binary..."
          (cd "$PROJECT_ROOT/apps/server" && PORT=4001 "$API_BIN" >> "$API_LOG" 2>&1) &
          echo $! > "$API_PID"
          for i in $(seq 1 30); do
            if ${pkgs.curl}/bin/curl -sf http://localhost:4001/api/health > /dev/null 2>&1; then
              echo "api:  ready (pid $(cat "$API_PID")) → http://localhost:4001"
              break
            fi
            if [ "$i" = "30" ]; then
              echo "api:  started (pid $(cat "$API_PID")) but health check not responding"
              echo "      check logs: tail -f $API_LOG"
            fi
            sleep 1
          done
        fi

        # ── Web Frontend (static serve on :4000) ──────────────
        if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
          echo "web:  already running (pid $(cat "$WEB_PID"))"
        else
          echo "web:  serving build via vite preview..."
          (cd "$PROJECT_ROOT/apps/web" && npx vite preview --port 4000 --host 0.0.0.0 >> "$WEB_LOG" 2>&1) &
          echo $! > "$WEB_PID"
          for i in $(seq 1 10); do
            if ${pkgs.curl}/bin/curl -sf http://localhost:4000 > /dev/null 2>&1; then
              echo "web:  ready (pid $(cat "$WEB_PID")) → http://localhost:4000"
              break
            fi
            if [ "$i" = "10" ]; then
              echo "web:  started (pid $(cat "$WEB_PID")) but not responding yet"
            fi
            sleep 1
          done
        fi

        echo ""
        echo "  web → http://localhost:4000  (openbeam.tensorkit.net)"
        echo "  api → http://localhost:4001  (openbeam-api.tensorkit.net)"
        echo ""
      '';

      devScript = pkgs.writeShellScriptBin "dev" ''
        set -euo pipefail
        DEV_DIR="''${OPENBEAM_DEV_DIR:-.dev}"
        PROJECT_ROOT="''${PROJECT_ROOT:-$PWD}"

        API_PID="$DEV_DIR/api.pid"
        API_LOG="$DEV_DIR/api.log"
        WEB_PID="$DEV_DIR/web.pid"
        WEB_LOG="$DEV_DIR/web.log"

        mkdir -p "$DEV_DIR"

        if [ -f "$PROJECT_ROOT/.env" ]; then
          set -a; source "$PROJECT_ROOT/.env"; set +a
        fi

        # ── API Server (cargo run on :4001) ────────────────────
        if [ -f "$API_PID" ] && kill -0 "$(cat "$API_PID")" 2>/dev/null; then
          echo "api:  already running (pid $(cat "$API_PID"))"
        else
          echo "api:  building + starting (dev)..."
          (cd "$PROJECT_ROOT/apps/server" && PORT=4001 cargo run >> "$API_LOG" 2>&1) &
          echo $! > "$API_PID"
          for i in $(seq 1 60); do
            if ${pkgs.curl}/bin/curl -sf http://localhost:4001/api/health > /dev/null 2>&1; then
              echo "api:  ready (pid $(cat "$API_PID")) → http://localhost:4001"
              break
            fi
            if [ "$i" = "60" ]; then
              echo "api:  started (pid $(cat "$API_PID")) but health check not responding"
            fi
            sleep 2
          done
        fi

        # ── Web Frontend (vite dev on :4000) ───────────────────
        if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
          echo "web:  already running (pid $(cat "$WEB_PID"))"
        else
          echo "web:  starting vite dev..."
          (cd "$PROJECT_ROOT/apps/web" && pnpm dev --port 4000 >> "$WEB_LOG" 2>&1) &
          echo $! > "$WEB_PID"
          for i in $(seq 1 15); do
            if ${pkgs.curl}/bin/curl -sf http://localhost:4000 > /dev/null 2>&1; then
              echo "web:  ready (pid $(cat "$WEB_PID")) → http://localhost:4000"
              break
            fi
            if [ "$i" = "15" ]; then
              echo "web:  started (pid $(cat "$WEB_PID")) but not responding yet"
            fi
            sleep 1
          done
        fi

        echo ""
        echo "  web → http://localhost:4000  (openbeam.tensorkit.net)"
        echo "  api → http://localhost:4001  (openbeam-api.tensorkit.net)"
        echo ""
      '';

      stopScript = pkgs.writeShellScriptBin "stop" ''
        set -euo pipefail
        DEV_DIR="''${OPENBEAM_DEV_DIR:-.dev}"

        API_PID="$DEV_DIR/api.pid"
        WEB_PID="$DEV_DIR/web.pid"

        stop_service() {
          local label=$1 pidfile=$2
          if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
            echo "$label stopping..."
            kill "$(cat "$pidfile")" 2>/dev/null || true
            for i in $(seq 1 15); do
              kill -0 "$(cat "$pidfile")" 2>/dev/null || break
              sleep 0.2
            done
            kill -0 "$(cat "$pidfile")" 2>/dev/null && kill -9 "$(cat "$pidfile")" 2>/dev/null
            rm -f "$pidfile"
            echo "$label stopped"
          else
            echo "$label not running"
            rm -f "$pidfile"
          fi
        }

        stop_service "web: " "$WEB_PID"
        stop_service "api: " "$API_PID"
      '';

      statusScript = pkgs.writeShellScriptBin "status" ''
        set -euo pipefail
        DEV_DIR="''${OPENBEAM_DEV_DIR:-.dev}"

        API_PID="$DEV_DIR/api.pid"
        WEB_PID="$DEV_DIR/web.pid"

        if [ -f "$API_PID" ] && kill -0 "$(cat "$API_PID")" 2>/dev/null; then
          if ${pkgs.curl}/bin/curl -sf http://localhost:4001/api/health > /dev/null 2>&1; then
            echo "api:  UP (pid $(cat "$API_PID"), healthy)"
          else
            echo "api:  UP (pid $(cat "$API_PID"), NOT healthy)"
          fi
        else
          echo "api:  DOWN"
        fi

        if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
          if ${pkgs.curl}/bin/curl -sf http://localhost:4000 > /dev/null 2>&1; then
            echo "web:  UP (pid $(cat "$WEB_PID"), responding)"
          else
            echo "web:  UP (pid $(cat "$WEB_PID"), NOT responding)"
          fi
        else
          echo "web:  DOWN"
        fi
      '';

      logsScript = pkgs.writeShellScriptBin "logs" ''
        set -euo pipefail
        DEV_DIR="''${OPENBEAM_DEV_DIR:-.dev}"

        case "''${1:-}" in
          "")
            echo "tailing all logs (ctrl-c to stop)..."
            tail -f "$DEV_DIR/api.log" "$DEV_DIR/web.log" 2>/dev/null
            ;;
          api)    tail -f "$DEV_DIR/api.log" ;;
          web)    tail -f "$DEV_DIR/web.log" ;;
          *)
            echo "usage: logs [api|web]"
            exit 1
            ;;
        esac
      '';

    in {
      devShells.${system}.default = pkgs.mkShell {
        name = "openbeam";

        packages = [
          rustToolchain
          pkgs.pkg-config
          pkgs.openssl
          pkgs.nodejs_22
          pkgs.pnpm_10
          pkgs.git
          pkgs.curl
          pkgs.jq
          pkgs.lsof

          buildScript
          startScript
          devScript
          stopScript
          statusScript
          logsScript
        ];

        shellHook = ''
          export OPENBEAM_DEV_DIR="$PWD/.dev"
          export PROJECT_ROOT="$PWD"
          export PORT=4001
          export HOST=0.0.0.0
          export DB_PATH="$PWD/apps/server/data/openbeam.db"
          export RUST_LOG=info,tower_http=debug

          if [ -f "$PWD/.env" ]; then
            set -a
            source "$PWD/.env"
            set +a
          fi

          echo ""
          echo "  openbeam dev shell"
          echo "  api → :4001 (openbeam-api.tensorkit.net)"
          echo "  web → :4000 (openbeam.tensorkit.net)"
          echo ""
          echo "  build   compile server + bundle frontend"
          echo "  start   serve built artifacts (run build first)"
          echo "  dev     run with hot reload (cargo run + vite dev)"
          echo "  stop    shut down services"
          echo "  status  check health"
          echo "  logs    tail service logs"
          echo ""
        '';
      };
    };
}
