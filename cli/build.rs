use std::process::Command;

fn main() -> std::io::Result<()> {
    println!("cargo:rerun-if-changed=NULL");

    let project_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = project_root.parent().unwrap();

    let output = Command::new("deno")
        .arg("task")
        .arg("build")
        .current_dir(root)
        .output()?;

    std::fs::copy(
        root.join("src/quak/widget.js"),
        project_root.join("src/static/widget.js"),
    )?;

    if !output.status.success() {
        println!("cargo:warning=Deno build command failed");
    } else {
        println!("cargo:warning=Built static assets with Deno");
    }
    Ok(())
}
