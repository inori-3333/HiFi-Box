# 声场角度感知与 ABX 测试算法说明

## 1. 目标与定义

本模块将声场角度测试与 ABX 测试从“参数对比”重构为“信号特征驱动”：

- 角度测试基于双耳线索 `ITD + ILD` 融合估计。
- 角度语义采用左右对称开角：`openingAngle = 2 * |θ|`，范围 `0° ~ 180°`。
- ABX 采用标准 `A/B/X` 范式：判断 `X` 属于 `A` 或 `B`。

其中 `θ` 为等效单侧方位角（`0° ~ 90°`）。

## 2. 常量与参数

- 声速：`c = 343 m/s`
- 头间距：`ID = 0.175 m`
- 分频点：`1500 Hz`
- ILD 角度映射系数：`k = 7 deg/dB`
- 角度轮数：`8`
- ABX 轮数：`8`

## 3. 角度感知（ITD/ILD 融合）

### 3.1 分频

对左右声道分别进行二阶 Butterworth 近似分频（Q = `1/sqrt(2)`）：

- 低频 `< 1500Hz`：用于 ITD
- 高频 `> 1500Hz`：用于 ILD

### 3.2 ITD 估计（低频）

在 `±maxLag` 内做时域互相关（GCC 时域实现）：

- `maxLag = ceil((ID / c) * fs)`
- 峰值滞后 `lagPeak` 对应时差：`itdSec = lagPeak / fs`

再映射单侧方位角：

`thetaItdDeg = asin(clamp(c * |itdSec| / ID, 0, 1)) * 180/pi`

### 3.3 ILD 估计（高频）

计算高频左右 RMS：

- `rmsL = RMS(highL)`
- `rmsR = RMS(highR)`
- `ildDb = 20 * log10((rmsR + eps) / (rmsL + eps))`

映射角度：

`thetaIldDeg = clamp(k * |ildDb|, 0, 90)`

### 3.4 融合与开角

按能量加权：

- `Elow = meanSquare(lowL, lowR)`
- `Ehigh = meanSquare(highL, highR)`
- `wItd = Elow / (Elow + Ehigh + eps)`
- `wIld = 1 - wItd`

融合单侧方位角：

`thetaSideDeg = wItd * thetaItdDeg + wIld * thetaIldDeg`

对称开角：

`openingAngleDeg = clamp(2 * thetaSideDeg, 0, 180)`

### 3.5 评分口径（角度模式）

每轮记录：

- 目标开角 `targetOpeningAngleDeg`（生成参数）
- 客观开角 `objectiveOpeningAngleDeg`（由 ITD/ILD 估计）
- 用户开角 `guessOpeningAngleDeg`
- 误差 `errorDeg = |objectiveOpeningAngleDeg - guessOpeningAngleDeg|`

总分主指标为 `MAE`（平均绝对误差），并保留最大/最小误差。

## 4. ABX（A/B/X）逻辑

### 4.1 试次构造

每轮随机生成 `A` 与 `B` 开角，且最小间隔至少 `30°`；再随机决定：

- `xRef = "a"` 或 `"b"`
- `X` 的实际声学属性与 `xRef` 对应版本一致

每轮保存：

- `aOpeningAngleDeg`、`bOpeningAngleDeg`
- `xRef`
- `aCues`、`bCues`、`xCues`
- `cueDistanceDeg = |aCues.openingAngleDeg - bCues.openingAngleDeg|`

### 4.2 判定

用户可反复播放 `A/B/X`，提交 `X=A` 或 `X=B`：

- `correct = (userChoice === xRef)`

### 4.3 统计

设总轮数 `n`、正确数 `k`：

- `accuracy = k / n * 100`
- 单侧二项检验：
  `pValue = sum_{i=k..n} C(n,i) * 0.5^n`
- `dPrime = clamp((accuracy/100 - 0.5) * 6, 0, 4)`
- `significant = (pValue < 0.05)`

## 5. 置信度与回退

- 单声道输入：自动复制到双声道并降低置信度。
- 音频过短、静音或能量过低：回退到中性估计（开角 `90°`）并标记低置信度。

## 6. 前端实现边界

本算法目前仅在前端 `src/soundfield` 生效，不改变 Rust/Tauri 硬件采集 ABX 接口。
