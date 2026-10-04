#pragma once

#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <string>

// Diagnostic capture of the streamed controller poses exactly as vrlink hands
// them to the driver, before any of the driver's own processing (2026-10-04,
// streamFrame.streamPoseTrace, settings.json only). One CSV row per pose
// callback: receipt time, device, tracking state, the stream's time offset,
// position, orientation and the stream's own linear / angular velocity.
//
// Written to answer what the headset's runtime velocity is worth: the file
// lets the velocity be compared offline against the motion of the positions
// it arrives with. The file restarts with each driver start and stops at a
// row cap so a forgotten switch cannot fill the disk.
//
// Header-only and free of OpenVR types.
namespace gxr {

inline void StreamPoseTrace(double timeSeconds, unsigned id, bool valid, int result, double timeOffset,
		const double pos[3], const double quatWxyz[4], const double vel[3], const double angVel[3]){
	static std::mutex lock;
	static FILE *file = nullptr;
	static bool opened = false;
	static unsigned rows = 0;
	const unsigned kMaxRows = 400000;
	std::lock_guard<std::mutex> guard(lock);
	if(!opened){
		opened = true;
		const char *appData = std::getenv("APPDATA");
		if(appData){
			std::string path = std::string(appData) + "\\GalaxyXR\\CustomHeadset\\stream-pose-trace.csv";
			file = std::fopen(path.c_str(), "w");
			if(file){
				std::fputs("t_s,id,valid,result,tOff_ms,px,py,pz,qw,qx,qy,qz,vx,vy,vz,wx,wy,wz\n", file);
			}
		}
	}
	if(!file || rows >= kMaxRows){ return; }
	rows++;
	std::fprintf(file, "%.6f,%u,%d,%d,%.3f,%.6f,%.6f,%.6f,%.7f,%.7f,%.7f,%.7f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f\n",
		timeSeconds, id, valid ? 1 : 0, result, timeOffset * 1000.0,
		pos[0], pos[1], pos[2], quatWxyz[0], quatWxyz[1], quatWxyz[2], quatWxyz[3],
		vel[0], vel[1], vel[2], angVel[0], angVel[1], angVel[2]);
	if(rows % 256 == 0 || rows == kMaxRows){ std::fflush(file); }
}

} // namespace gxr
