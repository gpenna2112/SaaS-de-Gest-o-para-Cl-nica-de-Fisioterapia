import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Este worktree tem seu próprio package-lock.json, mas o worktree principal
  // do repo (diretório pai) também tem um — sem isso, o Next infere a raiz
  // errada (a do worktree principal) e para de encontrar arquivos que
  // dependem da raiz correta, como middleware.ts.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
