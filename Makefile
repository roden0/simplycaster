.PHONY: run build types test client clean

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

clean:
	cd coordinator && cargo clean
	rm -rf client/dist client/node_modules
