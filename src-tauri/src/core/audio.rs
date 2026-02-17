use std::f32::consts::PI;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, SampleFormat, SampleRate, Stream, StreamConfig};

use super::models::{CalibrationSession, DeviceInfo};

#[derive(Debug, Clone)]
pub struct MeasurementSession {
    pub input_device_id: String,
    pub output_device_id: String,
    pub sample_rate: u32,
}

#[derive(Default)]
pub struct AppState {
    pub session: Mutex<Option<MeasurementSession>>,
}

#[derive(Debug, Clone, Copy)]
pub enum OutputChannelMode {
    Both,
    LeftOnly,
    RightOnly,
}

pub fn list_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let mut devices: Vec<DeviceInfo> = Vec::new();

    if let Ok(input_devices) = host.input_devices() {
        for (idx, dev) in input_devices.enumerate() {
            let name = dev.name().unwrap_or_else(|_| format!("Input {idx}"));
            let (channels, rates) = input_caps(&dev);
            devices.push(DeviceInfo {
                id: format!("input::{idx}"),
                name: format!("[IN] {name}"),
                channels,
                supported_sample_rates: rates,
            });
        }
    }

    if let Ok(output_devices) = host.output_devices() {
        for (idx, dev) in output_devices.enumerate() {
            let name = dev.name().unwrap_or_else(|_| format!("Output {idx}"));
            let (channels, rates) = output_caps(&dev);
            devices.push(DeviceInfo {
                id: format!("output::{idx}"),
                name: format!("[OUT] {name}"),
                channels,
                supported_sample_rates: rates,
            });
        }
    }

    devices
}

pub fn set_session(state: &AppState, session: MeasurementSession) -> Result<(), String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "failed to acquire session lock".to_string())?;
    *guard = Some(session);
    Ok(())
}

pub fn get_session(state: &AppState) -> Result<MeasurementSession, String> {
    state
        .session
        .lock()
        .map_err(|_| "failed to acquire session lock".to_string())?
        .clone()
        .ok_or_else(|| "calibration session not initialized; call start_calibration first".to_string())
}

pub fn calibrate_session(session: &MeasurementSession) -> Result<CalibrationSession, String> {
    let noise_samples = play_and_capture_tone(session, 1_000.0, 700, 0.0, OutputChannelMode::Both)?;
    let noise_floor_db = rms_dbfs(&noise_samples);

    let ref_samples = play_and_capture_tone(session, 1_000.0, 700, 0.25, OutputChannelMode::Both)?;
    let ref_level_db = estimate_tone_db(&ref_samples, session.sample_rate, 1_000.0);

    let mut warnings = Vec::new();
    if noise_floor_db > -55.0 {
        warnings.push("Noise floor is high; use quieter environment".to_string());
    }
    if ref_level_db < -45.0 {
        warnings.push("Reference signal is weak; check headphone output and microphone coupling".to_string());
    }

    let status = if warnings.is_empty() {
        "ready".to_string()
    } else {
        "warning".to_string()
    };

    Ok(CalibrationSession {
        ref_level_db,
        noise_floor_db,
        status,
        warnings,
    })
}

pub fn play_and_capture_tone(
    session: &MeasurementSession,
    freq: f32,
    duration_ms: u64,
    amplitude: f32,
    channel_mode: OutputChannelMode,
) -> Result<Vec<f32>, String> {
    let host = cpal::default_host();
    let input = resolve_input_device(&host, &session.input_device_id)?;
    let output = resolve_output_device(&host, &session.output_device_id)?;

    let (input_cfg, input_fmt) = select_input_config(&input, session.sample_rate)?;
    let (output_cfg, output_fmt) = select_output_config(&output, session.sample_rate)?;

    let target_samples = ((input_cfg.sample_rate.0 as u64 * duration_ms) / 1000) as usize;
    let shared_samples = Arc::new(Mutex::new(Vec::<f32>::with_capacity(target_samples + 256)));

    let err_fn = |err| eprintln!("audio stream error: {err}");

    let input_stream = build_input_stream(
        &input,
        &input_cfg,
        input_fmt,
        Arc::clone(&shared_samples),
        target_samples,
        err_fn,
    )?;

    let output_stream = build_output_stream(
        &output,
        &output_cfg,
        output_fmt,
        freq,
        amplitude,
        channel_mode,
        err_fn,
    )?;

    input_stream
        .play()
        .map_err(|e| format!("failed to start input stream: {e}"))?;
    output_stream
        .play()
        .map_err(|e| format!("failed to start output stream: {e}"))?;

    wait_for_capture(&shared_samples, target_samples, duration_ms)?;

    drop(output_stream);
    drop(input_stream);

    let samples = shared_samples
        .lock()
        .map_err(|_| "failed to read captured samples".to_string())?
        .clone();

    if samples.is_empty() {
        return Err("captured audio buffer is empty".to_string());
    }

    Ok(trim_transient(samples))
}

pub fn estimate_tone_db(samples: &[f32], sample_rate: u32, target_freq: f32) -> f32 {
    let amp = goertzel_amplitude(samples, sample_rate as f32, target_freq);
    20.0 * amp.max(1e-8).log10()
}

pub fn estimate_thd_percent(samples: &[f32], sample_rate: u32, fundamental_freq: f32) -> f32 {
    let f1 = goertzel_amplitude(samples, sample_rate as f32, fundamental_freq);
    let f2 = goertzel_amplitude(samples, sample_rate as f32, fundamental_freq * 2.0);
    let f3 = goertzel_amplitude(samples, sample_rate as f32, fundamental_freq * 3.0);
    let thd = ((f2 * f2 + f3 * f3).sqrt() / f1.max(1e-8)) * 100.0;
    thd.clamp(0.0, 100.0)
}

pub fn rms_dbfs(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return -120.0;
    }
    let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
    20.0 * rms.max(1e-8).log10()
}

fn input_caps(device: &cpal::Device) -> (u16, Vec<u32>) {
    if let Ok(default_cfg) = device.default_input_config() {
        let channels = default_cfg.channels();
        let mut rates = vec![default_cfg.sample_rate().0, 44_100, 48_000, 96_000];
        rates.sort_unstable();
        rates.dedup();
        return (channels, rates);
    }
    (1, vec![44_100, 48_000])
}

fn output_caps(device: &cpal::Device) -> (u16, Vec<u32>) {
    if let Ok(default_cfg) = device.default_output_config() {
        let channels = default_cfg.channels();
        let mut rates = vec![default_cfg.sample_rate().0, 44_100, 48_000, 96_000];
        rates.sort_unstable();
        rates.dedup();
        return (channels, rates);
    }
    (2, vec![44_100, 48_000])
}

fn parse_device_id(id: &str, expected_kind: &str) -> Result<usize, String> {
    let mut parts = id.split("::");
    let kind = parts.next().ok_or_else(|| format!("invalid device id: {id}"))?;
    let idx_str = parts.next().ok_or_else(|| format!("invalid device id: {id}"))?;
    if kind != expected_kind {
        return Err(format!("device id kind mismatch: expected {expected_kind}, got {kind}"));
    }
    idx_str
        .parse::<usize>()
        .map_err(|_| format!("invalid device index in id: {id}"))
}

fn resolve_input_device(host: &cpal::Host, id: &str) -> Result<cpal::Device, String> {
    let idx = parse_device_id(id, "input")?;
    host.input_devices()
        .map_err(|e| format!("failed to list input devices: {e}"))?
        .nth(idx)
        .ok_or_else(|| format!("input device not found: {id}"))
}

fn resolve_output_device(host: &cpal::Host, id: &str) -> Result<cpal::Device, String> {
    let idx = parse_device_id(id, "output")?;
    host.output_devices()
        .map_err(|e| format!("failed to list output devices: {e}"))?
        .nth(idx)
        .ok_or_else(|| format!("output device not found: {id}"))
}

fn select_input_config(device: &cpal::Device, desired_sample_rate: u32) -> Result<(StreamConfig, SampleFormat), String> {
    if let Ok(ranges) = device.supported_input_configs() {
        for range in ranges {
            if desired_sample_rate >= range.min_sample_rate().0 && desired_sample_rate <= range.max_sample_rate().0 {
                let cfg = range.with_sample_rate(SampleRate(desired_sample_rate));
                return Ok((
                    StreamConfig {
                        channels: cfg.channels(),
                        sample_rate: cfg.sample_rate(),
                        buffer_size: BufferSize::Default,
                    },
                    cfg.sample_format(),
                ));
            }
        }
    }

    let cfg = device
        .default_input_config()
        .map_err(|e| format!("failed to get default input config: {e}"))?;
    Ok((
        StreamConfig {
            channels: cfg.channels(),
            sample_rate: cfg.sample_rate(),
            buffer_size: BufferSize::Default,
        },
        cfg.sample_format(),
    ))
}

fn select_output_config(device: &cpal::Device, desired_sample_rate: u32) -> Result<(StreamConfig, SampleFormat), String> {
    if let Ok(ranges) = device.supported_output_configs() {
        for range in ranges {
            if desired_sample_rate >= range.min_sample_rate().0 && desired_sample_rate <= range.max_sample_rate().0 {
                let cfg = range.with_sample_rate(SampleRate(desired_sample_rate));
                return Ok((
                    StreamConfig {
                        channels: cfg.channels(),
                        sample_rate: cfg.sample_rate(),
                        buffer_size: BufferSize::Default,
                    },
                    cfg.sample_format(),
                ));
            }
        }
    }

    let cfg = device
        .default_output_config()
        .map_err(|e| format!("failed to get default output config: {e}"))?;
    Ok((
        StreamConfig {
            channels: cfg.channels(),
            sample_rate: cfg.sample_rate(),
            buffer_size: BufferSize::Default,
        },
        cfg.sample_format(),
    ))
}

fn build_input_stream<F>(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    shared_samples: Arc<Mutex<Vec<f32>>>,
    target_samples: usize,
    err_fn: F,
) -> Result<Stream, String>
where
    F: FnMut(cpal::StreamError) + Send + 'static,
{
    let channels = config.channels as usize;

    match format {
        SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _| {
                    if let Ok(mut buffer) = shared_samples.lock() {
                        for frame in data.chunks(channels) {
                            if buffer.len() >= target_samples {
                                break;
                            }
                            buffer.push(frame[0]);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("failed to build f32 input stream: {e}")),
        SampleFormat::I16 => device
            .build_input_stream(
                config,
                move |data: &[i16], _| {
                    if let Ok(mut buffer) = shared_samples.lock() {
                        for frame in data.chunks(channels) {
                            if buffer.len() >= target_samples {
                                break;
                            }
                            buffer.push(frame[0] as f32 / i16::MAX as f32);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("failed to build i16 input stream: {e}")),
        SampleFormat::U16 => device
            .build_input_stream(
                config,
                move |data: &[u16], _| {
                    if let Ok(mut buffer) = shared_samples.lock() {
                        for frame in data.chunks(channels) {
                            if buffer.len() >= target_samples {
                                break;
                            }
                            let v = (frame[0] as f32 / u16::MAX as f32) * 2.0 - 1.0;
                            buffer.push(v);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("failed to build u16 input stream: {e}")),
        _ => Err(format!("unsupported input sample format: {format:?}")),
    }
}

fn build_output_stream<F>(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    freq: f32,
    amplitude: f32,
    channel_mode: OutputChannelMode,
    err_fn: F,
) -> Result<Stream, String>
where
    F: FnMut(cpal::StreamError) + Send + 'static,
{
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate.0 as f32;
    let mut phase = 0.0f32;
    let phase_step = (2.0 * PI * freq) / sample_rate;

    match format {
        SampleFormat::F32 => device
            .build_output_stream(
                config,
                move |data: &mut [f32], _| {
                    for frame in data.chunks_mut(channels) {
                        let sample = (phase.sin() * amplitude).clamp(-1.0, 1.0);
                        phase += phase_step;
                        if phase > 2.0 * PI {
                            phase -= 2.0 * PI;
                        }
                        for (idx, out) in frame.iter_mut().enumerate() {
                            *out = sample * channel_gain(channel_mode, idx, channels);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("failed to build f32 output stream: {e}")),
        SampleFormat::I16 => device
            .build_output_stream(
                config,
                move |data: &mut [i16], _| {
                    for frame in data.chunks_mut(channels) {
                        let sample = (phase.sin() * amplitude).clamp(-1.0, 1.0);
                        phase += phase_step;
                        if phase > 2.0 * PI {
                            phase -= 2.0 * PI;
                        }
                        for (idx, out) in frame.iter_mut().enumerate() {
                            let v = sample * channel_gain(channel_mode, idx, channels);
                            *out = (v * i16::MAX as f32) as i16;
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("failed to build i16 output stream: {e}")),
        SampleFormat::U16 => device
            .build_output_stream(
                config,
                move |data: &mut [u16], _| {
                    for frame in data.chunks_mut(channels) {
                        let sample = (phase.sin() * amplitude).clamp(-1.0, 1.0);
                        phase += phase_step;
                        if phase > 2.0 * PI {
                            phase -= 2.0 * PI;
                        }
                        for (idx, out) in frame.iter_mut().enumerate() {
                            let v = sample * channel_gain(channel_mode, idx, channels);
                            let scaled = ((v * 0.5 + 0.5) * u16::MAX as f32).clamp(0.0, u16::MAX as f32);
                            *out = scaled as u16;
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("failed to build u16 output stream: {e}")),
        _ => Err(format!("unsupported output sample format: {format:?}")),
    }
}

fn wait_for_capture(shared_samples: &Arc<Mutex<Vec<f32>>>, target_samples: usize, duration_ms: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(duration_ms + 1200);
    loop {
        if let Ok(buffer) = shared_samples.lock() {
            if buffer.len() >= target_samples {
                return Ok(());
            }
        }
        if Instant::now() >= deadline {
            return Err("audio capture timeout; check device availability and permissions".to_string());
        }
        thread::sleep(Duration::from_millis(20));
    }
}

fn trim_transient(samples: Vec<f32>) -> Vec<f32> {
    if samples.len() < 64 {
        return samples;
    }
    let head = samples.len() / 10;
    let tail = samples.len() / 10;
    samples[head..samples.len() - tail].to_vec()
}

fn channel_gain(mode: OutputChannelMode, channel_idx: usize, total_channels: usize) -> f32 {
    match mode {
        OutputChannelMode::Both => 1.0,
        OutputChannelMode::LeftOnly => {
            if channel_idx == 0 || total_channels == 1 {
                1.0
            } else {
                0.0
            }
        }
        OutputChannelMode::RightOnly => {
            if channel_idx == 1 || total_channels == 1 {
                1.0
            } else {
                0.0
            }
        }
    }
}

fn goertzel_amplitude(samples: &[f32], sample_rate: f32, target_freq: f32) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let n = samples.len() as f32;
    let bounded_freq = target_freq.clamp(1.0, sample_rate * 0.5 - 1.0);
    let k = (0.5 + (n * bounded_freq / sample_rate)).floor();
    let omega = (2.0 * PI * k) / n;
    let coeff = 2.0 * omega.cos();

    let mut q1 = 0.0f32;
    let mut q2 = 0.0f32;
    for sample in samples {
        let q0 = coeff * q1 - q2 + sample;
        q2 = q1;
        q1 = q0;
    }

    let power = q1 * q1 + q2 * q2 - coeff * q1 * q2;
    (power.max(0.0) / n).sqrt()
}
