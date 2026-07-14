// src/types/app-version.d.ts
// ============================================================
// __APP_VERSION__ / __APP_BUILD__ được Vite inject lúc compile-time
// qua `define` trong vite.config.ts (đọc từ package.json).
//
// LƯU Ý: phải dùng như bare identifier (vd: `__APP_VERSION__`),
// KHÔNG được truy cập qua `window.__APP_VERSION__` — vì esbuild/Vite
// `define` chỉ thay thế identifier reference độc lập, không thay thế
// property access trên object khác (kể cả window). Nếu dùng qua
// window.*, giá trị sẽ luôn là undefined lúc runtime (vì không ai gán
// nó vào window cả) → luôn fallback về giá trị mặc định, kể cả bản build.
// ============================================================
declare const __APP_VERSION__: string
declare const __APP_BUILD__: string
