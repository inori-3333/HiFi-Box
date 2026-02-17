use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;

use super::models::{ExportResult, ProjectSummary, SaveResult, TestProject};

fn ensure_dir(path: &Path) -> Result<(), String> {
    if !path.exists() {
        fs::create_dir_all(path).map_err(|e| format!("create dir failed: {e}"))?;
    }
    Ok(())
}

fn workspace_data_root() -> Result<PathBuf, String> {
    let root = std::env::current_dir().map_err(|e| format!("resolve current dir failed: {e}"))?;
    Ok(root.join("data"))
}

pub fn save_project_local(project: &TestProject) -> Result<SaveResult, String> {
    let root = workspace_data_root()?;
    ensure_dir(&root)?;

    let project_dir = root.join(&project.metadata.test_id);
    ensure_dir(&project_dir)?;

    let json_path = project_dir.join("project.json");
    let content = serde_json::to_string_pretty(project).map_err(|e| format!("serialize project failed: {e}"))?;
    fs::write(&json_path, content).map_err(|e| format!("write project failed: {e}"))?;

    Ok(SaveResult {
        project_id: project.metadata.test_id.clone(),
        saved_path: json_path.to_string_lossy().to_string(),
    })
}

fn html_template(project: &TestProject) -> String {
    format!(
        r#"<!doctype html>
<html>
<head>
<meta charset=\"utf-8\" />
<title>HiFi-Box Report</title>
<style>
body {{ font-family: Segoe UI, sans-serif; margin: 24px; background: #f6fbf4; color: #162212; }}
.card {{ background: #fff; border: 1px solid #d4e5cf; border-radius: 10px; padding: 14px; margin-bottom: 12px; }}
.metric {{ display: inline-block; width: 150px; }}
</style>
</head>
<body>
<h1>HiFi-Box Test Report</h1>
<div class=\"card\">
<p><b>Test ID:</b> {}</p>
<p><b>Created At:</b> {}</p>
<p><b>Sample Rate:</b> {} Hz</p>
<p><b>Total Score:</b> {:.1}</p>
</div>
<div class=\"card\">
<h2>Subscores</h2>
<p><span class=\"metric\">ABX:</span> {:.1}</p>
<p><span class=\"metric\">Sweep:</span> {:.1}</p>
<p><span class=\"metric\">THD:</span> {:.1}</p>
<p><span class=\"metric\">Channel:</span> {:.1}</p>
</div>
<div class=\"card\">
<h2>Explanations</h2>
<ul>{}</ul>
</div>
</body>
</html>"#,
        project.metadata.test_id,
        project.metadata.created_at,
        project.metadata.sample_rate,
        project.score_result.total_score,
        project.score_result.subscores.abx,
        project.score_result.subscores.sweep,
        project.score_result.subscores.thd,
        project.score_result.subscores.channel,
        project
            .score_result
            .explanations
            .iter()
            .map(|e| format!("<li>{e}</li>"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

pub fn export_report_local(project_id: &str, format: &str) -> Result<ExportResult, String> {
    let root = workspace_data_root()?;
    let project_dir = root.join(project_id);
    let source_json = project_dir.join("project.json");

    if !source_json.exists() {
        return Err(format!("project not found: {project_id}"));
    }

    let project: TestProject = serde_json::from_str(
        &fs::read_to_string(&source_json).map_err(|e| format!("read project failed: {e}"))?,
    )
    .map_err(|e| format!("parse project failed: {e}"))?;

    let out_dir = root.join("exports");
    ensure_dir(&out_dir)?;

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");

    let (output_path, fmt) = if format.eq_ignore_ascii_case("json") {
        let output_path = out_dir.join(format!("report_{}_{}.json", project_id, timestamp));
        let content = serde_json::to_string_pretty(&project).map_err(|e| format!("serialize report failed: {e}"))?;
        fs::write(&output_path, content).map_err(|e| format!("write report failed: {e}"))?;
        (output_path, "json")
    } else {
        let output_path = out_dir.join(format!("report_{}_{}.html", project_id, timestamp));
        fs::write(&output_path, html_template(&project)).map_err(|e| format!("write html report failed: {e}"))?;
        (output_path, "html")
    };

    Ok(ExportResult {
        project_id: project_id.to_string(),
        format: fmt.to_string(),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

pub fn list_projects_local() -> Result<Vec<ProjectSummary>, String> {
    let root = workspace_data_root()?;
    ensure_dir(&root)?;

    let mut projects: Vec<ProjectSummary> = fs::read_dir(&root)
        .map_err(|e| format!("read data root failed: {e}"))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path().join("project.json");
            if !path.exists() {
                return None;
            }
            let parsed = fs::read_to_string(path)
                .ok()
                .and_then(|raw| serde_json::from_str::<TestProject>(&raw).ok())?;
            Some(ProjectSummary {
                project_id: parsed.metadata.test_id,
                created_at: parsed.metadata.created_at,
                sample_rate: parsed.metadata.sample_rate,
                total_score: parsed.score_result.total_score,
            })
        })
        .collect();

    projects.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(projects)
}

pub fn load_project_local(project_id: &str) -> Result<TestProject, String> {
    let root = workspace_data_root()?;
    let project_path = root.join(project_id).join("project.json");
    if !project_path.exists() {
        return Err(format!("project not found: {project_id}"));
    }
    let raw = fs::read_to_string(&project_path).map_err(|e| format!("read project failed: {e}"))?;
    serde_json::from_str::<TestProject>(&raw).map_err(|e| format!("parse project failed: {e}"))
}
