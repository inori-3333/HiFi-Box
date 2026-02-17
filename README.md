# HiFi-Box

HiFi-Box V1 是一个 Windows 优先的耳机测试与量化工具箱（方案B），采用 Tauri + Rust + React。

## V1 能力

- ABX 盲测
- Sweep 频响偏差评估
- THD 失真测量（基础）
- 左右声道一致性
- 总分 + 子项雷达图 + 原始指标表
- 本地项目保存与 HTML/JSON 报告导出

## 固定评分权重

- ABX: 25%
- Sweep: 35%
- THD: 25%
- Channel: 15%

## Tauri Commands

- `list_audio_devices() -> DeviceInfo[]`
- `start_calibration(input_device_id, output_device_id, sample_rate) -> CalibrationSession`
- `run_abx_test(config: AbxConfig) -> AbxResult`
- `run_sweep_test(config: SweepConfig) -> SweepResult`
- `run_thd_test(config: ThdConfig) -> ThdResult`
- `run_channel_match_test(config: ChannelMatchConfig) -> ChannelMatchResult`
- `compute_score(input: ScoreInput) -> ScoreResult`
- `save_project(project: TestProject) -> SaveResult`
- `export_report(project_id, format) -> ExportResult`
- `list_projects() -> ProjectSummary[]`
- `load_project(project_id) -> TestProject`

## 运行前置

1. 安装 Node.js 22+
2. 安装 Rust (stable, `rustc/cargo` 可用)
3. 安装 Tauri 平台依赖（Windows WebView2）

## 开发运行

```bash
npm install
npm run tauri dev
```

## 数据目录

运行后默认将数据写入项目目录下：

- `data/<test_id>/project.json`
- `data/exports/report_<test_id>_<timestamp>.html|json`
