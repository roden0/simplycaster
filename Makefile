.PHONY: run build types test check client clean measure

# Build everything and start the Coordinator on http://127.0.0.1:3000
run: build
	cd coordinator && cargo run --release

build: types client
	cd coordinator && cargo build --release

# Regenerate client/src/protocol/ from the Rust message types (ts-rs exports on test)
types:
	cd coordinator && cargo test --quiet

client: client/node_modules
	cd client && npm run build

client/node_modules: client/package.json
	cd client && npm install
	touch $@

test: types client/node_modules
	cd client && npm test
	node --test tools/*.test.ts

# Everything CI requires before merging: tests, formatting, lint, client types and committed protocol types
check: test
	cd coordinator && cargo fmt --check
	cd coordinator && cargo clippy --all-targets --quiet -- -D warnings
	cd client && npx tsc --noEmit
	git diff --exit-code client/src/protocol/

clean:
	cd coordinator && cargo clean
	rm -rf client/dist client/node_modules

# UP2: sync error and clock drift of a Take, e.g. make measure ROOM=coordinator/data/prueba-sync_2026-11-05 TAKE=1
measure:
	node tools/measure-sync.ts $(ROOM) $(TAKE)
