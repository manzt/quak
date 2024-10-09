use anyhow::Result;
use clap::Parser;
use std::sync::Arc;
use std::{borrow::Cow, path::PathBuf};
use tao::{
    dpi::Size,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
};
use wry::{
    http::{header::CONTENT_TYPE, Method, Request, Response},
    WebViewBuilder,
};

mod db;

#[derive(Parser)]
#[clap(name = "quak", version = "0.1.0", author = "Trevor Manz")]
struct Cli {
    // a file for the cli
    file: std::path::PathBuf,
}

fn main() -> Result<()> {
    let args = Cli::parse();
    let (width, height) = (960.0, 540.0);

    if !args.file.exists() {
        anyhow::bail!("Invalid file provided");
    }

    let from = match args.file.extension().and_then(|e| e.to_str()) {
        Some("parquet") | Some("pq") => {
            format!("read_parquet(\"{}\")", args.file.display())
        }
        _ => anyhow::bail!("Unsupported file type"),
    };

    let pool = Arc::new(db::ConnectionPool::new(":memory:", 10)?);
    pool.execute(&format!("SELECT * as df FROM {}", from))?;

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("quak")
        .with_inner_size(Size::Logical((width, height).into()))
        .build(&event_loop)
        .unwrap();

    let _webview = WebViewBuilder::new(&window)
        .with_custom_protocol("quak".into(), move |request| {
            match get_quak_response(pool.clone(), request) {
                Ok(r) => r.map(Into::into),
                Err(e) => Response::builder()
                    .header(CONTENT_TYPE, "text/plain")
                    .status(200)
                    .body(e.to_string().as_bytes().to_vec())
                    .unwrap()
                    .map(Into::into),
            }
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
            *control_flow = ControlFlow::Exit
        }
    });
}

enum Action {
    Arrow,
    Json,
    Exec,
}

impl TryFrom<&str> for Action {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self> {
        match value {
            "arrow" => Ok(Self::Arrow),
            "json" => Ok(Self::Json),
            "exec" => Ok(Self::Exec),
            _ => Err(anyhow::anyhow!("Invalid action")),
        }
    }
}

fn get_quak_response(
    db: Arc<db::ConnectionPool>,
    request: Request<Vec<u8>>,
) -> Result<Response<Cow<'static, [u8]>>> {
    match (request.method(), request.uri().path()) {
        (&Method::GET, "/") => Ok(Response::builder()
            .header(CONTENT_TYPE, "text/html")
            .status(200)
            .body(include_bytes!("./static/index.html").into())
            .unwrap()),
        (&Method::GET, "/widget.js") => Ok(Response::builder()
            .header(CONTENT_TYPE, "application/javascript")
            .status(200)
            .body(include_bytes!("./static/widget.js").into())
            .unwrap()),
        (&Method::POST, "/api/query") => {
            let sql = std::str::from_utf8(request.body())?;
            let Some(action) = request
                .uri()
                .query()
                .map(querystring::querify)
                .map(|params| {
                    params
                        .iter()
                        .find(|(k, _)| *k == "format")
                        .map(|(_, v)| Action::try_from(*v).unwrap())
                        .unwrap_or(Action::Exec)
                })
            else {
                anyhow::bail!("Invalid query");
            };
            match action {
                Action::Arrow => Ok(Response::builder()
                    .header(CONTENT_TYPE, "application/octet-stream")
                    .status(200)
                    .body(db.get_arrow(sql)?.into())
                    .unwrap()),
                Action::Json => Ok(Response::builder()
                    .header(CONTENT_TYPE, "application/json")
                    .status(200)
                    .body(db.get_json(sql)?.into())
                    .unwrap()),
                Action::Exec => {
                    db.execute(sql)?;
                    Ok(Response::builder().status(200).body(vec![].into()).unwrap())
                }
            }
        }
        _ => Err(anyhow::anyhow!("404 not found")),
    }
}
