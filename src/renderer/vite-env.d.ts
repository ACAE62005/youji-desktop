/// <reference types="vite/client" />

import type { MailBridge } from "../preload";

declare global {
  interface Window {
    mailBridge: MailBridge;
  }
}
