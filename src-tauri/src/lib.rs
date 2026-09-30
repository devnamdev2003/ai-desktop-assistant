use base64::Engine;
use image::ImageFormat;
use std::io::Cursor;
use xcap::Monitor;

#[tauri::command]
fn capture_screen() -> Result<String, String> {
  let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;
  let monitor = monitors
    .into_iter()
    .find(|m| m.is_primary())
    .or_else(|| Monitor::all().ok().and_then(|mut m| m.pop()))
    .ok_or_else(|| "No active monitor found for screen capture".to_string())?;

  let image = monitor
    .capture_image()
    .map_err(|e| format!("Failed to capture screen: {}", e))?;

  let mut bytes: Vec<u8> = Vec::new();
  image
    .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
    .map_err(|e| format!("Failed to encode screenshot: {}", e))?;

  let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
  Ok(format!("data:image/png;base64,{}", b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .invoke_handler(tauri::generate_handler![capture_screen]);

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
  }

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
