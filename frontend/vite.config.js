import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server : {
    port : 5371,
    // host:true → escucha en 0.0.0.0, necesario para que alguien en tu
    // misma red LAN pueda entrar por tu IP (192.168.x.x). No estorba para
    // el escenario de túnel (Cloudflare/ngrok corre en tu misma máquina
    // y conecta por localhost de todas formas).
    host : true,
    // Vite valida el header Host de cada petición por seguridad. Sin esto,
    // acceder desde un túnel (https://algo.trycloudflare.com) da el error
    // "Blocked request. This host is not allowed". Agrega aquí el dominio
    // exacto que te dé Cloudflare/ngrok cada vez que levantes el túnel,
    // o usa `true` para permitir cualquiera (solo mientras haces pruebas,
    // nunca lo dejes así en un entorno expuesto de forma permanente).
    allowedHosts: [
      '.trycloudflare.com', // permite cualquier subdominio *.trycloudflare.com
      // 'tu-dominio-ngrok.ngrok-free.app', // agrega el tuyo si usas ngrok
    ],
    proxy : {
      // 1. Detecta cualquier petición que empiece con /api
      '/api': {
        // 2. La redirige transparentemente a tu API local
        target: 'http://127.0.0.1:3001', 
        changeOrigin: true,
        secure: false,
      }
    }
  }
})