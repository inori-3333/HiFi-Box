import { useEffect, useMemo, useState } from "react";
import { Play, RotateCcw, ArrowLeft, Volume2, SkipForward, CheckCircle } from "lucide-react";
import { INTERACTIVE_CONCEPTS } from "../concept-interactive/concepts";
import { useInteractiveConceptSuite } from "../concept-interactive/useInteractiveConceptSuite";
import {
  type InteractiveChoice,
  type InteractiveConceptId,
  type InteractiveConceptMetrics,
  type PlaybackVariant,
  type PracticeOption
} from "../concept-interactive/types";

type InteractiveConceptStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
  initialConcept: InteractiveConceptId;
};

function conceptLabel(concept: InteractiveConceptId): string {
  return INTERACTIVE_CONCEPTS[concept].label;
}

function conceptDescription(concept: InteractiveConceptId): string {
  return INTERACTIVE_CONCEPTS[concept].short_description;
}

function metricsLines(metrics: InteractiveConceptMetrics): string[] {
  switch (metrics.concept) {
    case "ild":
      return [
        `方向正确率: ${metrics.direction_accuracy_pct.toFixed(1)}%`,
        `阈值: ${metrics.threshold_db.toFixed(1)} dB`,
        `估计误差MAE: ${metrics.estimate_mae_db.toFixed(1)} dB`
      ];
    case "bass_extension":
      return [
        `深低频辨别率: ${metrics.deep_detect_rate_pct.toFixed(1)}%`,
        `f3代理点: ${metrics.f3_proxy_hz.toFixed(1)} Hz`,
        `超低频感知率: ${metrics.sub_bass_detect_rate_pct.toFixed(1)}%`
      ];
    case "treble_extension":
      return [
        `高频辨别率: ${metrics.treble_detect_rate_pct.toFixed(1)}%`,
        `f3高频代理点: ${metrics.f3_high_proxy_hz.toFixed(1)} Hz`
      ];
    case "resolution":
      return [
        `细节检出率: ${metrics.detail_detect_rate_pct.toFixed(1)}%`,
        `d': ${metrics.d_prime.toFixed(1)}`,
        `最小可检SNR: ${metrics.min_detectable_snr_db.toFixed(1)} dB`
      ];
    case "separation":
      return [
        `定位误差: ${metrics.localization_error.toFixed(2)}`,
        `最小可分辨间距: ${metrics.min_resolvable_gap.toFixed(2)}`,
        `重叠误差: ${metrics.overlap_error.toFixed(2)}`
      ];
    case "transient":
      return [
        `瞬态辨别率: ${metrics.transient_detect_rate_pct.toFixed(1)}%`,
        `最大清晰BPM: ${metrics.max_clean_bpm.toFixed(1)}`
      ];
    case "dynamic":
      return [
        `动态辨别率: ${metrics.dynamic_detect_rate_pct.toFixed(1)}%`,
        `感知动态范围代理: ${metrics.perceived_range_db_proxy.toFixed(1)} dB`
      ];
    case "density":
      return [
        `密度辨别率: ${metrics.density_detect_rate_pct.toFixed(1)}%`,
        `一致性分: ${metrics.consistency_score.toFixed(1)}`,
        `主观密度: ${metrics.subjective_density_10.toFixed(1)}/10`
      ];
  }
}

export function InteractiveConceptStage(props: InteractiveConceptStageProps) {
  const { busy, setStatus, onBackHome, initialConcept } = props;
  const suite = useInteractiveConceptSuite();

  const selectedConcept = initialConcept;

  const [choice, setChoice] = useState<InteractiveChoice | undefined>(undefined);
  const [ildEstimateDb, setIldEstimateDb] = useState(1.5);
  const [sensedSubBass, setSensedSubBass] = useState(false);
  const [sepA, setSepA] = useState(-0.4);
  const [sepB, setSepB] = useState(0.4);
  const [dynamicLevels, setDynamicLevels] = useState(3);
  const [densityRating, setDensityRating] = useState(6);
  const [selectedPracticeOption, setSelectedPracticeOption] = useState<PracticeOption | undefined>(undefined);

  const currentTrial = suite.currentTrial;
  const activeConcept = suite.currentConceptId ?? selectedConcept;

  useEffect(() => {
    setChoice(undefined);
    setIldEstimateDb(1.5);
    setSensedSubBass(false);
    setSepA(-0.4);
    setSepB(0.4);
    setDynamicLevels(3);
    setDensityRating(6);
    setSelectedPracticeOption(undefined);
  }, [suite.currentTrialIndex, suite.currentConceptId]);

  useEffect(() => {
    if (suite.phase === "idle") {
      setStatus("交互式测试准备就绪，请点击开始测试。");
    } else if (suite.phase === "practice") {
      setStatus(`练习题进行中：${conceptLabel(activeConcept)}`);
    } else if (suite.phase === "testing") {
      setStatus(`计分题进行中：${conceptLabel(activeConcept)}`);
    } else if (suite.phase === "concept-complete") {
      setStatus(`${conceptLabel(activeConcept)} 完成`);
    } else if (suite.phase === "completed") {
      setStatus(`测试结束，得分 ${suite.overallScore.toFixed(1)}`);
    }
  }, [activeConcept, setStatus, suite.overallScore, suite.phase]);

  const currentResult = useMemo(
    () => suite.conceptResults.find((x) => x.concept === activeConcept) ?? null,
    [activeConcept, suite.conceptResults]
  );

  const playbackOptions = useMemo(() => {
    if (!currentTrial) {
      return [] as PlaybackVariant[];
    }
    if (currentTrial.concept === "resolution") {
      return ["a", "b", "x"] as PlaybackVariant[];
    }
    if (currentTrial.concept === "separation") {
      return ["single"] as PlaybackVariant[];
    }
    return ["a", "b"] as PlaybackVariant[];
  }, [currentTrial]);

  function startCurrentConcept() {
    suite.startSingleConcept(selectedConcept);
  }

  function handleSubmit() {
    if (!currentTrial) {
      return;
    }
    suite.submitAnswer({
      choice,
      ild_estimate_db: ildEstimateDb,
      sensed_sub_bass: sensedSubBass,
      separation_pos_a: sepA,
      separation_pos_b: sepB,
      dynamic_levels: dynamicLevels,
      density_rating: densityRating
    });
  }

  function canSubmit(): boolean {
    if (!currentTrial) {
      return false;
    }
    // 练习题有特殊选项时，允许直接提交（仅体验）
    if (currentTrial.practice_options && currentTrial.phase === "practice") {
      return true;
    }
    if (currentTrial.concept === "separation") {
      return true;
    }
    return Boolean(choice);
  }

  function renderChoiceButtons(values: InteractiveChoice[], labels: Record<InteractiveChoice, string>) {
    return (
      <div className="concept-lab-choice-row">
        {values.map((value) => (
          <button
            key={value}
            className={choice === value ? "btn concept-choice-btn active" : "btn concept-choice-btn"}
            onClick={() => setChoice(value)}
            type="button"
          >
            {labels[value]}
          </button>
        ))}
      </div>
    );
  }

  function renderAnswerPanel() {
    if (!currentTrial) {
      return <p className="hint">当前无题目。</p>;
    }

    // 练习题有特殊选项（如ILD的5个偏差选项）
    if (currentTrial.practice_options && currentTrial.phase === "practice") {
      return (
        <>
          <div className="concept-lab-choice-row">
            {currentTrial.practice_options.map((option) => (
              <button
                key={option.value}
                className={selectedPracticeOption?.value === option.value ? "btn concept-choice-btn active" : "btn concept-choice-btn"}
                onClick={() => {
                  setSelectedPracticeOption(option);
                  void suite.playVariant("b" as PlaybackVariant, option.delta_db);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="hint">点击按钮播放对应偏差的音频</p>
        </>
      );
    }

    if (currentTrial.concept === "ild") {
      return (
        <>
          {renderChoiceButtons(["left", "center", "right"], {
            a: "A",
            b: "B",
            left: "偏左",
            right: "偏右",
            center: "居中"
          })}
          <label>
            估计声压差（dB）
            <input
              type="range"
              min={0}
              max={6}
              step={0.1}
              value={ildEstimateDb}
              onChange={(e) => setIldEstimateDb(Number.parseFloat(e.target.value))}
            />
            <span className="hint">{ildEstimateDb.toFixed(1)} dB</span>
          </label>
        </>
      );
    }

    if (currentTrial.concept === "bass_extension") {
      return (
        <>
          {renderChoiceButtons(["a", "b"], {
            a: "A更深",
            b: "B更深",
            left: "偏左",
            right: "偏右",
            center: "居中"
          })}
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={sensedSubBass}
              onChange={(e) => setSensedSubBass(e.target.checked)}
            />
            我明显感知到超低频（约40Hz以下）
          </label>
        </>
      );
    }

    if (currentTrial.concept === "resolution") {
      return renderChoiceButtons(
        ["a", "b"],
        {
          a: "X = A",
          b: "X = B",
          left: "偏左",
          right: "偏右",
          center: "居中"
        }
      );
    }

    if (currentTrial.concept === "separation") {
      return (
        <>
          <label>
            声源1位置（左-右）
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={sepA}
              onChange={(e) => setSepA(Number.parseFloat(e.target.value))}
            />
            <span className="hint">{sepA.toFixed(2)}</span>
          </label>
          <label>
            声源2位置（左-右）
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={sepB}
              onChange={(e) => setSepB(Number.parseFloat(e.target.value))}
            />
            <span className="hint">{sepB.toFixed(2)}</span>
          </label>
        </>
      );
    }

    if (currentTrial.concept === "dynamic") {
      return (
        <>
          {renderChoiceButtons(["a", "b"], {
            a: "A动态更大",
            b: "B动态更大",
            left: "偏左",
            right: "偏右",
            center: "居中"
          })}
          <label>
            你能分辨的动态层级（1-6）
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={dynamicLevels}
              onChange={(e) => setDynamicLevels(Number.parseInt(e.target.value, 10))}
            />
            <span className="hint">{dynamicLevels}</span>
          </label>
        </>
      );
    }

    if (currentTrial.concept === "density") {
      return (
        <>
          {renderChoiceButtons(["a", "b"], {
            a: "A更饱满",
            b: "B更饱满",
            left: "偏左",
            right: "偏右",
            center: "居中"
          })}
          <label>
            主观密度评分（1-10）
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={densityRating}
              onChange={(e) => setDensityRating(Number.parseInt(e.target.value, 10))}
            />
            <span className="hint">{densityRating}</span>
          </label>
        </>
      );
    }

    return renderChoiceButtons(["a", "b"], {
      a: "A更符合",
      b: "B更符合",
      left: "偏左",
      right: "偏右",
      center: "居中"
    });
  }

  return (
    <section className="concept-lab-container">
      {/* 顶部标题栏 - 居中对称 */}
      <div className="card concept-lab-header">
        <div className="concept-lab-title">
          <h2>{INTERACTIVE_CONCEPTS[initialConcept].label}</h2>
          <p className="concept-lab-subtitle">{conceptDescription(selectedConcept)}</p>
        </div>
        <div className="concept-lab-top-actions">
          <button className="btn btn-primary" disabled={busy} onClick={startCurrentConcept}>
            <Play size={16} />
            开始测试
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              suite.stopPlayback();
              suite.restart();
            }}
          >
            <RotateCcw size={16} />
            重置
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              suite.stopPlayback();
              onBackHome();
            }}
          >
            <ArrowLeft size={16} />
            返回
          </button>
        </div>
      </div>

      {/* 主要内容区域 - 居中 */}
      <div className="card concept-lab-content">
        {suite.phase === "idle" ? (
          <div className="concept-lab-idle">
            <div className="concept-lab-idle-icon">
              <Play size={48} />
            </div>
            <h3>准备开始测试</h3>
            <p className="hint">点击上方"开始测试"按钮开始</p>
          </div>
        ) : (
          <>
            <div className="concept-lab-status-bar">
              <span className="concept-lab-status-badge">
                {suite.currentConceptId ? conceptLabel(suite.currentConceptId) : "等待开始"}
              </span>
              {currentTrial && (
                <span className="concept-lab-progress">
                  {currentTrial.phase === "practice" ? "练习题" : "计分题"} | 题目 {suite.currentTrialIndex + 1}/{suite.currentTrials.length}
                </span>
              )}
              <span className={`concept-lab-audio-status ${suite.audioReady ? "ready" : ""}`}>
                {suite.audioReady ? "音频已解锁" : "音频未解锁"}
              </span>
            </div>

            {currentTrial && (
              <div className="concept-lab-trial">
                <p className="concept-lab-prompt">{currentTrial.prompt}</p>
                <p className="concept-lab-instruction">{currentTrial.instruction}</p>

                <div className="concept-lab-play-row">
                  {playbackOptions.map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      className="btn btn-secondary concept-play-btn"
                      onClick={() => void suite.playVariant(variant)}
                    >
                      <Volume2 size={16} />
                      {variant === "single" ? "播放测试片段" : `播放 ${variant.toUpperCase()}`}
                    </button>
                  ))}
                  <span className="hint">本题播放次数：{suite.currentReplayCount}</span>
                </div>

                <div className="concept-lab-answer">{renderAnswerPanel()}</div>

                <div className="concept-lab-submit-row">
                  <button className="btn btn-primary" disabled={busy || !canSubmit()} onClick={handleSubmit}>
                    <CheckCircle size={16} />
                    提交答案
                  </button>
                  {currentTrial.phase !== "practice" && (
                    <button className="btn btn-ghost" disabled={busy} onClick={suite.skipTrial}>
                      <SkipForward size={16} />
                      听不清（跳过）
                    </button>
                  )}
                </div>
              </div>
            )}

            {currentResult && (
              <div className="concept-lab-result">
                <h3>当前概念结果</h3>
                <div className="concept-lab-score-row">
                  <div className="concept-lab-score-item">
                    <span className="score-label">得分</span>
                    <span className="score-value">{currentResult.score.toFixed(1)}</span>
                  </div>
                  <div className="concept-lab-score-item">
                    <span className="score-label">置信度</span>
                    <span className="score-value">{currentResult.confidence.toFixed(1)}</span>
                  </div>
                </div>
                {currentResult.notes.map((note) => (
                  <p className="hint" key={note}>
                    {note}
                  </p>
                ))}
                <ul className="concept-lab-metrics">
                  {metricsLines(currentResult.metrics).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
