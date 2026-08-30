import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    // Ancla la raiz del proyecto a esta carpeta. Sin esto, Turbopack busca
    // hacia arriba y encuentra package-lock.json de otras carpetas, lo que
    // dispara un warning confuso en cada arranque.
    root: __dirname,
  },

  // Next 16 bloquea los archivos de desarrollo si los pedis desde un origen
  // distinto al que sirve el servidor. En la practica: si entras por
  // http://127.0.0.1:3000 en vez de http://localhost:3000, los scripts dan 403,
  // React no arranca, y los botones dejan de responder sin ningun error visible.
  // Listar los dos hace que ande igual escribas lo que escribas.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
}

export default nextConfig
