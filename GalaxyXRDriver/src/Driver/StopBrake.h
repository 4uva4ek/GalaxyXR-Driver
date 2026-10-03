#pragma once

#include <cmath>

// Stop brake for the Kalman CA controller mode (2026-10-04).
//
// Field complaint: the hand overshoots a stop and comes back ("rubber
// band"), and a wrist twist over-rotates and returns. At the ratified J=4
// the CA filter is a smooth constant-velocity tracker whose velocity lags a
// stop by ~60ms, so its position state coasts past the hand; its own
// acceleration state is near zero and cannot tell it is braking.
//
// The tracker's fresh samples can: when the speed they show along the
// filter's velocity (secant over the last two fresh intervals) is below the
// filter's, the filter's velocity is cut down to it. Only ever down, and
// only along the direction the filter already moves in, so steady and
// accelerating motion (where the filter lags behind the samples) is left
// exactly as it was. Offline on three headset recordings this made the
// rendered motion calmer than the plain filter, not rougher, and cut the
// stop overshoot from 75 to 42mm (1.5 m/s stop, 40ms runtime horizon).
//
// What was tried and dropped: raising the jerk on maneuver evidence
// (removed a quarter of the overshoot, nothing on the wrist), and running
// the reported velocity ahead of the detected deceleration (less overshoot,
// but visibly rougher motion on the real recordings).
//
// Header-only and free of OpenVR types so tests/StopBrakeTest.cpp runs the
// code the driver runs.
namespace gxr {

// the last three FRESH samples of one channel (position: x,y,z; orientation:
// quaternion w,x,y,z)
struct StopBrakeRing {
	double t[3] = {0, 0, 0};
	double x[3][4] = {};
	int n = 0;
	void Reset(){ n = 0; }
	// newest at index 0. a gap restarts the ring: a secant across missing
	// samples says nothing about the speed now.
	void Push(double time, const double *value, int dim){
		if(n > 0 && !(time - t[0] > 0.002 && time - t[0] < 0.06)){ n = 0; }
		for(int i = 2; i > 0; i--){
			t[i] = t[i - 1];
			for(int k = 0; k < 4; k++){ x[i][k] = x[i - 1][k]; }
		}
		t[0] = time;
		for(int k = 0; k < 4; k++){ x[0][k] = k < dim ? value[k] : 0.0; }
		if(n < 3){ n++; }
	}
	bool Ready() const { return n == 3 && t[0] - t[2] > 0.004; }
};

// cut v down to `speed` along its own direction (never up, never reversed)
// and drop the part of the acceleration that still pushes forward. returns
// the speed taken off.
inline double StopBrakeClamp(double v[3], double a[3], double speed){
	double vm = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
	if(!(vm > 1e-9) || !std::isfinite(speed)){ return 0.0; }
	if(speed < 0){ speed = 0; }
	if(speed >= vm){ return 0.0; }
	double h[3] = {v[0] / vm, v[1] / vm, v[2] / vm};
	for(int k = 0; k < 3; k++){ v[k] = h[k] * speed; }
	double ap = a[0] * h[0] + a[1] * h[1] + a[2] * h[2];
	if(ap > 0){ for(int k = 0; k < 3; k++){ a[k] -= ap * h[k]; } }
	return vm - speed;
}

// fresh position sample at device time t: brake the linear state (v, a)
inline double StopBrakeLinear(StopBrakeRing &ring, double t, const double pos[3], double v[3], double a[3]){
	ring.Push(t, pos, 3);
	if(!ring.Ready()){ return 0.0; }
	double vm = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
	if(!(vm > 1e-9)){ return 0.0; }
	double dt = ring.t[0] - ring.t[2];
	double along = 0;
	for(int k = 0; k < 3; k++){ along += (ring.x[0][k] - ring.x[2][k]) / dt * v[k] / vm; }
	return StopBrakeClamp(v, a, along);
}

// fresh orientation sample (unit quaternion w,x,y,z): brake the angular
// state (w, angular acceleration), world frame
inline double StopBrakeAngular(StopBrakeRing &ring, double t, const double q[4], double w[3], double aw[3]){
	ring.Push(t, q, 4);
	if(!ring.Ready()){ return 0.0; }
	double wm = std::sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
	if(!(wm > 1e-9)){ return 0.0; }
	// d = q_new * conj(q_old), rotation vector of the shortest rotation
	const double *n = ring.x[0], *o = ring.x[2];
	double dw = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] + n[3] * o[3];
	double dx = -n[0] * o[1] + n[1] * o[0] - n[2] * o[3] + n[3] * o[2];
	double dy = -n[0] * o[2] + n[1] * o[3] + n[2] * o[0] - n[3] * o[1];
	double dz = -n[0] * o[3] - n[1] * o[2] + n[2] * o[1] + n[3] * o[0];
	if(dw < 0){ dw = -dw; dx = -dx; dy = -dy; dz = -dz; }
	double s = std::sqrt(dx * dx + dy * dy + dz * dz);
	double k = s > 1e-12 ? 2.0 * std::atan2(s, dw) / s : 2.0;
	double dt = ring.t[0] - ring.t[2];
	double along = (dx * w[0] + dy * w[1] + dz * w[2]) * k / (dt * wm);
	return StopBrakeClamp(w, aw, along);
}

} // namespace gxr
