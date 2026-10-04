#pragma once
#include <cmath>

// Controller motion (2026-10-04): what Samsung's own PC driver
// (driver_SamsungVST.dll 1.22) does with the velocities it is given. It runs
// no filter: the pose goes out with the stream's velocities and zero
// accelerations, and a linear / angular velocity whose length is not above a
// cutoff (0.05 m/s, 10 deg/s in that driver) is zeroed, so a resting hand is
// not extrapolated by sensor noise.
//
// Header-only and free of OpenVR types so tests/GameLinkLayoutPolicyTest.cpp
// runs the code the driver runs.
namespace gxr {

// a velocity whose length is not above the cutoff is reported as zero.
// returns true when it was zeroed.
inline bool GameLinkVelocityCutoff(double v[3], double cutoff){
	double len2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
	if(len2 > cutoff * cutoff){ return false; }
	v[0] = 0; v[1] = 0; v[2] = 0;
	return true;
}

// v' = q * v * q^-1, q = (w, x, y, z) unit
inline void GameLinkRotate(const double q[4], const double v[3], double out[3]){
	const double u[3] = {q[1], q[2], q[3]};
	const double c[3] = {u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]};
	const double d[3] = {u[1] * c[2] - u[2] * c[1], u[2] * c[0] - u[0] * c[2], u[0] * c[1] - u[1] * c[0]};
	for(int k = 0; k < 3; k++){ out[k] = v[k] + 2.0 * (q[0] * c[k] + d[k]); }
}

// the controller offsets move the reported origin away from the point the
// stream's velocities describe. the moved origin also rides the lever arm
// (v += w x d, d = the origin's displacement), and the controller-local
// angular velocity keeps its world rotation rate in the offset orientation.
// v is the world linear velocity, w the controller-local angular velocity.
inline void GameLinkOffsetVelocities(const double qStream[4], const double pStream[3],
		const double qOut[4], const double pOut[3], double v[3], double w[3]){
	double world[3];
	GameLinkRotate(qStream, w, world);
	const double d[3] = {pOut[0] - pStream[0], pOut[1] - pStream[1], pOut[2] - pStream[2]};
	v[0] += world[1] * d[2] - world[2] * d[1];
	v[1] += world[2] * d[0] - world[0] * d[2];
	v[2] += world[0] * d[1] - world[1] * d[0];
	const double inverse[4] = {qOut[0], -qOut[1], -qOut[2], -qOut[3]};
	GameLinkRotate(inverse, world, w);
}

// rest smoothing (2026-10-04): the stream's pose carries a small constant
// tracking noise that shows as trembling pointers. a first-order low-pass
// on the pose whose cutoff rises with the stream's own reported speed: at
// rest it is restHz (the noise is averaged), in motion it opens up within a
// fraction of a m/s or rad/s and the pose passes with no felt lag. the
// velocities are not touched. a gap or a jump restarts it on the raw pose.
struct GameLinkSmoother {
	bool have = false;
	double time = 0;
	double p[3] = {0, 0, 0};
	double q[4] = {1, 0, 0, 0};
};
// p, q (w, x, y, z): the pose, smoothed in place. v (m/s) and w (rad/s) are
// the reported velocities, only their lengths are used. restHz <= 0 = off.
inline void GameLinkSmooth(GameLinkSmoother& s, double now, double restHz,
		const double v[3], const double w[3], double p[3], double q[4]){
	const double dt = now - s.time;
	const double jump = std::sqrt((p[0] - s.p[0]) * (p[0] - s.p[0]) + (p[1] - s.p[1]) * (p[1] - s.p[1]) + (p[2] - s.p[2]) * (p[2] - s.p[2]));
	if(restHz <= 0 || !s.have || dt <= 0 || dt > 0.1 || jump > 0.3){
		s.have = restHz > 0;
		s.time = now;
		for(int k = 0; k < 3; k++){ s.p[k] = p[k]; }
		for(int k = 0; k < 4; k++){ s.q[k] = q[k]; }
		return;
	}
	const double kTwoPi = 6.283185307179586;
	const double speed = std::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
	const double spin = std::sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
	// 40 Hz per m/s, 8 Hz per rad/s: wide open by 1 m/s and by 5 rad/s
	const double aP = 1.0 - std::exp(-kTwoPi * (restHz + 40.0 * speed) * dt);
	const double aQ = 1.0 - std::exp(-kTwoPi * (restHz + 8.0 * spin) * dt);
	for(int k = 0; k < 3; k++){ s.p[k] += aP * (p[k] - s.p[k]); p[k] = s.p[k]; }
	// shortest-arc normalized lerp: the two orientations are a hair apart
	const double dot = s.q[0] * q[0] + s.q[1] * q[1] + s.q[2] * q[2] + s.q[3] * q[3];
	const double sign = dot < 0 ? -1.0 : 1.0;
	double n = 0;
	for(int k = 0; k < 4; k++){ s.q[k] += aQ * (sign * q[k] - s.q[k]); n += s.q[k] * s.q[k]; }
	n = std::sqrt(n);
	if(n < 1e-9){
		for(int k = 0; k < 4; k++){ s.q[k] = q[k]; }
	}else{
		for(int k = 0; k < 4; k++){ s.q[k] /= n; q[k] = s.q[k]; }
	}
	s.time = now;
}

} // namespace gxr
