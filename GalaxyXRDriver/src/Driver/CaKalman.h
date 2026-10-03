#pragma once

#include <cmath>

// 2026-10-03: the CA (Singer) helpers moved here verbatim from
// DeviceProvider.cpp so the estimator and the maneuver-adaptive jerk can be
// exercised offline by tests/CaKalmanTest.cpp. Behavior is unchanged.
namespace gxr {

// ---- constant-acceleration (Singer) per-axis kalman helpers ----
// state [p, v, a] with white-jerk process noise (sigmaJ, m/s^3) and an
// exponential decay of the acceleration state toward zero (beta =
// exp(-dt/tau)): pure CA at tau -> inf; the decay is what bounds phantom
// integration across dup coasts and abrupt stops. covariance layout:
// [P00 P01 P02 P11 P12 P22] (symmetric upper triangle).
inline void CaStatePredict(double dt, double tau, double &p, double &v, double &a){
	// exact Singer discretization: the acceleration decays DURING the
	// interval, so position/velocity integrate its true average
	// a * (tau/dt)(1 - e^(-dt/tau)) rather than the full initial value.
	// for dt << tau this matches the naive form; for the long-dt case
	// (a gap of missed samples resuming with a hot accel state) the
	// naive form applies the whole stale acceleration across the whole
	// gap and can overshoot position by a meter — the field-observed
	// "hand sits wrong for a moment after a throw" transient.
	if(dt <= 0){ return; }
	double e = exp(-dt / tau);
	double aAvg = a * (tau / dt) * (1.0 - e);
	p += v * dt + 0.5 * aAvg * dt * dt;
	v += aAvg * dt;
	a *= e;
}
inline void CaCovPredict(double dt, double sigmaJ, double tau, double beta, bool exactCov, double P[6]){
	double q = sigmaJ * sigmaJ;
	double dt2 = dt * dt, dt3 = dt2 * dt, dt4 = dt3 * dt, dt5 = dt4 * dt;
	double P00 = P[0], P01 = P[1], P02 = P[2], P11 = P[3], P12 = P[4], P22 = P[5];
	if(exactCov){
		// consistency pass (A/B knob kalmanCaExactCov): propagate the
		// covariance with the SAME transition CaStatePredict implements —
		// F12 = tau(1 - e^(-dt/tau)) (exact Singer velocity gain) and
		// F02 = dt*F12/2 (the implemented conservative position gain) —
		// instead of the naive dt / dt^2/2. at tau near the 20ms floor
		// with ~8-11ms dt the naive form overstates how much accel
		// uncertainty flows into v/p by up to ~25%, over-weighting
		// measurements relative to the model. Q is intentionally kept in
		// the naive white-jerk form in BOTH branches (second order in
		// dt/tau) so the A/B isolates the transition alone.
		double gv = tau * (1.0 - beta);
		double gp = 0.5 * dt * gv;
		double A0 = P00 + dt * P01 + gp * P02;
		double A1 = P01 + dt * P11 + gp * P12;
		double A2 = P02 + dt * P12 + gp * P22;
		double B1 = P11 + gv * P12;
		double B2 = P12 + gv * P22;
		P[0] = A0 + dt * A1 + gp * A2 + q * dt5 / 20.0;
		P[1] = A1 + gv * A2 + q * dt4 / 8.0;
		P[2] = beta * A2 + q * dt3 / 6.0;
		P[3] = B1 + gv * B2 + q * dt3 / 3.0;
		P[4] = beta * B2 + q * dt2 / 2.0;
		P[5] = beta * beta * P22 + q * dt;
		return;
	}
	double h = 0.5 * dt2;
	P[0] = P00 + 2.0 * dt * P01 + 2.0 * h * P02 + dt2 * P11 + 2.0 * dt * h * P12 + h * h * P22 + q * dt5 / 20.0;
	P[1] = P01 + dt * P11 + h * P12 + dt * P02 + dt2 * P12 + dt * h * P22 + q * dt4 / 8.0;
	P[2] = beta * (P02 + dt * P12 + h * P22) + q * dt3 / 6.0;
	P[3] = P11 + 2.0 * dt * P12 + dt2 * P22 + q * dt3 / 3.0;
	P[4] = beta * (P12 + dt * P22) + q * dt2 / 2.0;
	P[5] = beta * beta * P22 + q * dt;
}
// scalar position-measurement update; y is the innovation. returns this
// axis' normalized innovation squared contribution (NIS telemetry). for
// the angular MEKF the "p" slot is a zero-seeded error scratch whose
// post-update value IS the orientation correction (K0 * residual).
inline double CaUpdate(double y, double R, double &p, double &v, double &a, double P[6]){
	double S = P[0] + R;
	double K0 = P[0] / S, K1 = P[1] / S, K2 = P[2] / S;
	p += K0 * y; v += K1 * y; a += K2 * y;
	double P00 = P[0], P01 = P[1], P02 = P[2];
	P[0] = (1.0 - K0) * P00; P[1] = (1.0 - K0) * P01; P[2] = (1.0 - K0) * P02;
	P[3] = P[3] - K1 * P01; P[4] = P[4] - K1 * P02; P[5] = P[5] - K2 * P02;
	return y * y / S;
}
inline void CaInit(double P[6], double p0Var, double v0Var, double a0Var){
	P[0] = p0Var; P[1] = 0; P[2] = 0; P[3] = v0Var; P[4] = 0; P[5] = a0Var;
}

// ---- maneuver-adaptive jerk (2026-10-03) ----
// field complaint: fast throws and wrist flicks overshoot the stop point
// and then snap back ("rubber band"). cause: at the ratified J=4 the
// linear CA channel is a smooth CV with ~60ms velocity lag (see
// kalmanCaJerk in Config.h); on an abrupt stop the state keeps its
// momentum past the hand, and vrserver's photon prediction extrapolates
// that stale velocity further. offline (tests/CaKalmanTest.cpp) a 5 m/s
// throw stopping in 70ms overshoots ~6cm in the state and ~16cm rendered.
//
// a uniformly higher J removes the overshoot but loses the calm J=4 was
// ratified for. instead J is raised only while the measurements prove a
// maneuver: consecutive FRESH samples whose innovation is both large
// (3-axis NIS above threshold) and pointing the same way. sensor noise
// is large rarely and alternates direction; a stop or turn the model did
// not predict produces a run of same-direction innovations. the boost
// follows NIS/threshold, is capped, and relaxes back to 1 with a time
// constant once the evidence stops.
//
// the threshold is relative to a learned noise floor: a slow average of
// the per-axis NIS over samples that show no maneuver evidence. when the
// tracker is noisier than kalmanCaPosNoiseMm says, rest NIS sits above 1
// and an absolute threshold would boost J at rest (offline: 2.5x noise ->
// boosted 73% of the time, +49% rest jitter). the floor never drops
// below 1, so a correctly configured P behaves exactly as without it.
//
// lesson from kalmanAdaptiveR (retired 2026-08-16): trust raised during a
// maneuver must never reach stale vrlink repeats. the caller therefore
// feeds and applies this ONLY on fresh positional samples (no dup/repeat,
// no 3dof position freeze, position actually changed); repeats keep the
// base J.
struct AdaptiveJerkParams {
	double maxBoost = 25.0;      // cap on the J multiplier (1 = off)
	double nisThreshold = 6.0;   // 3-axis NIS that counts as maneuver evidence
	double releaseSec = 0.06;    // relax time constant of the boost
	int needHits = 2;            // consecutive same-direction hits to engage
	double floorSec = 1.0;       // noise-floor learning time constant
	double floorMax = 25.0;      // cap: tracker at most 5x noisier than P
};

struct AdaptiveJerkState {
	double boost = 1.0;
	int hits = 0;
	double lastY[3] = {0, 0, 0};
	double lastT = 0;
	bool haveT = false;
	// learned per-axis NIS noise floor (>= 1); a tracker property, so it
	// survives Reset() (filter reinit / reacquire)
	double noiseFloor = 1.0;
	void Reset(){
		boost = 1.0;
		hits = 0;
		lastY[0] = 0; lastY[1] = 0; lastY[2] = 0;
		lastT = 0;
		haveT = false;
	}
};

// observe the innovation y = z - p_pred of one fresh sample at device
// time t; S is the per-axis innovation variance (predicted P00 + R).
// updates the multiplier the NEXT fresh prediction should apply to J.
inline void AdaptiveJerkObserve(AdaptiveJerkState &s, const AdaptiveJerkParams &prm,
		double t, const double y[3], const double S[3]){
	double maxBoost = prm.maxBoost < 1.0 ? 1.0 : prm.maxBoost;
	double thr = prm.nisThreshold < 0.5 ? 0.5 : prm.nisThreshold;
	double rel = prm.releaseSec < 0.005 ? 0.005 : prm.releaseSec;
	if(s.haveT){
		double dtObs = t - s.lastT;
		if(dtObs > 0){
			s.boost = 1.0 + (s.boost - 1.0) * exp(-dtObs / rel);
		}
	}
	double nisRaw = 0;
	for(int a = 0; a < 3; a++){
		if(S[a] > 0){ nisRaw += y[a] * y[a] / S[a]; }
	}
	// learn the floor from every fresh sample, input clipped at twice the
	// current floor: a maneuver (huge NIS for ~100-300ms) can only nudge
	// it, while a consistently noisier tracker walks it up to its level.
	// (gating the update on "no maneuver evidence" deadlocks: a noisy
	// tracker always shows evidence against a floor of 1.)
	if(s.haveT){
		double dtObs = t - s.lastT;
		double fs = prm.floorSec < 0.05 ? 0.05 : prm.floorSec;
		if(dtObs > 0){
			double perAxis = nisRaw / 3.0;
			double clip = 2.0 * s.noiseFloor;
			if(perAxis > clip){ perAxis = clip; }
			s.noiseFloor += (1.0 - exp(-dtObs / fs)) * (perAxis - s.noiseFloor);
		}
	}
	double floorMax = prm.floorMax < 1.0 ? 1.0 : prm.floorMax;
	if(s.noiseFloor > floorMax){ s.noiseFloor = floorMax; }
	if(!(s.noiseFloor >= 1.0)){ s.noiseFloor = 1.0; }
	double nis = nisRaw / s.noiseFloor;
	bool sameDir = y[0] * s.lastY[0] + y[1] * s.lastY[1] + y[2] * s.lastY[2] > 0;
	if(nis > thr){
		s.hits = (s.hits > 0 && sameDir) ? s.hits + 1 : 1;
	}else{
		s.hits = 0;
	}
	if(s.hits >= prm.needHits){
		double target = nis / thr;
		if(target > maxBoost){ target = maxBoost; }
		if(target > s.boost){ s.boost = target; }
	}
	if(s.boost > maxBoost){ s.boost = maxBoost; }
	if(!(s.boost >= 1.0)){ s.boost = 1.0; }
	for(int a = 0; a < 3; a++){ s.lastY[a] = y[a]; }
	s.lastT = t;
	s.haveT = true;
}

} // namespace gxr
