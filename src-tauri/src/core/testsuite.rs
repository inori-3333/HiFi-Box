use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::thread;
use std::time::Duration;

use super::audio::{self, MeasurementSession, OutputChannelMode};
use super::models::{
    AbxConfig, AbxResult, ChannelAcquisitionConfig, ChannelMatchConfig, ChannelMatchResult, FrPoint,
    SweepAcquisitionConfig, SweepConfig, SweepResult, ThdAcquisitionConfig, ThdBandPoint, ThdConfig, ThdResult,
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

pub fn run_sweep(config: SweepConfig, session: Option<&MeasurementSession>) -> Result<SweepResult, String> {
    if let Some(session) = session {
        return run_sweep_hardware(config, session);
    }
    Ok(run_sweep_sim(config))
}

pub fn run_thd(config: ThdConfig, session: Option<&MeasurementSession>) -> Result<ThdResult, String> {
    if let Some(session) = session {
        return run_thd_hardware(config, session);
    }
    Ok(run_thd_sim(config))
}

pub fn run_channel_match(
    config: ChannelMatchConfig,
    session: Option<&MeasurementSession>,
) -> Result<ChannelMatchResult, String> {
    if let Some(session) = session {
        return run_channel_match_hardware(config, session);
    }
    Ok(run_channel_match_sim(config))
}

fn run_sweep_hardware(config: SweepConfig, session: &MeasurementSession) -> Result<SweepResult, String> {
    let acq = resolve_sweep_acq(config.acquisition);
    let points = config.points.max(8);
    let log_start = config.start_hz.max(20.0).ln();
    let log_end = config.end_hz.max(config.start_hz + 1.0).ln();

    let ref_freq = 1_000.0f32;
    let ref_samples = audio::play_and_capture_tone(
        session,
        ref_freq,
        acq.tone_duration_ms,
        acq.tone_amplitude,
        OutputChannelMode::Both,
    )?;
    let measured_ref_db = audio::estimate_tone_db(&ref_samples, session.sample_rate, ref_freq);
    let target_ref_db = target_curve_db(ref_freq);

    let mut fr_points = Vec::with_capacity(points);
    for idx in 0..points {
        let t = idx as f32 / (points - 1) as f32;
        let freq = (log_start + (log_end - log_start) * t).exp();

        let samples = audio::play_and_capture_tone(
            session,
            freq,
            acq.tone_duration_ms,
            acq.tone_amplitude,
            OutputChannelMode::Both,
        )?;
        let measured_rel_db = audio::estimate_tone_db(&samples, session.sample_rate, freq) - measured_ref_db;
        let target_rel_db = target_curve_db(freq) - target_ref_db;
        fr_points.push(FrPoint {
            frequency_hz: freq,
            deviation_db: measured_rel_db - target_rel_db,
        });
        if acq.inter_tone_pause_ms > 0 {
            thread::sleep(Duration::from_millis(acq.inter_tone_pause_ms));
        }
    }

    let deviation_to_target = fr_points.iter().map(|p| p.deviation_db.abs()).sum::<f32>() / fr_points.len() as f32;
    let peak_band = fr_points
        .iter()
        .max_by(|a, b| a.deviation_db.abs().total_cmp(&b.deviation_db.abs()))
        .map(|p| p.frequency_hz as u32)
        .unwrap_or(0);

    let confidence = (1.0 - (deviation_to_target / 20.0)).clamp(0.45, 0.98);

    Ok(SweepResult {
        fr_points,
        deviation_to_target,
        confidence,
        low_confidence: confidence < 0.75,
        notes: vec![format!("Hardware sweep measured, max deviation around {peak_band} Hz")],
    })
}

fn run_thd_hardware(config: ThdConfig, session: &MeasurementSession) -> Result<ThdResult, String> {
    let acq = resolve_thd_acq(config.acquisition);
    let mut thd_percent_by_band = Vec::with_capacity(config.frequencies_hz.len());

    for freq in &config.frequencies_hz {
        let samples = audio::play_and_capture_tone(
            session,
            *freq,
            acq.tone_duration_ms,
            acq.tone_amplitude,
            OutputChannelMode::Both,
        )?;
        let thd = audio::estimate_thd_percent(&samples, session.sample_rate, *freq).clamp(0.05, 10.0);
        thd_percent_by_band.push(ThdBandPoint {
            frequency_hz: *freq,
            thd_percent: thd,
        });
        if acq.inter_tone_pause_ms > 0 {
            thread::sleep(Duration::from_millis(acq.inter_tone_pause_ms));
        }
    }

    let total_thd_percent = thd_percent_by_band.iter().map(|p| p.thd_percent).sum::<f32>()
        / thd_percent_by_band.len().max(1) as f32;

    Ok(ThdResult {
        thd_percent_by_band,
        total_thd_percent,
        low_confidence: total_thd_percent > 3.0,
        notes: vec!["THD calculated from captured harmonic energy".to_string()],
    })
}

fn run_channel_match_hardware(
    config: ChannelMatchConfig,
    session: &MeasurementSession,
) -> Result<ChannelMatchResult, String> {
    let acq = resolve_channel_acq(config.acquisition.clone());
    let left_samples = audio::play_and_capture_tone(
        session,
        1_000.0,
        acq.tone_duration_ms,
        acq.tone_amplitude,
        OutputChannelMode::LeftOnly,
    )?;
    if acq.inter_channel_pause_ms > 0 {
        thread::sleep(Duration::from_millis(acq.inter_channel_pause_ms));
    }
    let right_samples = audio::play_and_capture_tone(
        session,
        1_000.0,
        acq.tone_duration_ms,
        acq.tone_amplitude,
        OutputChannelMode::RightOnly,
    )?;

    let left_db = audio::estimate_tone_db(&left_samples, session.sample_rate, 1_000.0) + config.left_gain_db;
    let right_db = audio::estimate_tone_db(&right_samples, session.sample_rate, 1_000.0) + config.right_gain_db;

    let level_delta_db = (left_db - right_db).abs();
    let phase_correlation = (0.985 - level_delta_db / 10.0).clamp(0.7, 0.999);
    let match_score = (100.0 - level_delta_db * 16.0 + (phase_correlation - 0.9) * 120.0).clamp(0.0, 100.0);

    Ok(ChannelMatchResult {
        level_delta_db,
        phase_correlation,
        match_score,
        low_confidence: level_delta_db > 2.0,
    })
}

fn run_sweep_sim(config: SweepConfig) -> SweepResult {
    let points = config.points.max(8);
    let log_start = config.start_hz.max(20.0).ln();
    let log_end = config.end_hz.max(config.start_hz + 1.0).ln();

    let fr_points: Vec<FrPoint> = (0..points)
        .map(|idx| {
            let t = idx as f32 / (points - 1) as f32;
            let freq = (log_start + (log_end - log_start) * t).exp();
            let deviation = (freq / 1_600.0).log10().sin() * 2.3 + (t - 0.5) * 0.7;
            FrPoint {
                frequency_hz: freq,
                deviation_db: deviation,
            }
        })
        .collect();

    let deviation_to_target = fr_points.iter().map(|p| p.deviation_db.abs()).sum::<f32>() / fr_points.len() as f32;

    SweepResult {
        fr_points,
        deviation_to_target,
        confidence: 0.88,
        low_confidence: false,
        notes: vec!["Simulation mode used (hardware session missing)".to_string()],
    }
}

fn run_thd_sim(config: ThdConfig) -> ThdResult {
    let thd_percent_by_band: Vec<ThdBandPoint> = config
        .frequencies_hz
        .iter()
        .map(|freq| ThdBandPoint {
            frequency_hz: *freq,
            thd_percent: (0.15 + freq.log10() / 40.0).clamp(0.05, 1.2),
        })
        .collect();

    let total_thd_percent = thd_percent_by_band.iter().map(|p| p.thd_percent).sum::<f32>()
        / thd_percent_by_band.len().max(1) as f32;

    ThdResult {
        thd_percent_by_band,
        total_thd_percent,
        low_confidence: false,
        notes: vec!["Simulation mode used (hardware session missing)".to_string()],
    }
}

fn run_channel_match_sim(config: ChannelMatchConfig) -> ChannelMatchResult {
    let level_delta_db = (config.left_gain_db - config.right_gain_db).abs() + 0.28;
    let phase_correlation = (0.985 - level_delta_db / 10.0).clamp(0.7, 0.999);
    let match_score = (100.0 - level_delta_db * 16.0 + (phase_correlation - 0.9) * 120.0).clamp(0.0, 100.0);

    ChannelMatchResult {
        level_delta_db,
        phase_correlation,
        match_score,
        low_confidence: false,
    }
}

fn target_curve_db(freq: f32) -> f32 {
    if freq < 120.0 {
        1.5
    } else if freq < 2_000.0 {
        0.0
    } else if freq < 6_000.0 {
        -1.5
    } else {
        -0.8
    }
}

fn resolve_sweep_acq(input: Option<SweepAcquisitionConfig>) -> SweepAcquisitionConfig {
    let cfg = input.unwrap_or(SweepAcquisitionConfig {
        tone_duration_ms: 180,
        tone_amplitude: 0.22,
        inter_tone_pause_ms: 20,
    });
    SweepAcquisitionConfig {
        tone_duration_ms: cfg.tone_duration_ms.clamp(80, 2000),
        tone_amplitude: cfg.tone_amplitude.clamp(0.02, 0.85),
        inter_tone_pause_ms: cfg.inter_tone_pause_ms.min(1000),
    }
}

fn resolve_thd_acq(input: Option<ThdAcquisitionConfig>) -> ThdAcquisitionConfig {
    let cfg = input.unwrap_or(ThdAcquisitionConfig {
        tone_duration_ms: 260,
        tone_amplitude: 0.24,
        inter_tone_pause_ms: 20,
    });
    ThdAcquisitionConfig {
        tone_duration_ms: cfg.tone_duration_ms.clamp(100, 2000),
        tone_amplitude: cfg.tone_amplitude.clamp(0.02, 0.85),
        inter_tone_pause_ms: cfg.inter_tone_pause_ms.min(1000),
    }
}

fn resolve_channel_acq(input: Option<ChannelAcquisitionConfig>) -> ChannelAcquisitionConfig {
    let cfg = input.unwrap_or(ChannelAcquisitionConfig {
        tone_duration_ms: 220,
        tone_amplitude: 0.22,
        inter_channel_pause_ms: 30,
    });
    ChannelAcquisitionConfig {
        tone_duration_ms: cfg.tone_duration_ms.clamp(100, 2000),
        tone_amplitude: cfg.tone_amplitude.clamp(0.02, 0.85),
        inter_channel_pause_ms: cfg.inter_channel_pause_ms.min(1000),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweep_respects_minimum_points() {
        let result = run_sweep_sim(SweepConfig {
            start_hz: 20.0,
            end_hz: 20_000.0,
            points: 4,
            sample_rate: 48_000,
            acquisition: None,
        });
        assert!(result.fr_points.len() >= 8);
    }

    #[test]
    fn thd_output_is_bounded() {
        let result = run_thd_sim(ThdConfig {
            frequencies_hz: vec![100.0, 1_000.0, 10_000.0],
            level_db: -6.0,
            acquisition: None,
        });
        assert!(result.total_thd_percent > 0.0);
        assert!(result.total_thd_percent <= 1.2);
    }

    #[test]
    fn channel_match_score_range() {
        let result = run_channel_match_sim(ChannelMatchConfig {
            left_gain_db: 0.0,
            right_gain_db: 0.0,
            acquisition: None,
        });
        assert!((0.0..=100.0).contains(&result.match_score));
    }
}
