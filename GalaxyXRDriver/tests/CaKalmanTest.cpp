// Offline checks for the CA (Singer) linear channel and the maneuver-adaptive
// jerk (2026-10-03). The harness mirrors the CA-full linear path of
// DeviceProvider::HandleDevicePoseUpdated: receipt-clock predict, soft dedup
// of bit-identical repeats (R floored at 5mm, x kalmanDupRScale^2), the
// adaptive jerk fed/applied only on fresh positional samples, and the
// reported-velocity attenuation while the jerk is raised. The rendered
// position adds vrserver's forward prediction p + v_reported * H.
//
// Headset findings this encodes (2026-10-03): fast throws / wrist flicks
// overshoot the stop and snap back at J=4; a constant J=100 removes that but
// shakes badly at rest; Controller Fix Mode Off throws sideways (so the
// filter has to stay and the fix must not cost throw direction).
#include "../src/Driver/CaKalman.h"
#include <algorithm>
#include <array>
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

constexpr double kPi = 3.14159265358979323846;
// driver defaults (Config.h): J=4, P=1.5mm, tau=20ms, exactCov, dup scale 3
constexpr double kJ = 4.0;
constexpr double kPosNoise = 0.0015;
constexpr double kTau = 0.020;
constexpr double kDupScale = 3.0;
constexpr double kVelShrink = 25.0;
// vrserver photon-time prediction horizon assumed for the "rendered" metric
constexpr double kRenderH = 0.035;

double Raised(double t, double t0, double len, double peak) {
    return peak * 0.5 * (1.0 - std::cos(kPi * (t - t0) / len));
}

// a planar path spanned by two orthonormal world vectors, driven by speed(t)
// (m/s) and curvature(t) (1/m)
struct Profile {
    std::function<double(double)> speed;
    std::function<double(double)> curvature;
    double stopT = 1e9;     // true motion has ended
    double peakT = 1e9;     // true speed peak (release = peak + 30ms)
    double freezeFrom = -1; // tracker payload frozen (bit-identical) in [from, to)
    double freezeTo = -1;
};

std::function<double(double)> ThrowSpeed(double peak, double t0, double up, double down) {
    return [=](double t) {
        if (t < t0) return 0.0;
        if (t < t0 + up) return Raised(t, t0, up, peak);
        if (t < t0 + up + down) return peak - Raised(t, t0 + up, down, peak);
        return 0.0;
    };
}

Profile Throw() { return {ThrowSpeed(5.0, 0.30, 0.15, 0.07), [](double) { return 0.0; }, 0.52, 0.45}; }
// overhand arc: same speed profile around a 0.6m arm
Profile ArcThrow() { return {ThrowSpeed(5.0, 0.30, 0.15, 0.07), [](double) { return 1.0 / 0.6; }, 0.52, 0.45}; }
// wrist flick: the controller origin swings ~1 m/s on a ~10cm lever
Profile WristFlick() { return {ThrowSpeed(1.0, 0.30, 0.12, 0.05), [](double) { return 1.0 / 0.10; }, 0.47, 0.42}; }
Profile Rest() { return {[](double) { return 0.0; }, [](double) { return 0.0; }}; }
// slow aiming: 15 cm/s around 5cm
Profile SlowAim() { return {[](double) { return 0.15; }, [](double) { return 1.0 / 0.05; }}; }
// moderate continuous motion: 0.9 m/s around 15cm
Profile Circle() {
    return {[](double t) { return t < 0.2 ? 0.9 * t / 0.2 : 0.9; }, [](double) { return 1.0 / 0.15; }};
}

struct Path {
    double h = 0.0005;
    std::vector<std::array<double, 3>> pts;
    std::array<double, 3> At(double t) const {
        long i = static_cast<long>(t / h);
        if (i < 0) i = 0;
        if (i >= static_cast<long>(pts.size())) i = static_cast<long>(pts.size()) - 1;
        return pts[static_cast<size_t>(i)];
    }
};

Path Integrate(const Profile& prof, double total) {
    // plane basis: u = (0.6, 0.3, 0.74)/|.|, w orthogonal to it
    const double un = std::sqrt(0.6 * 0.6 + 0.3 * 0.3 + 0.74 * 0.74);
    const double u[3] = {0.6 / un, 0.3 / un, 0.74 / un};
    double w[3] = {-u[1], u[0], 0.0};
    const double wn = std::sqrt(w[0] * w[0] + w[1] * w[1]);
    for (double& c : w) c /= wn;
    Path path;
    double a = 0, b = 0, head = 0;
    for (double t = 0; t <= total + 0.3; t += path.h) {
        path.pts.push_back({a * u[0] + b * w[0], a * u[1] + b * w[1], a * u[2] + b * w[2]});
        const double v = prof.speed(t);
        head += v * prof.curvature(t) * path.h;
        a += v * std::cos(head) * path.h;
        b += v * std::sin(head) * path.h;
    }
    return path;
}

struct Config {
    bool adaptive = false;
    double J = kJ;
    double noise = kPosNoise;
    double callbackJitter = 0.05;
    double velShrink = kVelShrink;
};

struct Sample {
    double t;
    double rendered[3];
    double vRep[3];
    double boost;
};

std::vector<Sample> Run(const Profile& prof, const Path& path, const Config& cfg, unsigned seed, double total) {
    std::mt19937 rng(seed);
    std::normal_distribution<double> gauss(0.0, 1.0);
    std::uniform_real_distribution<double> jitter(-1.0, 1.0);

    gxr::AdaptiveJerkParams prm; // driver defaults
    gxr::AdaptiveJerkState aj;
    double p[3] = {0, 0, 0}, v[3] = {0, 0, 0}, a[3] = {0, 0, 0}, P6[3][6];
    for (auto& P : P6) gxr::CaInit(P, 1e-4, 1.0, 2500.0);
    const double R = kPosNoise * kPosNoise;

    const double trackerDt = 1.0 / 120.0, callbackDt = 1.0 / 90.0;
    bool have = false;
    double lastSampleT = -1, lastCallbackT = 0, lastZ[3] = {0, 0, 0};
    double t = 0;
    std::vector<Sample> out;
    while (t < total) {
        t += callbackDt * (1.0 + cfg.callbackJitter * jitter(rng));
        double sampleT = std::floor(t / trackerDt) * trackerDt;
        if (prof.freezeFrom >= 0 && t >= prof.freezeFrom && t < prof.freezeTo) {
            sampleT = std::floor(prof.freezeFrom / trackerDt) * trackerDt;
        }
        double z[3];
        const bool repeat = have && sampleT == lastSampleT;
        const auto truth = path.At(sampleT);
        for (int k = 0; k < 3; k++) {
            const double n = gauss(rng) * cfg.noise;
            z[k] = repeat ? lastZ[k] : truth[k] + n;
        }
        if (!have) {
            for (int k = 0; k < 3; k++) { p[k] = z[k]; lastZ[k] = z[k]; }
            have = true; lastSampleT = sampleT; lastCallbackT = t;
            continue;
        }
        const double dt = t - lastCallbackT;
        lastCallbackT = t;
        const double speed = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        double step2 = 0;
        for (int k = 0; k < 3; k++) step2 += (z[k] - lastZ[k]) * (z[k] - lastZ[k]);
        const bool dupRepeat = step2 < 0.0003 * 0.0003 && speed > 0.5;
        double Rk = R;
        if (dupRepeat) {
            const double floorR = 0.005 * 0.005;
            Rk = (R > floorR ? R : floorR) * kDupScale * kDupScale;
        }
        const bool fresh = cfg.adaptive && !dupRepeat && step2 >= 0.0003 * 0.0003;
        double jStep = fresh ? cfg.J * aj.boost : cfg.J;
        if (jStep > 50000.0) jStep = 50000.0;
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

        Sample s{};
        s.t = t;
        s.boost = aj.boost;
        const double g = cfg.adaptive
            ? gxr::AdaptiveVelocityGain(v, P6[0][3] + P6[1][3] + P6[2][3], aj.boost, cfg.velShrink) : 1.0;
        for (int k = 0; k < 3; k++) {
            s.vRep[k] = v[k] * g;
            s.rendered[k] = p[k] + s.vRep[k] * kRenderH;
        }
        out.push_back(s);
    }
    return out;
}

double Norm(const double x[3]) { return std::sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]); }
double AngleDeg(const double x[3], const double y[3]) {
    const double nx = Norm(x), ny = Norm(y);
    if (nx < 1e-9 || ny < 1e-9) return 180.0;
    double c = (x[0] * y[0] + x[1] * y[1] + x[2] * y[2]) / (nx * ny);
    c = std::max(-1.0, std::min(1.0, c));
    return std::acos(c) * 180.0 / kPi;
}

struct Result {
    double renderedOvershoot = 0; // along the final travel direction, after stopT
    double shake = 0;             // rms frame-to-frame change of (rendered - truth(t+H)), t > measureFrom
    double boostedShare = 0;      // callbacks with boost > 1.5, t > measureFrom
    double releaseDirFd = 0;      // pose-history (5-callback) direction error at peak+30ms
};

Result Mean(const Profile& prof, const Config& cfg, double total = 1.3, double measureFrom = 0.5, int seeds = 20) {
    const Path path = Integrate(prof, total);
    const auto fin = path.At(total + 0.25);
    Result m;
    for (int i = 0; i < seeds; i++) {
        const auto out = Run(prof, path, cfg, 1000u + static_cast<unsigned>(i), total);
        double over = 0;
        if (prof.stopT < 1e8) {
            const auto a = path.At(prof.stopT - 0.02), b = path.At(prof.stopT);
            double d[3] = {b[0] - a[0], b[1] - a[1], b[2] - a[2]};
            const double n = Norm(d);
            for (double& c : d) c /= n;
            for (const auto& s : out) {
                if (s.t <= prof.stopT) continue;
                over = std::max(over, (s.rendered[0] - fin[0]) * d[0] + (s.rendered[1] - fin[1]) * d[1]
                    + (s.rendered[2] - fin[2]) * d[2]);
            }
        }
        double dsum = 0;
        int dn = 0, boosted = 0, counted = 0;
        double prevE[3] = {0, 0, 0};
        bool havePrev = false;
        for (const auto& s : out) {
            if (s.t <= measureFrom) continue;
            const auto tr = path.At(s.t + kRenderH);
            const double e[3] = {s.rendered[0] - tr[0], s.rendered[1] - tr[1], s.rendered[2] - tr[2]};
            if (havePrev) {
                for (int k = 0; k < 3; k++) dsum += (e[k] - prevE[k]) * (e[k] - prevE[k]);
                ++dn;
            }
            for (int k = 0; k < 3; k++) prevE[k] = e[k];
            havePrev = true;
            ++counted;
            if (s.boost > 1.5) ++boosted;
        }
        double relDir = 0;
        if (prof.peakT < 1e8) {
            const double tRel = prof.peakT + 0.030;
            const auto a = path.At(tRel - 0.001), b = path.At(tRel + 0.001);
            const double vt[3] = {(b[0] - a[0]) / 0.002, (b[1] - a[1]) / 0.002, (b[2] - a[2]) / 0.002};
            size_t idx = 0;
            for (size_t j = 0; j < out.size(); j++) {
                if (std::fabs(out[j].t - tRel) < std::fabs(out[idx].t - tRel)) idx = j;
            }
            const size_t j0 = idx >= 4 ? idx - 4 : 0;
            const double span = out[idx].t - out[j0].t;
            double fd[3];
            for (int k = 0; k < 3; k++) fd[k] = (out[idx].rendered[k] - out[j0].rendered[k]) / span;
            relDir = AngleDeg(fd, vt);
        }
        m.renderedOvershoot += over / seeds;
        m.shake += (dn ? std::sqrt(dsum / dn) : 0) / seeds;
        m.boostedShare += (counted ? static_cast<double>(boosted) / counted : 0) / seeds;
        m.releaseDirFd += relDir / seeds;
    }
    return m;
}

// noise-driven shake in a window after the stop: deviation of each run's
// rendered position from the ensemble mean (fixed callback timing), rms of
// its frame-to-frame change. separates sensor-noise shake from the stop's
// own settling motion.
double PostStopShake(const Profile& prof, Config cfg, double from, double to, int seeds = 30) {
    const double total = 1.0;
    cfg.callbackJitter = 0.0;
    const Path path = Integrate(prof, total);
    std::vector<std::vector<Sample>> runs;
    for (int i = 0; i < seeds; i++) runs.push_back(Run(prof, path, cfg, 5000u + static_cast<unsigned>(i), total));
    size_t n = runs[0].size();
    for (const auto& r : runs) n = std::min(n, r.size());
    std::vector<std::array<double, 3>> mean(n, {0, 0, 0});
    for (const auto& r : runs)
        for (size_t i = 0; i < n; i++)
            for (int k = 0; k < 3; k++) mean[i][k] += r[i].rendered[k] / seeds;
    double sum = 0;
    int cnt = 0;
    for (const auto& r : runs) {
        bool havePrev = false;
        double prev[3] = {0, 0, 0};
        for (size_t i = 0; i < n; i++) {
            if (r[i].t <= prof.stopT + from || r[i].t >= prof.stopT + to) continue;
            const double d[3] = {r[i].rendered[0] - mean[i][0], r[i].rendered[1] - mean[i][1], r[i].rendered[2] - mean[i][2]};
            if (havePrev) {
                for (int k = 0; k < 3; k++) sum += (d[k] - prev[k]) * (d[k] - prev[k]);
                ++cnt;
            }
            for (int k = 0; k < 3; k++) prev[k] = d[k];
            havePrev = true;
        }
    }
    return cnt ? std::sqrt(sum / cnt) : 0;
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
    {
        const double slow[3] = {0.05, 0, 0}, fast[3] = {5, 0, 0};
        Check(gxr::AdaptiveVelocityGain(slow, 0.01, 1.0, kVelShrink) == 1.0, "velocity untouched at base J");
        Check(gxr::AdaptiveVelocityGain(slow, 0.01, 25.0, 0.0) == 1.0, "velocity shrink 0 is off");
        Check(gxr::AdaptiveVelocityGain(slow, 0.01, 25.0, kVelShrink) < 0.05, "noise-level velocity is shrunk while boosted");
        Check(gxr::AdaptiveVelocityGain(fast, 0.01, 25.0, kVelShrink) > 0.99, "throw-speed velocity passes while boosted");
        const double g2 = gxr::AdaptiveVelocityGain(slow, 0.01, 2.0, kVelShrink);
        Check(g2 > 0.6 && g2 < 0.7, "shrink fades in over boost 1..4");
    }
}

void Report(const char* name, const Result& base, const Result& adapt) {
    std::printf("%-15s overshoot %6.1f -> %5.1f mm | shake %5.2f -> %5.2f mm | release dir %5.1f -> %5.1f deg | boosted %4.1f%%\n",
        name, base.renderedOvershoot * 1000, adapt.renderedOvershoot * 1000, base.shake * 1000, adapt.shake * 1000,
        base.releaseDirFd, adapt.releaseDirFd, adapt.boostedShare * 100);
}
} // namespace

int main() {
    DetectorUnitChecks();
    Config base, adaptive, j100;
    adaptive.adaptive = true;
    j100.J = 100.0;

    const Result throwB = Mean(Throw(), base), throwA = Mean(Throw(), adaptive);
    Report("throw 5m/s", throwB, throwA);
    Check(throwB.renderedOvershoot > 0.05, "baseline J=4 reproduces the field overshoot (>5cm rendered)");
    Check(throwA.renderedOvershoot < 0.3 * throwB.renderedOvershoot, "adaptive jerk cuts throw-stop overshoot by >70%");

    const Result arcB = Mean(ArcThrow(), base), arcA = Mean(ArcThrow(), adaptive);
    Report("arc throw", arcB, arcA);
    Check(arcA.renderedOvershoot < 0.3 * arcB.renderedOvershoot, "adaptive jerk cuts arc-throw overshoot by >70%");
    Check(arcA.releaseDirFd < arcB.releaseDirFd, "arc throw: release direction (pose history) no worse than J=4");

    const Result wristB = Mean(WristFlick(), base), wristA = Mean(WristFlick(), adaptive);
    Report("wrist flick", wristB, wristA);
    Check(wristA.renderedOvershoot < 0.5 * wristB.renderedOvershoot, "adaptive jerk halves the wrist-flick overshoot");

    Profile frozen = Throw();
    frozen.freezeFrom = 0.40;
    frozen.freezeTo = 0.43; // vrlink repeats at the peak
    const Result frozenB = Mean(frozen, base), frozenA = Mean(frozen, adaptive);
    Report("throw+freeze", frozenB, frozenA);
    Check(frozenA.renderedOvershoot < 0.5 * frozenB.renderedOvershoot, "a repeat run at the peak does not defeat the fix");

    const Result restB = Mean(Rest(), base), restA = Mean(Rest(), adaptive), restJ100 = Mean(Rest(), j100);
    Report("rest", restB, restA);
    std::printf("%-15s constant J=100 shake %5.2f mm\n", "rest", restJ100.shake * 1000);
    Check(restJ100.shake > 4.0 * restB.shake, "constant J=100 shakes >4x at rest (headset finding)");
    Check(restA.boostedShare < 0.01, "rest at the sensor noise floor stays at base J (>99% of callbacks)");
    Check(restA.shake < 1.05 * restB.shake, "rest shake unchanged (<5%)");

    Config noisyB = base, noisyA = adaptive;
    noisyB.noise = noisyA.noise = 2.5 * kPosNoise;
    // a tracker noisier than the configured P: the learned floor needs ~1-2s,
    // so measure the steady state after it has settled
    const Result restNB = Mean(Rest(), noisyB, 5.0, 3.0), restNA = Mean(Rest(), noisyA, 5.0, 3.0);
    Report("rest noise x2.5", restNB, restNA);
    Check(restNA.shake < 1.1 * restNB.shake, "noise 2.5x above the configured P: rest shake within 10%");

    const Result aimB = Mean(SlowAim(), base), aimA = Mean(SlowAim(), adaptive);
    Report("slow aim", aimB, aimA);
    Check(aimA.shake < 1.05 * aimB.shake, "slow aiming shake unchanged (<5%)");

    const Result circB = Mean(Circle(), base), circA = Mean(Circle(), adaptive), circJ100 = Mean(Circle(), j100);
    Report("circle 0.9m/s", circB, circA);
    std::printf("%-15s constant J=100 shake %5.2f mm\n", "circle 0.9m/s", circJ100.shake * 1000);
    Check(circA.shake < 1.5 * circB.shake, "moderate motion shake <1.5x J=4");
    Check(circA.shake < 0.4 * circJ100.shake, "moderate motion shake far below constant J=100");

    const double psB = PostStopShake(Throw(), base, 0.0, 0.1);
    const double psA = PostStopShake(Throw(), adaptive, 0.0, 0.1);
    const double psJ = PostStopShake(Throw(), j100, 0.0, 0.1);
    Config noShrink = adaptive;
    noShrink.velShrink = 0.0;
    const double psN = PostStopShake(Throw(), noShrink, 0.0, 0.1);
    std::printf("%-15s first 100ms after a hard stop: J=4 %.2f, adaptive %.2f (no shrink %.2f), J=100 %.2f mm\n",
        "post-stop shake", psB * 1000, psA * 1000, psN * 1000, psJ * 1000);
    Check(psA < 0.5 * psJ, "after a hard stop the hand shakes less than half of constant J=100");
    Check(psA < 0.6 * psN, "velocity shrink cuts the post-stop shake by >40%");

    std::cout << checks - failures << '/' << checks << " checks passed\n";
    return failures == 0 ? 0 : 1;
}
