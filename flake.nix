{
  description = "Generic event-driven collaborative canvas runtime";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    rust-overlay.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, rust-overlay }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ rust-overlay.overlays.default ];
          };
          rustToolchain = pkgs.rust-bin.stable.latest.default.override {
            targets = [ "wasm32-unknown-unknown" ];
          };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              binaryen
              nodejs_24
              pnpm
              rustToolchain
              wasm-bindgen-cli
              wasm-pack
            ];

            shellHook = ''
              export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER=rust-lld
              echo "canvas-engine dev shell: node $(node --version), pnpm $(pnpm --version), rustc $(rustc --version)"
            '';
          };
        });
    };
}
