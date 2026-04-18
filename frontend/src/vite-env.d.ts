/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MSW: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_API_BASE: string;
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.glb" {
  const src: string;
  export default src;
}
