import { useEffect, useMemo, useState } from "react";
import { INTERACTIVE_CONCEPTS } from "../concept-interactive/concepts";
import { useInteractiveConceptSuite } from "../concept-interactive/useInteractiveConceptSuite";
import {
  INTERACTIVE_CONCEPT_ORDER,
  type InteractiveChoice,
  type InteractiveConceptId,
  type InteractiveConceptMetrics,
  type PlaybackVariant
} from "../concept-interactive/types";

type InteractiveConceptStageProps = {
  busy: boolean;
  setStatus: (status: string) => void;
  onBackHome: () => void;
  initialConcept?: InteractiveConceptId | null;
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
  const { busy, setStatus, onBackHome, initialConcept = null } = props;
  const suite = useInteractiveConceptSuite();

  const [selectedConcept, setSelectedConcept] = useState<InteractiveConceptId>(
    initialConcept ?? "ild"
  );

  const [choice, setChoice] = useState<InteractiveChoice | undefined>(undefined);
  const [ildEstimateDb, setIldEstimateDb] = useState(1.5);
  const [sensedSubBass, setSensedSubBass] = useState(false);
  const [sepA, setSepA] = useState(-0.4);
  const [sepB, setSepB] = useState(0.4);
  const [dynamicLevels, setDynamicLevels] = useState(3);
  const [densityRating, setDensityRating] = useState(6);

  const currentTrial = suite.currentTrial;
  const activeConcept = suite.currentConceptId ?? selectedConcept;

  useEffect(() => {
    if (initialConcept) {
      setSelectedConcept(initialConcept);
    }
  }, [initialConcept]);

  useEffect(() => {
    setChoice(undefined);
    setIldEstimateDb(1.5);
    setSensedSubBass(false);
    setSepA(-0.4);
    setSepB(0.4);
    setDynamicLevels(3);
    setDensityRating(6);
  }, [suite.currentTrialIndex, suite.currentConceptId]);

  useEffect(() => {
    if (suite.phase === "idle") {
      setStatus("交互式八项测试准备就绪，请选择概念并开始。");
    } else if (suite.phase === "practice") {
      setStatus(`练习题进行中：${conceptLabel(activeConcept)}`);
    } else if (suite.phase === "testing") {
      setStatus(`计分题进行中：${conceptLabel(activeConcept)}`);
    } else if (suite.phase === "concept-complete") {
      setStatus(`${conceptLabel(activeConcept)} 完成，可进入下一项。`);
    } else if (suite.phase === "completed") {
      setStatus(`测试结束，平均分 ${suite.overallScore.toFixed(1)}`);
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

  function startFullSuite() {
    suite.startSuite(selectedConcept);
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
            className={choice === value ? "concept-lab-choice active" : "concept-lab-choice"}
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
    <section className="grid">
      <div className="card concept-lab-sidebar">
        <h2>交互式八项测试</h2>
        <p className="hint">听音-作答-反馈。支持单项和8项闯关。</p>
        <div className="concept-lab-list">
          {INTERACTIVE_CONCEPT_ORDER.map((id) => {
            const done = suite.conceptResults.some((x) => x.concept === id);
            return (
              <button
                key={id}
                type="button"
                className={`concept-lab-list-item ${selectedConcept === id ? "active" : ""}`}
                onClick={() => setSelectedConcept(id)}
              >
                <span>{conceptLabel(id)}</span>
                <span className="hint">{done ? "已完成" : "待测试"}</span>
              </button>
            );
          })}
        </div>

        <p className="hint">当前选择：{conceptDescription(selectedConcept)}</p>

        <div className="row">
          <button disabled={busy} onClick={startCurrentConcept}>
            开始当前概念
          </button>
          <button disabled={busy} onClick={startFullSuite}>
            开始8项闯关
          </button>
          <button
            disabled={busy}
            onClick={() => {
              suite.stopPlayback();
              suite.restart();
            }}
          >
            重置会话
          </button>
          <button
            disabled={busy}
            onClick={() => {
              suite.stopPlayback();
              onBackHome();
            }}
          >
            返回首页
          </button>
        </div>

        <div className="concept-lab-overall">
          <p>已完成：{suite.conceptResults.length}/8</p>
          <p>平均分：{suite.overallScore.toFixed(1)}</p>
          <p>音频状态：{suite.audioReady ? "已解锁" : "未解锁"}</p>
        </div>
      </div>

      <div className="card concept-lab-main">
        <h2>{suite.currentConceptId ? conceptLabel(suite.currentConceptId) : "等待开始"}</h2>

        {currentTrial && (
          <div className="concept-lab-trial">
            <p className="concept-lab-phase">
              {currentTrial.phase === "practice" ? "练习题" : "计分题"} | 题目 {suite.currentTrialIndex + 1}/{suite.currentTrials.length}
            </p>
            <p>{currentTrial.prompt}</p>
            <p className="hint">{currentTrial.instruction}</p>

            <div className="concept-lab-play-row">
              {playbackOptions.map((variant) => (
                <button key={variant} type="button" onClick={() => void suite.playVariant(variant)}>
                  {variant === "single" ? "播放测试片段" : `播放 ${variant.toUpperCase()}`}
                </button>
              ))}
              <span className="hint">本题播放次数：{suite.currentReplayCount}</span>
            </div>

            <div className="concept-lab-answer">{renderAnswerPanel()}</div>

            <div className="row">
              <button disabled={busy || !canSubmit()} onClick={handleSubmit}>
                提交答案
              </button>
              <button disabled={busy} onClick={suite.skipTrial}>
                听不清（跳过）
              </button>
            </div>
          </div>
        )}

        {suite.phase === "concept-complete" && suite.mode === "suite" && (
          <div className="concept-lab-next">
            <p>当前概念完成，可进入下一项。</p>
            <button onClick={suite.moveToNextConcept}>下一项</button>
          </div>
        )}

        {currentResult && (
          <div className="concept-lab-result">
            <h3>当前概念结果</h3>
            <p>
              得分 {currentResult.score.toFixed(1)} | 置信度 {currentResult.confidence.toFixed(1)}
            </p>
            {currentResult.notes.map((note) => (
              <p className="hint" key={note}>
                {note}
              </p>
            ))}
            <ul>
              {metricsLines(currentResult.metrics).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {suite.conceptResults.length > 0 && (
        <div className="card concept-lab-summary">
          <h2>结果总览</h2>
          <table>
            <thead>
              <tr>
                <th>概念</th>
                <th>得分</th>
                <th>置信度</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {suite.conceptResults
                .slice()
                .sort((a, b) => a.concept.localeCompare(b.concept))
                .map((result) => (
                  <tr key={result.concept}>
                    <td>{conceptLabel(result.concept)}</td>
                    <td>{result.score.toFixed(1)}</td>
                    <td>{result.confidence.toFixed(1)}</td>
                    <td>{result.notes[0] ?? "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
