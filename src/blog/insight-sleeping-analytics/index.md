---
title: "Insight Sleep Analytics: Understanding Your Night Report and Comfort Score"
date: 2026-06-17
published: true
locale: "en"
cover_image: ./images/cover.webp
description: "A guide to Insight Sleep Analytics: how night reports are generated, how the comfort score works, and the scientific basis behind the model."
abstract: "Insight Sleep Analytics transforms bedroom environmental data (CO₂, temperature, humidity, PM2.5, and noise) into a nightly comfort report and score based on research-informed thresholds."
tags: []
author: ""
----------

Your bedroom environment changes throughout the night — often in ways you don’t notice. Insight Sleep Analytics turns those subtle changes into a simple morning summary of how comfortable your sleep environment was.

The system evaluates:

* CO₂ concentration
* Temperature
* Humidity
* PM2.5 (when available)
* Noise level (when available)

It then produces a **Night Report** and a **Comfort Score** that reflects overall environmental conditions during sleep.

> The Sleep Score reflects environmental comfort, not sleep stages or medical sleep quality.

---

## Your Night Report at a Glance

<div class="grid">

![Altruist insight with night analytics screen](./images/black.webp)
![Altruist insight with night analytics screen](./images/pink.webp)

</div>

The Sleep Analytics screen includes:

| Element          | Meaning                                        |
| ---------------- | ---------------------------------------------- |
| Large ring score | Overall comfort score (general model)          |
| Biohacking score | Stricter comfort model with tighter thresholds |
| Metric cards     | Night averages for each sensor                 |

---

## How Data Is Collected

Insight continuously reads environmental sensors:

- Temperature
- Humidity
- CO₂

If Urban is enabled:

- PM2.5 particles
- Noise level

Instead of storing raw high-frequency data, Insight computes **hourly averages**, which are stored locally in device memory.

```mermaid id="flow1"
flowchart LR
    Sensors[Sensors] --> Hourly[Hourly averages]
    Hourly --> Storage[Local storage (~48h)]
    Storage --> Night[Night window]
    Night --> Score[Comfort Score]
```

No SD card is required — all required history is stored internally.

---

## Defining the Night Window

The night period is configurable in the web interface:

- **Start (default):** 22:00
- **End (default):** 07:00 (exclusive)

This defines a typical sleep window of ~9 hours.

Special cases:

- If start = end → 24/7 mode
- If the night crosses midnight → data is automatically combined across two calendar days

---

## When a Night Report is Generated

A report is only generated when enough data is available:

```id="rule1"
required_hours = ⌈2/3 × night_length⌉
```

For a 9-hour night:

- Minimum required data: **6 hours**

If insufficient data is available, the system shows:

> Night data is collecting

along with the available / expected hours.

---

## How Night Averages are Calculated

Insight does not evaluate raw sensor spikes. Instead:

1. Sensor data is averaged per hour
2. Only hours within the night window are selected
3. A simple arithmetic mean is computed per metric

This ensures stable and robust nightly values.

---

## The Comfort Score System

Insight converts environmental conditions into a single score from **0 to 100**. There are two models:

### 1. Conservative Model

Designed for general users and broader comfort ranges.

### 2. Biohacking Model

Uses stricter thresholds for optimization-focused users.

<br>
Both models work in a similar way.

Your score starts at **100**, which represents ideal sleeping conditions. Each environmental factor (such as CO₂, temperature, humidity, noise, and PM2.5) can slightly reduce this score when it moves away from its comfort range.

All of these small effects are combined into a single total “comfort impact”, which is then applied to the final score.

In simple terms:

> **Score = 100 − total discomfort (scaled)**

```id="score1"
score = clamp(100 + 2 × Σ(impact), 0, 100)
```

---

## How Each Metric Affects the Score

Each environmental factor contributes independently to the final score.

### CO₂ (Air Quality)

Elevated CO₂ levels are associated with reduced sleep quality and increased nighttime arousals.

| Model        | Threshold | Impact              |
| ------------ | --------- | ------------------- |
| Conservative | 750 ppm   | −0.52% per +100 ppm |
| Biohacking   | 600 ppm   | −0.80% per +100 ppm |

**Research basis:**
Controlled indoor studies show reduced deep sleep at elevated CO₂ levels (~2000 ppm conditions).

---

### PM2.5 (Air Particles)

Fine particles are linked to inflammation and reduced sleep efficiency.

| Model        | Threshold | Impact              |
| ------------ | --------- | ------------------- |
| Conservative | 5 µg/m³   | −0.3% per +10 µg/m³ |
| Biohacking   | 3 µg/m³   | −0.5% per +10 µg/m³ |

**Research basis:**
WHO Air Quality Guidelines (2021), respiratory inflammation studies.

---

### Noise

Night noise contributes to micro-arousals even when not consciously perceived.

| Model        | Threshold | Impact           |
| ------------ | --------- | ---------------- |
| Conservative | 35 dB     | −2.5% per +10 dB |
| Biohacking   | 30 dB     | −3.5% per +10 dB |

**Research basis:**
WHO Environmental Noise Guidelines and sleep arousal literature.

---

### Temperature

Thermal conditions strongly influence sleep onset and continuity.

| Model | Threshold     | Impact                         |
| ----- | ------------- | ------------------------------ |
| Both  | +25°C / +20°C | −1.5% per +1°C above threshold |

**Research basis:**
Sleep thermoregulation studies (Walker, WHOOP datasets, PMC research).

---

### Humidity

Humidity affects airway comfort and perceived air quality.

| Model        | Range  | Impact                      |
| ------------ | ------ | --------------------------- |
| Conservative | 40–60% | −0.2% per 10% outside range |
| Biohacking   | 40–50% | −0.4% per 10% outside range |

**Research basis:**
EPA indoor air quality recommendations and respiratory comfort literature.

---

## Example

If your average CO₂ is 900 ppm:

- Deviation above threshold (conservative): +150 ppm
- Impact ≈ −0.52 × 1.5 = −0.78%

This is then combined with other metrics to form the final score.

A score of **100** means all metrics stayed within ideal comfort ranges.

---

## How Scores Are Interpreted

- **90–100:** Excellent environmental conditions
- **70–90:** Good, minor deviations
- **50–70:** Noticeable environmental stress
- **<50:** Significant comfort issues

The score is designed as a **feedback signal**, not a medical metric.

---

## Configuration

![Altruist insight web-interface with night analytics configuration](./images/2.webp)

In the web interface you can configure:

- Night start/end times
- Urban sensor integration

---

## Important Limitations

- The device does not measure sleep stages or brain activity
- Short spikes may not significantly affect hourly averages
- First-night data may be incomplete due to buffer initialization
- The score is a sleep environment comfort signal, not a clinical assessment

---

## Summary

Insight Sleep Analytics converts environmental conditions into a unified comfort score using research-informed thresholds and a weighted impact model.

It is still evolving. The model, thresholds, and experience will continue to be refined as we learn from real-world use.

If you’re using Insight, your [feedback](https://github.com/airalab/altruist-firmware/issues) helps shape what comes next.

Try the device: [Insight](https://cyberpunks.shop/altruist-insight)
