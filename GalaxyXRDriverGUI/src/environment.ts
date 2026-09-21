
export * from "./environment-gen"
import * as environment from "./environment-gen"

// the name of the driver in SteamVR
export let galaxyXRDriverName = "CustomHeadsetOpenVR"
switch(environment.vendor){
	case "galaxyxr":
		galaxyXRDriverName = "GalaxyXRNative"
		break
}

// when true copy the driver into the SteamVR folder, when false register it in place
export let driverCopyInstallationMethod = !environment.vendor
