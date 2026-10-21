import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: [
    "pdfjs-dist",
    "@napi-rs/canvas",
    "onnxruntime-node",
    "ppu-paddle-ocr",
    "ollama",
    "langchain",
    "@langchain/core",
    "@langchain/openai",
    "@langchain/ollama",
    "@langchain/textsplitters",
    "sharp",
  ],
};

export default nextConfig;
