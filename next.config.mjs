import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root; a stray /root/package-lock.json otherwise confuses
  // Next's root inference.
  outputFileTracingRoot: import.meta.dirname,
  // sharp and the ONNX-backed background remover are heavy native/CJS deps;
  // keep them out of the bundler and load them at runtime on the Node server.
  serverExternalPackages: ["sharp", "@imgly/background-removal-node", "@prisma/client"],
  // Resolve the "@/*" alias explicitly — the tsconfig-paths pickup is flaky
  // under the installed TypeScript toolchain.
  webpack: (config) => {
    config.resolve.alias["@"] = path.join(import.meta.dirname, "src");
    return config;
  },
};

export default nextConfig;
