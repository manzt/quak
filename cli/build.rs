use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../lib/widget.ts");

    let output = Command::new("deno")
        .arg("run")
        .arg("build")
        .arg("--bundle")
        .output()
        .expect("Failed to execute command");

    println!(
        "Pre-compile output: {:?}",
        String::from_utf8_lossy(&output.stdout)
    );
}
