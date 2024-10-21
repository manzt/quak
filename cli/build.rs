use std::process::Command;

fn main() -> std::io::Result<()> {
    println!("cargo:rerun-if-changed=NULL");
    let output = Command::new("deno")
        .arg("run")
        .arg("build")
        .arg("--bundle")
        .output()?;

    if !output.status.success() {
        println!("cargo:warning=Deno build command failed");
    } else {
        println!("cargo:warning=Built static assets with Deno");
    }
    Ok(())
}
