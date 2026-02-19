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
- `run_ild_test(config: IldTestConfig) -> ConceptTestResult`
- `run_bass_extension_test(config: BassExtensionTestConfig) -> ConceptTestResult`
- `run_treble_extension_test(config: TrebleExtensionTestConfig) -> ConceptTestResult`
- `run_resolution_test(config: ResolutionTestConfig) -> ConceptTestResult`
- `run_separation_test(config: SeparationTestConfig) -> ConceptTestResult`
- `run_transient_test(config: TransientTestConfig) -> ConceptTestResult`
- `run_dynamic_range_test(config: DynamicRangeTestConfig) -> ConceptTestResult`
- `run_density_test(config: DensityTestConfig) -> ConceptTestResult`
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

## GitHub Pages 部署（空间结像模块）

仓库已包含自动部署工作流：`.github/workflows/deploy-pages.yml`  
推送到 `main` 分支后会自动构建并发布到 GitHub Pages。

发布地址通常为：

- `https://inori-3333.github.io/HiFi-Box/`

说明：

- GitHub Pages 版本用于空间结像测试（2D/3D）。
- ABX/Sweep/THD/声道一致性等硬件采集功能需要 Tauri 桌面版运行。

## 数据目录

运行后默认将数据写入项目目录下：

- `data/<test_id>/project.json`
- `data/exports/report_<test_id>_<timestamp>.html|json`

## 常用命令
1.
```bash
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```
2.
```
npm run dev
```
3.
```
npm run tauri dev
```
