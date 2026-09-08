/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPPORT_BALE?: string;
  readonly VITE_SUPPORT_WHATSAPP?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface Window {
  BarcodeDetector?: {
    new (opts?: { formats?: string[] }): {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
    };
  };
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (res: { credential: string }) => void;
        }) => void;
        renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        prompt: () => void;
      };
    };
  };
}
