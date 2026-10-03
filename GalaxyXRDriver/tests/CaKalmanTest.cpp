// Offline checks for the CA (Singer) linear channel and the maneuver-adaptive
// jerk (2026-10-03). The harness mirrors the CA-full linear path of
// DeviceProvider::HandleDevicePoseUpdated: device-time predict, soft dedup of
// bit-identical repeats (R floored at 5mm, x kalmanDupRScale^2), and the
// adaptive jerk fed/applied only on fresh positional samples. The rendered
// position adds vrserver's forward prediction p + v * H.
#include "../src/Driver/CaKalman.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <iostream>
#include <random>
#include <string>
#include <vector>

namespace {
int checks = 0;
int failures = 0;

void Check(bool condition, const std::string& description) {
    ++checks;
    if (!condition) {
        ++failures;
        std::cerr << "FAIL: " << description << '\n';
    }
}

// driver defaults (Config.h): J=4, P=1.5mm, tau=20ms, exactCov, dup scale 3
constexpr double kJ = 4.0;
constexpr double kPosNoise = 0.0015;
constexpr double kTau = 0.020;
constexpr double kDupScale = 3.0;
// vrserver photon-time prediction horizon assumed for the "rendered" metric
constexpr double kRenderH = 0.035;

struct Profile {
    // true 1D speed along dir at time t (m/s)
    std::function<double(double)> speed;
    double stopT;           // time the true motion has ended
    double dir[3];          // unit direction of travel
    double freezeFrom = -1; // tracker payload frozen (bit-identical) in [from, to)
    double freezeTo = -1;
};

struct Result {
    double stateOvershoot = 0;    // max (p - final) along dir after stopT
    double renderedOvershoot = 0; // max (p + v*H - final) along dir after stopT
    double renderedJitter = 0;    // rms of rendered - truth (rest/aim windows)
    double boostedShare = 0;      // share of callbacks with boost > 1.5
    double maxBoost = 1.0;
};

double Raised(double t, double t0, double len, double peak) {
    return peak * 0.5 * (1.0 - std::cos(3.14159265358979323846 * (t - t0) / len));
}

Profile Throw() {
    Profile p;
    p.speed = [](double t) {
        if (t < 0.30) return 0.0;
        if (t < 0.45) return Raised(t, 0.30, 0.15, 5.0);
        if (t < 0.52) return 5.0 - Raised(t, 0.45, 0.07, 5.0);
        return 0.0;
    };
    p.stopT = 0.52;
    const double n = std::sqrt(0.6 * 0.6 + 0.3 * 0.3 + 0.74 * 0.74);
    p.dir[0] = 0.6 / n; p.dir[1] = 0.3 / n; p.dir[2] = 0.74 / n;
    return p;
}

Profile WristArcStop() {
    // ~10cm lever at ~10 rad/s: the controller origin moves ~1 m/s
    Profile p;
    p.speed = [](double t) {
        if (t < 0.30) return 0.0;
        if (t < 0.42) return Raised(t, 0.30, 0.12, 1.0);
        if (t < 0.47) return 1.0 - Raised(t, 0.42, 0.05, 1.0);
        return 0.0;
    };
    p.stopT = 0.47;
    p.dir[0] = 1; p.dir[1] = 0; p.dir[2] = 0;
    return p;
}

Profile Rest() {
    Profile p;
    p.speed = [](double) { return 0.0; };
    p.stopT = 1e9;
    p.dir[0] = 1; p.dir[1] = 0; p.dir[2] = 0;
    return p;
}

Profile SlowAim() {
    // 3cm amplitude, 0.5 Hz
    Profile p;
    p.speed = [](double t) { return 0.03 * 2 * 3.14159265358979323846 * 0.5 * std::cos(2 * 3.14159265358979323846 * 0.5 * t); };
    p.stopT = 1e9;
    p.dir[0] = 0; p.dir[1] = 1; p.dir[2] = 0;
    return p;
}

Result Run(const Profile& prof, bool adaptive, unsigned seed, double noise = kPosNoise,
    double jitterFrom = 0.5, double total = 1.2) {
    // truth integrated at 0.5ms
    const double h = 0.0005;
    std::vector<double> truth;
    double s = 0;
    for (double t = 0; t <= total + h; t += h) { truth.push_back(s); s += prof.speed(t) * h; }
    auto truthAt = [&](double t) {
        size_t i = static_cast<size_t>(t / h);
        if (i >= truth.size()) i = truth.size() - 1;
        return truth[i];
    };
    const double finalS = truth.back();

    std::mt19937 rng(seed);
    std::normal_distribution<double> gauss(0.0, noise);
    std::uniform_real_distribution<double> jitter(-0.05, 0.05);

    gxr::AdaptiveJerkParams prm; // driver defaults
    gxr::AdaptiveJerkState aj;
    double p[3] = {0, 0, 0}, v[3] = {0, 0, 0}, a[3] = {0, 0, 0}, P6[3][6];
    for (int k = 0; k < 3; k++) gxr::CaInit(P6[k], 0.01, 1.0, 2500.0);
    const double R = kPosNoise * kPosNoise;

    const double trackerDt = 1.0 / 120.0, callbackDt = 1.0 / 90.0;
    bool have = false;
    double lastSampleT = -1, lastMeasT = 0, lastZ[3] = {0, 0, 0};
    double t = 0;
    Result res;
    double jitSum = 0; int jitN = 0; int boosted = 0; int callbacks = 0;
    while (t < total - 0.02) {
        t += callbackDt * (1.0 + jitter(rng));
        double sampleT = std::floor(t / trackerDt) * trackerDt;
        if (prof.freezeFrom >= 0 && t >= prof.freezeFrom && t < prof.freezeTo) {
            sampleT = std::floor(prof.freezeFrom / trackerDt) * trackerDt;
        }
        double z[3];
        const bool repeat = have && sampleT == lastSampleT;
        if (repeat) {
            for (int k = 0; k < 3; k++) z[k] = lastZ[k];
        } else {
            const double st = truthAt(sampleT);
            for (int k = 0; k < 3; k++) z[k] = prof.dir[k] * st + gauss(rng);
        }
        if (!have) {
            for (int k = 0; k < 3; k++) { p[k] = z[k]; lastZ[k] = z[k]; }
            have = true; lastSampleT = sampleT; lastMeasT = t;
            continue;
        }
        // receipt clock between callbacks (a repeat advances the state too)
        double dt = t - lastMeasT;
        lastMeasT = t;
        double speed = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        double step2 = 0;
        for (int k = 0; k < 3; k++) step2 += (z[k] - lastZ[k]) * (z[k] - lastZ[k]);
        const bool dupRepeat = step2 < 0.0003 * 0.0003 && speed > 0.5;
        double Rk = R;
        if (dupRepeat) {
            const double floorR = 0.005 * 0.005;
            Rk = (R > floorR ? R : floorR) * kDupScale * kDupScale;
        }
        const bool fresh = adaptive && !dupRepeat && step2 >= 0.0003 * 0.0003;
        const double jStep = fresh ? kJ * aj.boost : kJ;
        const double beta = std::exp(-dt / kTau);
        double y[3], S[3];
        for (int k = 0; k < 3; k++) {
            gxr::CaStatePredict(dt, kTau, p[k], v[k], a[k]);
            gxr::CaCovPredict(dt, jStep, kTau, beta, true, P6[k]);
            y[k] = z[k] - p[k];
            S[k] = P6[k][0] + R;
            gxr::CaUpdate(y[k], Rk, p[k], v[k], a[k], P6[k]);
        }
        if (fresh) gxr::AdaptiveJerkObserve(aj, prm, t, y, S);
        if (!repeat) { lastSampleT = sampleT; for (int k = 0; k < 3; k++) lastZ[k] = z[k]; }

        ++callbacks;
        if (aj.boost > 1.5 && t > jitterFrom) ++boosted;
        if (aj.boost > res.maxBoost) res.maxBoost = aj.boost;
        double along = 0, alongV = 0;
        for (int k = 0; k < 3; k++) { along += p[k] * prof.dir[k]; alongV += v[k] * prof.dir[k]; }
        const double rendered = along + alongV * kRenderH;
        if (t > prof.stopT) {
            res.stateOvershoot = std::max(res.stateOvershoot, along - finalS);
            res.renderedOvershoot = std::max(res.renderedOvershoot, rendered - finalS);
        }
        if (t > jitterFrom) {
            // rendered vs the truth it predicts (t + H)
            double e2 = 0;
            const double tr = truthAt(t + kRenderH);
            for (int k = 0; k < 3; k++) {
                const double e = p[k] + v[k] * kRenderH - prof.dir[k] * tr;
                e2 += e * e;
            }
            jitSum += e2; ++jitN;
        }
    }
    res.renderedJitter = jitN ? std::sqrt(jitSum / jitN) : 0;
    res.boostedShare = callbacks ? static_cast<double>(boosted) / callbacks : 0;
    return res;
}

Result Mean(const Profile& prof, bool adaptive, double noise = kPosNoise,
    double jitterFrom = 0.5, double total = 1.2) {
    Result m;
    const int n = 20;
    for (int i = 0; i < n; i++) {
        Result r = Run(prof, adaptive, 1000u + i, noise, jitterFrom, total);
        m.stateOvershoot += r.stateOvershoot / n;
        m.renderedOvershoot += r.renderedOvershoot / n;
        m.renderedJitter += r.renderedJitter / n;
        m.boostedShare += r.boostedShare / n;
        m.maxBoost = std::max(m.maxBoost, r.maxBoost);
    }
    return m;
}

void Report(const char* name, const Result& base, const Result& adapt) {
    std::printf("%-14s base: state %6.1fmm rendered %6.1fmm jitter %5.2fmm | adaptive: state %6.1fmm rendered %6.1fmm jitter %5.2fmm boosted %4.1f%% max x%.1f\n",
        name, base.stateOvershoot * 1000, base.renderedOvershoot * 1000, base.renderedJitter * 1000,
        adapt.stateOvershoot * 1000, adapt.renderedOvershoot * 1000, adapt.renderedJitter * 1000,
        adapt.boostedShare * 100, adapt.maxBoost);
}

void DetectorUnitChecks() {
    gxr::AdaptiveJerkParams prm;
    const double S[3] = {1, 1, 1};
    {
        gxr::AdaptiveJerkState s;
        const double big[3] = {4, 0, 0};
        gxr::AdaptiveJerkObserve(s, prm, 0.000, big, S);
        Check(s.boost == 1.0, "one large innovation alone does not engage");
        gxr::AdaptiveJerkObserve(s, prm, 0.010, big, S);
        Check(s.boost > 2.0, "two same-direction large innovations engage");
        Check(s.boost <= prm.maxBoost, "boost is capped");
        const double small[3] = {0.1, 0, 0};
        const double before = s.boost;
        gxr::AdaptiveJerkObserve(s, prm, 0.010 + prm.releaseSec, small, S);
        const double expected = 1.0 + (before - 1.0) * std::exp(-1.0);
        Check(std::fabs(s.boost - expected) < 1e-9, "boost relaxes with the release time constant");
        gxr::AdaptiveJerkObserve(s, prm, 2.0, small, S);
        Check(std::fabs(s.boost - 1.0) < 1e-6, "boost returns to 1 without evidence");
    }
    {
        gxr::AdaptiveJerkState s;
        const double plus[3] = {4, 0, 0}, minus[3] = {-4, 0, 0};
        for (int i = 0; i < 10; i++) {
            gxr::AdaptiveJerkObserve(s, prm, 0.01 * i, (i % 2) ? minus : plus, S);
        }
        Check(s.boost == 1.0, "alternating-direction (noise-like) innovations never engage");
    }
    {
        // a noisier tracker raises the floor and stops engaging on noise
        gxr::AdaptiveJerkState s;
        std::mt19937 rng(7);
        std::normal_distribution<double> g(0.0, 2.5);
        for (int i = 0; i < 400; i++) {
            const double y[3] = {g(rng), g(rng), g(rng)};
            gxr::AdaptiveJerkObserve(s, prm, 0.01 * i, y, S);
        }
        Check(s.noiseFloor > 3.0 && s.noiseFloor < 9.0, "noise floor learns a 2.5x noisier tracker (~6.25)");
        Check(s.boost < 1.5, "learned floor keeps a noisy rest at base J");
    }
    {
        gxr::AdaptiveJerkParams off = prm;
        off.maxBoost = 1.0;
        gxr::AdaptiveJerkState s;
        const double big[3] = {10, 10, 10};
        for (int i = 0; i < 5; i++) gxr::AdaptiveJerkObserve(s, off, 0.01 * i, big, S);
        Check(s.boost == 1.0, "Max 1 disables the boost");
    }
    {
        gxr::AdaptiveJerkState s;
        const double huge[3] = {1000, 0, 0};
        for (int i = 0; i < 5; i++) gxr::AdaptiveJerkObserve(s, prm, 0.01 * i, huge, S);
        Check(s.boost == prm.maxBoost, "huge innovations saturate at Max");
        s.noiseFloor = 4.0;
        s.Reset();
        Check(s.boost == 1.0 && s.hits == 0 && !s.haveT, "Reset clears the detector");
        Check(s.noiseFloor == 4.0, "Reset keeps the learned tracker noise floor");
    }
}
} // namespace

int main() {
    DetectorUnitChecks();

    const Result throwBase = Mean(Throw(), false), throwAdapt = Mean(Throw(), true);
    Report("throw 5m/s", throwBase, throwAdapt);
    Check(throwBase.renderedOvershoot > 0.05, "baseline J=4 reproduces the field overshoot (>5cm rendered)");
    Check(throwAdapt.renderedOvershoot < 0.4 * throwBase.renderedOvershoot, "adaptive jerk cuts throw-stop overshoot by >60%");
    Check(throwAdapt.stateOvershoot < 0.4 * throwBase.stateOvershoot, "adaptive jerk cuts the state overshoot by >60%");

    const Result wristBase = Mean(WristArcStop(), false), wristAdapt = Mean(WristArcStop(), true);
    Report("wrist 1m/s", wristBase, wristAdapt);
    Check(wristAdapt.renderedOvershoot < 0.5 * wristBase.renderedOvershoot, "adaptive jerk halves the wrist-arc overshoot");

    Profile frozen = Throw();
    frozen.freezeFrom = 0.40; frozen.freezeTo = 0.43; // vrlink repeats at the peak
    const Result frozenBase = Mean(frozen, false), frozenAdapt = Mean(frozen, true);
    Report("throw+freeze", frozenBase, frozenAdapt);
    Check(frozenAdapt.renderedOvershoot < 0.5 * frozenBase.renderedOvershoot, "a repeat run at the peak does not defeat the fix");

    const Result restBase = Mean(Rest(), false), restAdapt = Mean(Rest(), true);
    Report("rest", restBase, restAdapt);
    Check(restAdapt.boostedShare < 0.01, "rest at the sensor noise floor stays at base J (>99% of callbacks)");
    Check(restAdapt.renderedJitter < 1.05 * restBase.renderedJitter, "rest jitter unchanged (<5%)");

    // a tracker noisier than the configured P: the learned floor needs ~1-2s
    const Result restNoisyBase = Mean(Rest(), false, 2.5 * kPosNoise, 3.0, 5.0);
    const Result restNoisyAdapt = Mean(Rest(), true, 2.5 * kPosNoise, 3.0, 5.0);
    Report("rest noise x2.5", restNoisyBase, restNoisyAdapt);
    Check(restNoisyAdapt.boostedShare < 0.02, "noise 2.5x above the configured P: rest stays at base J once the floor is learned");
    Check(restNoisyAdapt.renderedJitter < 1.05 * restNoisyBase.renderedJitter, "noise 2.5x above the configured P: rest jitter unchanged (<5%)");

    const Result aimBase = Mean(SlowAim(), false), aimAdapt = Mean(SlowAim(), true);
    Report("slow aim", aimBase, aimAdapt);
    Check(aimAdapt.renderedJitter < 1.05 * aimBase.renderedJitter, "slow aiming error unchanged (<5%)");

    std::cout << checks - failures << '/' << checks << " checks passed\n";
    return failures == 0 ? 0 : 1;
}
