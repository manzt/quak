use anyhow::Result;
use clap::Parser;
use std::sync::Arc;
use std::{borrow::Cow, sync::Mutex};
use tao::{
    dpi::Size,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
};
use wry::{
    http::{Method, Request, Response},
    WebViewBuilder,
};

mod db;

#[derive(Parser)]
#[clap(name = "quak", version = "0.1.0", author = "Trevor Manz")]
struct Cli {
    /// the file to view
    file: std::path::PathBuf,
}

#[derive(Debug)]
enum Format {
    Parquet(String),
    Text(String),
}

impl AsRef<str> for Format {
    fn as_ref(&self) -> &str {
        match self {
            Format::Parquet(s) => s,
            Format::Text(s) => s,
        }
    }
}

fn main() -> Result<()> {
    let args = Cli::parse();
    let (width, height) = (960.0, 550.0);
    let current_query = Arc::new(Mutex::new(String::new()));

    if !args.file.exists() {
        anyhow::bail!("Invalid file provided");
    }
    let from: Format = match args.file.extension().and_then(|e| e.to_str()) {
        Some("parquet") | Some("pq") => {
            Format::Parquet(format!("read_parquet(\"{}\")", args.file.display()))
        }
        Some("csv") => Format::Text(format!("read_csv(\"{}\")", args.file.display())),
        Some("json") => Format::Text(format!("read_json(\"{}\")", args.file.display())),
        Some("tsv") => Format::Text(format!(
            "read_csv(\"{}\", delim=\"\\t\")",
            args.file.display()
        )),
        _ => anyhow::bail!("Unsupported file type"),
    };

    let pool = Arc::new(db::ConnectionPool::new(":memory:", 10)?);
    pool.execute(&format!(
        "CREATE {} df as SELECT * FROM {}",
        // it's efficient to use a view for parquet, but we should read text into memory
        match from {
            Format::Parquet(_) => "VIEW",
            Format::Text(_) => "TABLE",
        },
        from.as_ref()
    ))?;

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("quak")
        .with_inner_size(Size::Logical((width, height).into()))
        .build(&event_loop)
        .unwrap();

    let current_query_clone = Arc::clone(&current_query);
    let _webview = WebViewBuilder::new(&window)
        .with_devtools(true)
        .with_asynchronous_custom_protocol("quak".into(), move |request, responder| {
            responder.respond(
                match get_quak_response(
                    Arc::clone(&pool),
                    Arc::clone(&current_query_clone),
                    request,
                ) {
                    Ok(r) => r,
                    Err(e) => Response::builder()
                        .header("Content-Type", "text/plain")
                        .status(200)
                        .body(e.to_string())
                        .unwrap()
                        .map(Into::into),
                },
            )
        })
        .with_url("quak://localhost")
        .build()?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            let sql = current_query.lock().unwrap();
            println!("{}", sql.replace("\"df\"", from.as_ref()));
            *control_flow = ControlFlow::Exit
        }
    });
}

enum Action {
    Arrow,
    Json,
    Exec,
}

impl<T> TryFrom<&Request<T>> for Action {
    type Error = anyhow::Error;
    fn try_from(value: &Request<T>) -> Result<Self> {
        let Some(query) = value.uri().query() else {
            anyhow::bail!("no query string found");
        };
        for (k, v) in querystring::querify(query) {
            if !k.eq("type") {
                continue;
            }
            match v {
                "arrow" => return Ok(Self::Arrow),
                "json" => return Ok(Self::Json),
                "exec" => return Ok(Self::Exec),
                _ => anyhow::bail!("Invalid action"),
            };
        }
        anyhow::bail!("Invalid action")
    }
}

fn get_quak_response(
    db: Arc<db::ConnectionPool>,
    current_query: Arc<Mutex<String>>,
    request: Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>> {
    match (request.method(), request.uri().path()) {
        (&Method::GET, "/") => Ok(Response::builder()
            .header("Content-Type", "text/html")
            .status(200)
            .body(include_bytes!("./static/index.html").into())
            .unwrap()),
        (&Method::GET, "/widget.js") => Ok(Response::builder()
            .header("Content-Type", "application/javascript")
            .status(200)
            .body(include_bytes!("./static/widget.js").into())
            .unwrap()),
        (&Method::POST, "/api/query") => {
            let sql = std::str::from_utf8(request.body())?;
            match Action::try_from(&request)? {
                Action::Arrow => Ok(Response::builder()
                    .header("Content-Type", "application/vnd.apache.arrow.file")
                    .status(200)
                    .body(db.get_arrow(sql)?)
                    .unwrap()),
                Action::Json => Ok(Response::builder()
                    .header("Content-Type", "application/json")
                    .status(200)
                    .body(db.get_json(sql)?)
                    .unwrap()),
                Action::Exec => {
                    db.execute(sql)?;
                    Ok(Response::builder().status(200).body(vec![]).unwrap())
                }
            }
        }
        (&Method::POST, "/api/sql") => {
            let sql = std::str::from_utf8(request.body())?;
            *current_query.lock().unwrap() = sql.to_string();
            Ok(Response::builder().status(200).body(vec![]).unwrap())
        }
        _ => Ok(Response::builder()
            .header("Content-Type", "text/plain")
            .status(404)
            .body("Not Found".as_bytes().to_vec())
            .unwrap()),
    }
}
