// Entry point for the desktop shell. Product logic lives in lib.rs (see it for
// the relay design). No application logic here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    carl_code_lib::run();
}