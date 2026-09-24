// Compile and exercise extracted production controller math/output blocks.
// Run from an x64 MSVC developer shell: node tools/Test-ControllerMotion.cjs
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'GalaxyXRDriver/src/Driver/DeviceProvider.cpp'), 'utf8');
const header = fs.readFileSync(path.join(root, 'GalaxyXRDriver/src/Driver/DeviceProvider.h'), 'utf8');
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Production extraction boundary missing: ' + start);
  return text.slice(a, b);
}
const math = between(source, 'static vr::HmdQuaternion_t QuatMultiply', 'int GalaxyXRDeviceProvider::GetDeviceClass')
  + between(source, 'static void SmoothReportedRotation', 'bool GalaxyXRDeviceProvider::HandleDevicePoseUpdated');
const state = between(header, '\tstruct KalState {', '\t\tbool have = false;') + '\n};';
const output = between(source, '// User-selected 30ms positional low-pass', '\t\t\t// Epoch contract:');
const nativeGuard = between(source, 'bool GalaxyXRDeviceProvider::HandleDevicePoseUpdated', '\t// raw tracking status');
if (!nativeGuard.includes('IsNativeHand(openVRID)') || !nativeGuard.includes('return true;')) throw new Error('Native hand bypass missing');
const cpp = String.raw`
#include <openvr_driver.h>
#include <cmath>
#include <cassert>
#include <limits>
#include <iostream>
MATH
STATE
struct { struct { bool kalmanCaReportAccel=false; double kalmanSmoothLagMs=0; int kalmanAngularOutFrame=0; } streamFrame; } driverConfig;
void Output(KalState& ks, vr::DriverPose_t& pose, double now, bool caFull=true) {
OUTPUT
}
int main() {
  const vr::HmdQuaternion_t identity{1,0,0,0};
  vr::HmdQuaternion_t q; double w[3];
  SmoothReportedRotation(identity, {-1,0,0,0}, .01, q, w);
  assert(std::abs(q.w-1)<1e-12 && w[0]==0 && w[1]==0 && w[2]==0);
  const double angle=.8, dt=.01, alpha=1-std::exp(-dt/.030);
  SmoothReportedRotation(identity, {std::cos(angle/2),0,0,std::sin(angle/2)}, dt,q,w);
  assert(std::abs(2*std::atan2(q.z,q.w)-angle*alpha)<1e-12);
  assert(std::abs(w[2]-angle*alpha/dt)<1e-12);
  assert(std::abs(q.w*q.w+q.z*q.z-1)<1e-12);
  double m[3]={.01,0,0}, prev[3]={}, p[3]={.03,0,0}, v[3]={1,0,0}, a[3]={};
  auto target=[&](double delta,double span){return CaBrakeTarget(delta,.02,.0015,span,m,prev,p,v,a);};
  assert(target(.003,.014)>0 && target(.003,.014)<=1);
  assert(target(0,.014)==0 && target(.3,.014)==0);
  assert(target(.003,.001)==0 && target(.003,.1)==0);
  v[0]=.1; assert(target(.003,.014)==0);
  v[0]=1; m[0]=.014; assert(target(.003,.014)==0);
  m[0]=0; assert(target(.003,.014)==0);
  m[0]=.01; p[0]=-.03; assert(target(.003,.014)==0);
  p[0]=std::numeric_limits<double>::quiet_NaN(); assert(target(.003,.014)==0);
  double pos=1,vel=2,acc=3;
  CaBrakePredict(.003,0,pos,vel,acc); assert(pos==1 && vel==2 && acc==3);
  CaBrakePredict(.003,1,pos,vel,acc); assert(pos<1 && pos>.994 && vel>0 && vel<2 && acc>0 && acc<3);
  KalState ks; vr::DriverPose_t pose{}; pose.qRotation=identity;
  Output(ks,pose,1); assert(ks.positionSmoothHave && ks.rotationSmoothHave);
  pose.vecPosition[0]=1; pose.qRotation={std::cos(angle/2),0,0,std::sin(angle/2)};
  Output(ks,pose,1.01);
  assert(std::abs(pose.vecPosition[0]-alpha)<1e-12);
  assert(std::abs(pose.vecVelocity[0]-alpha/dt)<1e-10);
  assert(pose.vecAcceleration[0]==0 && pose.vecAngularAcceleration[2]==0);
  // Long callback gaps initialize at the new pose, never interpolate stale state.
  pose.vecPosition[0]=3; pose.qRotation=identity; Output(ks,pose,1.2);
  assert(pose.vecPosition[0]==3 && pose.vecVelocity[0]==0 && pose.vecAngularVelocity[2]==0);
  // Existing acceleration, RTS and non-CA paths must keep their outputs.
  for(int mode=0;mode<3;++mode) {
    driverConfig.streamFrame.kalmanCaReportAccel=mode==0;
    driverConfig.streamFrame.kalmanSmoothLagMs=mode==1 ? 10 : 0;
    pose.vecPosition[0]=5; pose.vecVelocity[0]=7; pose.vecAngularVelocity[2]=9;
    Output(ks,pose,1.21,mode!=2);
    assert(pose.vecPosition[0]==5 && pose.vecVelocity[0]==7 && pose.vecAngularVelocity[2]==9);
    assert(!ks.positionSmoothHave && !ks.rotationSmoothHave);
  }
  driverConfig.streamFrame.kalmanCaReportAccel=false;
  driverConfig.streamFrame.kalmanSmoothLagMs=0;
  KalState base; pose={}; pose.qRotation=identity; Output(base,pose,2);
  auto braking=base; braking.angularBrakeFresh=2.01; braking.angularBrakeStrength=1;
  auto plainPose=pose, brakePose=pose;
  plainPose.qRotation=brakePose.qRotation={std::cos(angle/2),0,0,std::sin(angle/2)};
  Output(base,plainPose,2.01); Output(braking,brakePose,2.01);
  assert(std::abs(brakePose.vecAngularVelocity[2]/plainPose.vecAngularVelocity[2]-.7)<1e-12);
  assert(brakePose.qRotation.w==plainPose.qRotation.w && brakePose.qRotation.z==plainPose.qRotation.z);
  driverConfig.streamFrame.kalmanAngularOutFrame=2;
  Output(braking,brakePose,2.02); assert(brakePose.vecAngularVelocity[2]==0);
  std::cout << "PASS: rotation shortest arc/unit norm, 30ms position/velocity, gap reset, mode exclusions, braking guards/bounds, prediction limit, zero angular output\n";
}
`.replace('MATH',math).replace('STATE',state).replace('OUTPUT',output);
const out=path.join(root,'build','controller-motion-test'); fs.mkdirSync(out,{recursive:true});
const file=path.join(out,'ControllerMotionTest.cpp'), exe=path.join(out,'ControllerMotionTest.exe');
fs.writeFileSync(file,cpp);
const build=cp.spawnSync('cl.exe',['/nologo','/EHsc','/std:c++17','/MT','/I'+path.join(root,'ThirdParty/openvr/headers'),file,'/Fe:'+exe,'/Fo:'+path.join(out,'ControllerMotionTest.obj')],{stdio:'inherit',cwd:out});
if(build.error) throw build.error; if(build.status) process.exit(build.status);
const run=cp.spawnSync(exe,[],{stdio:'inherit'}); if(run.error) throw run.error; process.exit(run.status);
