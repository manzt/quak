use anyhow::Result;
use arrow::ipc::writer::FileWriter;
use tauri::Manager;

#[tauri::command]
async fn query(
    state: tauri::State<'_, Database>,
    sql: String,
    kind: String,
) -> Result<tauri::ipc::Response, String> {
    match &kind {
        kind if kind == "arrow" => {
            let buf = state.query_arrow(&sql).await.map_err(|e| e.to_string())?;
            Ok(tauri::ipc::Response::new(buf))
        }
        kind if kind == "json" => {
            let buf = state.query_json(&sql).await.map_err(|e| e.to_string())?;
            Ok(tauri::ipc::Response::new(buf))
        }
        _ => unimplemented!(),
    }
}

#[tauri::command]
async fn exec(state: tauri::State<'_, Database>, sql: String) -> Result<(), String> {
    state.execute(&sql).await.map_err(|e| e.to_string())
}

pub struct Database {
    pub pool: r2d2::Pool<duckdb::DuckdbConnectionManager>,
}

impl Database {
    pub fn new(pool_size: u32) -> Result<Self> {
        let pool = r2d2::Pool::builder()
            .max_size(pool_size)
            .build(duckdb::DuckdbConnectionManager::memory()?)?;
        Ok(Self { pool })
    }
    pub async fn execute(&self, sql: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute_batch(sql)?;
        Ok(())
    }
    pub async fn query_arrow(&self, sql: &str) -> Result<Vec<u8>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(sql)?;
        let table = stmt.query_arrow([])?;
        let mut buf: Vec<u8> = Vec::new();
        {
            let mut w = FileWriter::try_new(&mut buf, &table.get_schema())?;
            table.into_iter().for_each(|batch| w.write(&batch).unwrap());
            w.finish()?;
        }
        Ok(buf)
    }
    async fn query_json(&self, sql: &str) -> Result<Vec<u8>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(sql)?;
        let table = stmt.query_arrow([])?;
        let buf: Vec<u8> = Vec::new();
        let mut w = arrow::json::ArrayWriter::new(buf);
        table.into_iter().for_each(|batch| w.write(&batch).unwrap());
        w.finish()?;
        Ok(w.into_inner())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .manage(Database::new(10).unwrap())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![query, exec])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
