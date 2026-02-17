use super::models::{ScoreInput, ScoreResult, Subscores, Weights};

const WEIGHT_ABX: f32 = 0.25;
const WEIGHT_SWEEP: f32 = 0.35;
const WEIGHT_THD: f32 = 0.25;
const WEIGHT_CHANNEL: f32 = 0.15;

fn clamp_score(v: f32) -> f32 {
    v.clamp(0.0, 100.0)
}

pub fn compute(input: ScoreInput) -> ScoreResult {
    let abx_score = clamp_score(input.abx_result.reliability);
    let sweep_score = clamp_score(100.0 - input.sweep_result.deviation_to_target * 10.0);
    let thd_score = clamp_score(100.0 - input.thd_result.total_thd_percent * 35.0);
    let channel_score = clamp_score(input.channel_result.match_score);

    let total_score =
        abx_score * WEIGHT_ABX + sweep_score * WEIGHT_SWEEP + thd_score * WEIGHT_THD + channel_score * WEIGHT_CHANNEL;

    let mut explanations = Vec::new();

    if input.sweep_result.deviation_to_target > 2.0 {
        explanations.push(format!(
            "Sweep deviation {:.2} dB is above target and reduces tonal score",
            input.sweep_result.deviation_to_target
        ));
    }
    if input.thd_result.total_thd_percent > 0.6 {
        explanations.push(format!(
            "THD {:.3}% is elevated in some bands",
            input.thd_result.total_thd_percent
        ));
    }
    if input.abx_result.p_value > 0.05 {
        explanations.push(format!(
            "ABX confidence is limited (p={:.4}), consider more trials",
            input.abx_result.p_value
        ));
    }
    if input.channel_result.level_delta_db > 1.0 {
        explanations.push(format!(
            "Channel delta {:.2} dB affects imaging consistency",
            input.channel_result.level_delta_db
        ));
    }
    if explanations.is_empty() {
        explanations.push("All key metrics are within expected V1 thresholds".to_string());
    }

    let low_confidence = input.abx_result.low_confidence
        || input.sweep_result.low_confidence
        || input.thd_result.low_confidence
        || input.channel_result.low_confidence;

    ScoreResult {
        total_score: clamp_score(total_score),
        subscores: Subscores {
            abx: abx_score,
            sweep: sweep_score,
            thd: thd_score,
            channel: channel_score,
        },
        weights: Weights {
            abx: WEIGHT_ABX,
            sweep: WEIGHT_SWEEP,
            thd: WEIGHT_THD,
            channel: WEIGHT_CHANNEL,
        },
        explanations,
        low_confidence,
    }
}

#[cfg(test)]
mod tests {
    use crate::core::models::{
        AbxResult, ChannelMatchResult, FrPoint, ScoreInput, SweepResult, ThdBandPoint, ThdResult,
    };

    use super::compute;

    #[test]
    fn score_is_in_expected_range() {
        let result = compute(ScoreInput {
            abx_result: AbxResult {
                trials: 12,
                correct: 10,
                p_value: 0.01,
                reliability: 83.3,
                low_confidence: false,
            },
            sweep_result: SweepResult {
                fr_points: vec![FrPoint {
                    frequency_hz: 1000.0,
                    deviation_db: 1.1,
                }],
                deviation_to_target: 1.1,
                confidence: 0.9,
                low_confidence: false,
                notes: vec![],
            },
            thd_result: ThdResult {
                thd_percent_by_band: vec![ThdBandPoint {
                    frequency_hz: 1000.0,
                    thd_percent: 0.3,
                }],
                total_thd_percent: 0.3,
                low_confidence: false,
                notes: vec![],
            },
            channel_result: ChannelMatchResult {
                level_delta_db: 0.3,
                phase_correlation: 0.98,
                match_score: 91.0,
                low_confidence: false,
            },
        });

        assert!((0.0..=100.0).contains(&result.total_score));
        assert_eq!(result.weights.abx, 0.25);
        assert_eq!(result.weights.sweep, 0.35);
    }
}
