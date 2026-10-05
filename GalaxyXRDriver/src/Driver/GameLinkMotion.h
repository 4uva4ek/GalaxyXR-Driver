#pragma once
#include <cmath>

// Controller motion (2026-10-04): what Samsung's own PC driver
// (driver_SamsungVST.dll 1.22) does with the velocities it is given. It runs
// no filter: the pose goes out with the stream's velocities and zero
// accelerations, and a linear / angular velocity whose length is not above a
// cutoff (0.05 m/s, 10 deg/s in that driver) is zeroed, so a resting hand is
// not extrapolated by sensor noise. we keep the cutoff but not the zeroed
// accelerations: those go out as the stream has them.
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

} // namespace gxr
