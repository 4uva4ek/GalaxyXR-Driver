#include "DistortionProfileConstructor.h"
#include "RadialBezierDistortionProfile.h"
#include <cmath>
#include <map>

std::unordered_map<std::string, DistortionProfileConfig> builtInDistortionProfiles = {};
std::unordered_map<std::string, std::string> builtInDistortionProfileAliases = {};

bool DistortionProfileConstructor::LoadDistortionProfile(std::string name){
	
	DistortionProfileConfig config = {};
	
	std::string aliasedName = name;
	if(builtInDistortionProfileAliases.find(name) != builtInDistortionProfileAliases.end()){
		aliasedName = builtInDistortionProfileAliases[name];
	}
	
	if(builtInDistortionProfiles.find(aliasedName) != builtInDistortionProfiles.end()){
		config = builtInDistortionProfiles[aliasedName];
	}
	
	if(config.name == "None"){
		DistortionProfileConfig configFromDisk = driverConfigLoader.ParseDistortionConfig(name);
		if(configFromDisk.name != "None"){
			config = configFromDisk;
		}
	}
	
	
	// check if the profile has not changed to avoid recreating it
	if(profile != nullptr && config.name == profileName && config.modifiedTime == profileModifiedTime){
		return false;
	}
	
	DistortionProfile* newProfile = nullptr;
		
	// construct RadialBezierDistortionProfile object from config
	if(config.type == "RadialBezier"){
		RadialBezierDistortionProfile* radialBezierProfile = new RadialBezierDistortionProfile();
		if(config.distortions.size() >= 2){
			radialBezierProfile->distortions.clear();
			for(int i = 0; i < config.distortions.size() / 2; i++){
				radialBezierProfile->distortions.push_back({(float)config.distortions[i * 2], (float)config.distortions[i * 2 + 1]});
			}
		}
		if(config.distortionsRed.size() >= 2){
			radialBezierProfile->distortionsRed.clear();
			for(int i = 0; i < config.distortionsRed.size() / 2; i++){
				radialBezierProfile->distortionsRed.push_back({(float)config.distortionsRed[i * 2], (float)config.distortionsRed[i * 2 + 1]});
			}
		}
		if(config.distortionsBlue.size() >= 2){
			radialBezierProfile->distortionsBlue.clear();
			for(int i = 0; i < config.distortionsBlue.size() / 2; i++){
				radialBezierProfile->distortionsBlue.push_back({(float)config.distortionsBlue[i * 2], (float)config.distortionsBlue[i * 2 + 1]});
			}
		}
		radialBezierProfile->legacySmoothing = config.legacySmoothing;
		radialBezierProfile->smoothAmount = config.smoothAmount;
		radialBezierProfile->offsetX = config.offsetX;
		radialBezierProfile->offsetY = config.offsetY;
		newProfile = radialBezierProfile;
	}
	
	bool changed = false;
	
	if(newProfile != nullptr){
		if(profile != nullptr && profile != &distortionSettings){
			delete profile;
		}
		profile = newProfile;
		ReInitializeProfile();
		changed = true;
	}
	
	// fallback to default profile if nothing was set
	if(newProfile == nullptr && profile != &distortionSettings){
		if(profile != nullptr){
			delete profile;
		}
		profile = &distortionSettings;
		changed = true;
	}
	
	profileName = config.name;
	profileModifiedTime = config.modifiedTime;
	return changed;
}

void DistortionProfileConstructor::ReInitializeProfile(){
	// copy settings to new distortion profile
	profile->resolution = distortionSettings.resolution;
	profile->resolutionX = distortionSettings.resolutionX;
	profile->resolutionY = distortionSettings.resolutionY;
	profile->maxFovX = distortionSettings.maxFovX;
	profile->maxFovY = distortionSettings.maxFovY;
	profile->fovZoom = distortionSettings.fovZoom;
	profile->flatFovZoom = distortionSettings.flatFovZoom;
	profile->fovClamping = distortionSettings.fovClamping;
	if(profile->fovZoom == 0.0f){
		// avoid division by zero in calculations because invalid distortion data can prevent the compositor from starting
		profile->fovZoom = 1.0f; 
	}
	// initialize new profile and replace old one
	profile->Initialize();
}

void DistortionProfileConstructor::GetRecommendedRenderTargetSize(uint32_t* pnWidth, uint32_t* pnHeight){
	uint32_t originalWidth = (uint32_t)distortionSettings.resolutionX;
	uint32_t originalHeight = (uint32_t)distortionSettings.resolutionY;
	uint32_t renderWidth = originalWidth;
	uint32_t renderHeight = originalHeight;
	if(profile != nullptr){
		profile->GetRecommendedRenderTargetSize(&renderWidth, &renderHeight);
	}
	// keep total number of pixels the same but change aspect ratio
	double targetPixels = originalWidth * originalHeight;
	double renderPixels = renderWidth * renderHeight;
	renderWidth = (uint32_t)(renderWidth * std::sqrt(targetPixels / renderPixels));
	renderHeight = (uint32_t)(renderHeight * std::sqrt(targetPixels / renderPixels));
	renderWidth = std::min(renderWidth, 16384u);
	renderHeight = std::min(renderHeight, 16384u);
	DriverLog("100% render target size: %d x %d", renderWidth, renderHeight);
	*pnWidth = renderWidth;
	*pnHeight = renderHeight;
}

DistortionProfileConstructor::~DistortionProfileConstructor(){
	if(profile != nullptr && profile != &distortionSettings){
		delete profile;
	}
}
