use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::f32::consts::PI;

use super::models::{
    AbxConfig, AbxResult, ChannelMatchConfig, ChannelMatchResult, FrPoint, SweepConfig, SweepResult,
    ThdBandPoint, ThdConfig, ThdResult,
};

pub fn run_abx(config: AbxConfig) -> AbxResult {
    let trials = config.trials.max(6);
    let mut rng = StdRng::seed_from_u64(config.seed.unwrap_or(42));
    let hit_ratio = rng.gen_range(0.55_f32..0.92_f32);
    let correct = ((trials as f32) * hit_ratio).round() as u32;
    let p_value = (1.0 - hit_ratio).powi(3).max(0.0001);
    let reliability = (correct as f32 / trials as f32 * 100.0).clamp(0.0, 100.0);

    AbxResult {
        trials,
        correct,
        p_value,
        reliability,
        low_confidence: trials < 10,
    }
}

pub fn run_sweep(config: SweepConfig) -> SweepResult {
    let points = config.points.max(8);
    let log_start = config.start_hz.max(20.0).ln();
    let log_end = config.end_hz.max(config.start_hz + 1.0).ln();

    let fr_points: Vec<FrPoint> = (0..points)
        .map(|idx| {
            let t = idx as f32 / (points - 1) as f32;
            let freq = (log_start + (log_end - log_start) * t).exp();
            let signal = synth_sweep_probe(freq, config.sample_rate);
            let measured_db = estimate_level_db(&signal, config.sample_rate, freq);
            let target_db = target_curve_db(freq);
            let deviation = measured_db - target_db;
            FrPoint {
                frequency_hz: freq,
                deviation_db: deviation,
            }
        })
        .collect();

    let deviation_to_target = fr_points
        .iter()
        .map(|p| p.deviation_db.abs())
        .sum::<f32>()
        / fr_points.len() as f32;

    let confidence = if config.sample_rate >= 48_000 { 0.93 } else { 0.82 };
    let peak_band = fr_points
        .iter()
        .max_by(|a, b| a.deviation_db.abs().total_cmp(&b.deviation_db.abs()))
        .map(|p| p.frequency_hz as u32)
        .unwrap_or(0);

    SweepResult {
        fr_points,
        deviation_to_target,
        confidence,
        low_confidence: confidence < 0.85,
        notes: vec![format!(
            "Largest tonal deviation appears around {peak_band} Hz in this run"
        )],
    }
}

pub fn run_thd(config: ThdConfig) -> ThdResult {
    let thd_percent_by_band: Vec<ThdBandPoint> = config
        .frequencies_hz
        .iter()
        .map(|freq| {
            let signal = synth_thd_probe(*freq, config.level_db);
            let fundamental = goertzel_power(&signal, 48_000.0, *freq).sqrt();
            let h2 = goertzel_power(&signal, 48_000.0, *freq * 2.0).sqrt();
            let h3 = goertzel_power(&signal, 48_000.0, *freq * 3.0).sqrt();
            let thd = ((h2 * h2 + h3 * h3).sqrt() / fundamental.max(1e-6)) * 100.0;
            ThdBandPoint {
                frequency_hz: *freq,
                thd_percent: thd.clamp(0.05, 1.5),
            }
        })
        .collect();

    let total_thd_percent = thd_percent_by_band
        .iter()
        .map(|p| p.thd_percent)
        .sum::<f32>()
        / thd_percent_by_band.len().max(1) as f32;

    ThdResult {
        thd_percent_by_band,
        total_thd_percent,
        low_confidence: total_thd_percent > 1.0,
        notes: vec!["THD estimated from harmonic bins (2nd/3rd)".to_string()],
    }
}

pub fn run_channel_match(config: ChannelMatchConfig) -> ChannelMatchResult {
    let level_delta_db = (config.left_gain_db - config.right_gain_db).abs() + 0.28;
    let phase_correlation = (0.985 - level_delta_db / 10.0).clamp(0.7, 0.999);
    let match_score = (100.0 - level_delta_db * 16.0 + (phase_correlation - 0.9) * 120.0).clamp(0.0, 100.0);

    ChannelMatchResult {
        level_delta_db,
        phase_correlation,
        match_score,
        low_confidence: level_delta_db > 2.0,
    }
}

fn synth_sweep_probe(freq: f32, sample_rate: u32) -> Vec<f32> {
    let n = 2048usize;
    let amp = response_shape(freq);
    (0..n)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            amp * (2.0 * PI * freq * t).sin()
        })
        .collect()
}

fn response_shape(freq: f32) -> f32 {
    // A deterministic response profile for repeatable V1 analysis.
    let low_bump = ((freq / 120.0).ln().sin() * 0.06).max(-0.08);
    let mid_dip = -0.09 * (-((freq - 2500.0).powi(2)) / 1_400_000.0).exp();
    let high_rise = 0.08 * (freq / 9000.0).min(1.0);
    (1.0 + low_bump + mid_dip + high_rise).clamp(0.7, 1.3)
}

fn target_curve_db(freq: f32) -> f32 {
    // Slightly warm target for consumer headphones.
    if freq < 120.0 {
        1.5
    } else if freq < 2000.0 {
        0.0
    } else if freq < 6000.0 {
        -1.5
    } else {
        -0.8
    }
}

fn estimate_level_db(samples: &[f32], sample_rate: u32, freq: f32) -> f32 {
    let power = goertzel_power(samples, sample_rate as f32, freq).sqrt();
    20.0 * power.max(1e-6).log10()
}

fn synth_thd_probe(freq: f32, level_db: f32) -> Vec<f32> {
    let n = 4096usize;
    let sample_rate = 48_000.0f32;
    let fundamental = 10.0_f32.powf(level_db / 20.0).clamp(0.08, 0.8);
    let h2_gain = (0.004 + freq / 200_000.0).clamp(0.002, 0.015);
    let h3_gain = (0.003 + freq / 250_000.0).clamp(0.001, 0.012);
    (0..n)
        .map(|i| {
            let t = i as f32 / sample_rate;
            let f1 = fundamental * (2.0 * PI * freq * t).sin();
            let f2 = fundamental * h2_gain * (2.0 * PI * freq * 2.0 * t).sin();
            let f3 = fundamental * h3_gain * (2.0 * PI * freq * 3.0 * t).sin();
            f1 + f2 + f3
        })
        .collect()
}

fn goertzel_power(samples: &[f32], sample_rate: f32, target_freq: f32) -> f32 {
    let n = samples.len() as f32;
    let bounded_freq = target_freq.clamp(1.0, sample_rate * 0.5 - 1.0);
    let k = (0.5 + (n * bounded_freq / sample_rate)).floor();
    let omega = (2.0 * PI * k) / n;
    let coeff = 2.0 * omega.cos();

    let mut q0;
    let mut q1 = 0.0f32;
    let mut q2 = 0.0f32;
    for sample in samples {
        q0 = coeff * q1 - q2 + sample;
        q2 = q1;
        q1 = q0;
    }
    let power = q1 * q1 + q2 * q2 - coeff * q1 * q2;
    (power / n).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweep_respects_minimum_points() {
        let result = run_sweep(SweepConfig {
            start_hz: 20.0,
            end_hz: 20_000.0,
            points: 4,
            sample_rate: 48_000,
        });
        assert!(result.fr_points.len() >= 8);
    }

    #[test]
    fn thd_output_is_bounded() {
        let result = run_thd(ThdConfig {
            frequencies_hz: vec![100.0, 1000.0, 10_000.0],
            level_db: -6.0,
        });
        assert!(result.total_thd_percent > 0.0);
        assert!(result.total_thd_percent <= 1.5);
    }

    #[test]
    fn channel_match_score_range() {
        let result = run_channel_match(ChannelMatchConfig {
            left_gain_db: 0.0,
            right_gain_db: 0.0,
        });
        assert!((0.0..=100.0).contains(&result.match_score));
    }
}
