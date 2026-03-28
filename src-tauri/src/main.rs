// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // v2.11.14: Ultimate Compatibility Fix for WSL/Linux
    // 彻底禁用组合模式和 GPU 加速
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    // 强制使用软渲染器
    std::env::set_var("WEBKIT_FORCE_SOFTWARE_RENDERER", "1");
    // 禁用 GPU 进程，让所有渲染在 WebProcess 中完成
    std::env::set_var("WEBKIT_DISABLE_GPU_PROCESS", "1");
    // 伪造音频环境，防止因找不到声卡而崩溃
    std::env::set_var("WEBKIT_MUTE_AUDIO", "1");
    // v2.12.8: Extra stability for Mesa/Gallium and TLS bypass
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
    std::env::set_var("GALLIUM_DRIVER", "llvmpipe");
    // v2.17.27: Comprehensive Fix for ERR_SSL_PROTOCOL_ERROR on Local Domains
    std::env::set_var("WEBKIT_TLS_ERRORS_POLICY", "ignore");
    std::env::set_var("WEBKIT_DISABLE_HSTS", "1");
    // Allow mixed content and insecure local requests
    std::env::set_var("WEBKIT_RELAXED_MIXED_CONTENT_POLICY", "1");
    
    ter_lib::run();
}
