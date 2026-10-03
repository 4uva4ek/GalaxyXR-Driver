// Offline checks for the Kalman CA stop brake (Driver/StopBrake.h).
#include "../src/Driver/StopBrake.h"
#include <cmath>
#include <iostream>
#include <string>

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
double Norm(const double v[3]) { return std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
void QuatAboutZ(double angle, double q[4]) { q[0] = std::cos(0.5 * angle); q[1] = 0; q[2] = 0; q[3] = std::sin(0.5 * angle); }
} // namespace

int main() {
    const double dt = 1.0 / 90.0;
    {
        // samples moving at 1 m/s, filter believes 1 m/s: nothing to brake
        gxr::StopBrakeRing ring;
        double v[3] = {1.0, 0, 0}, a[3] = {0, 0, 0}, off = 0;
        for (int i = 0; i < 6; i++) { const double p[3] = {i * dt * 1.0, 0, 0}; off += gxr::StopBrakeLinear(ring, i * dt, p, v, a); }
        Check(off == 0 && std::fabs(v[0] - 1.0) < 1e-12, "steady motion is left alone");
    }
    {
        // the filter lags an acceleration (samples faster than the state): never sped up
        gxr::StopBrakeRing ring;
        double v[3] = {0.5, 0, 0}, a[3] = {3.0, 0, 0};
        for (int i = 0; i < 6; i++) { const double p[3] = {i * dt * 2.0, 0, 0}; gxr::StopBrakeLinear(ring, i * dt, p, v, a); }
        Check(std::fabs(v[0] - 0.5) < 1e-12 && a[0] == 3.0, "the brake never raises the velocity");
    }
    {
        // the hand has stopped, the filter still coasts at 1.5 m/s with a forward acceleration
        gxr::StopBrakeRing ring;
        double v[3] = {1.5, 0, 0}, a[3] = {4.0, 1.0, 0};
        for (int i = 0; i < 3; i++) { const double p[3] = {0.3 + 1e-5 * i, 0, 0}; gxr::StopBrakeLinear(ring, i * dt, p, v, a); }
        Check(Norm(v) < 0.01, "a stopped hand stops the filter");
        Check(a[0] <= 0 && a[1] == 1.0, "only the forward part of the acceleration is dropped");
    }
    {
        // samples going backwards along the state's direction: stop, do not reverse
        gxr::StopBrakeRing ring;
        double v[3] = {1.0, 0, 0}, a[3] = {0, 0, 0};
        for (int i = 0; i < 3; i++) { const double p[3] = {-i * dt * 1.0, 0, 0}; gxr::StopBrakeLinear(ring, i * dt, p, v, a); }
        Check(v[0] == 0 && v[1] == 0 && v[2] == 0, "never reversed");
    }
    {
        // sideways sample motion does not turn the state: only its length changes
        gxr::StopBrakeRing ring;
        double v[3] = {1.0, 1.0, 0}, a[3] = {0, 0, 0};
        for (int i = 0; i < 3; i++) { const double p[3] = {i * dt * 0.5, 0, 0}; gxr::StopBrakeLinear(ring, i * dt, p, v, a); }
        Check(std::fabs(v[0] - v[1]) < 1e-12 && std::fabs(Norm(v) - 0.5 / std::sqrt(2.0)) < 1e-9, "direction kept, speed cut to the samples' along-track speed");
    }
    {
        // a gap restarts the ring: no secant across missing samples
        gxr::StopBrakeRing ring;
        double v[3] = {1.0, 0, 0}, a[3] = {0, 0, 0};
        const double p0[3] = {0, 0, 0}, p1[3] = {0, 0, 0}, p2[3] = {0, 0, 0};
        gxr::StopBrakeLinear(ring, 0.0, p0, v, a);
        gxr::StopBrakeLinear(ring, dt, p1, v, a);
        gxr::StopBrakeLinear(ring, dt + 0.2, p2, v, a);
        Check(v[0] == 1.0 && ring.n == 1, "a 200ms gap restarts the ring instead of braking");
    }
    {
        // wrist: samples turn at 2 rad/s about z, filter believes 10 rad/s
        gxr::StopBrakeRing ring;
        double w[3] = {0, 0, 10.0}, aw[3] = {0, 0, 50.0};
        for (int i = 0; i < 3; i++) { double q[4]; QuatAboutZ(2.0 * i * dt, q); gxr::StopBrakeAngular(ring, i * dt, q, w, aw); }
        Check(std::fabs(w[2] - 2.0) < 1e-6 && aw[2] == 0, "angular state braked to the samples' rate");
        // hemisphere flip of the payload quaternion is the same rotation
        gxr::StopBrakeRing ring2;
        double w2[3] = {0, 0, 10.0}, aw2[3] = {0, 0, 0};
        for (int i = 0; i < 3; i++) { double q[4]; QuatAboutZ(2.0 * i * dt, q); if (i == 2) { for (double& c : q) c = -c; } gxr::StopBrakeAngular(ring2, i * dt, q, w2, aw2); }
        Check(std::fabs(w2[2] - 2.0) < 1e-6, "quaternion sign flip handled");
    }
    std::cout << checks - failures << '/' << checks << " checks passed\n";
    return failures == 0 ? 0 : 1;
}
