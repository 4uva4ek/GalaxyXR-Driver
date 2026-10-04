#pragma once
#include <cmath>
#include "GameLinkMotion.h"

// Velocity only (Controller Fix Mode 7, 2026-10-04): the stream's pose and
// time stamp go out untouched, only the velocities are replaced with Kalman
// CA's estimate. The estimate's angular velocity is body-frame
// (kalmanAngularOutFrame = 1) about the estimator's orientation; the
// reported orientation is the stream's, so the vector is re-expressed in it.
//
// Header-only and free of OpenVR types.
namespace gxr {

// w is body-frame about qEst; on return it is the same world rotation rate,
// body-frame about qIn. q = (w, x, y, z) unit.
inline void VelocityOnlyRebaseAngular(const double qEst[4], const double qIn[4], double w[3]){
	double world[3];
	GameLinkRotate(qEst, w, world);
	const double qInInv[4] = {qIn[0], -qIn[1], -qIn[2], -qIn[3]};
	GameLinkRotate(qInInv, world, w);
}

}
