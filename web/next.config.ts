import type { NextConfig } from "next";

// Site statique publié sur GitHub Pages, à l'adresse https://<compte>.github.io/<dépôt>/ :
// BASE_PATH (« /<dépôt> ») est fourni par la tâche GitHub Actions, vide en local.
// Tout est calculé à la construction : les pages lisent les fichiers du moteur, rien ne tourne côté serveur.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
