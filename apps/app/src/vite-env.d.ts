/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPPORT_TELEGRAM?: string;
  readonly VITE_SUPPORT_BALE?: string;
  readonly VITE_SUPPORT_WHATSAPP?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface Window {
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
