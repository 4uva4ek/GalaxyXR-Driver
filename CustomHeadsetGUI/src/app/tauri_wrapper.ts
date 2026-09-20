import { invoke } from '@tauri-apps/api/core';
import { SteamVRSettingChange } from './services/steamvr-settings-diff';

export interface DriverUninstallReport {
    removedPaths: string[];
    restoredSettings: number;
    legacyReset: boolean;
    warnings: string[];
}
export interface IdentityCleanupReport {
    removedKeys: string[];
    removedSections: string[];
    warnings: string[];
    backupPath: string | null;
}
export async function clean_legacy_galaxyxr_identity(steamvrPath: string): Promise<IdentityCleanupReport> {
    return invoke('clean_legacy_galaxyxr_identity', { steamvrPath });
}
export async function register_galaxyxr_driver(steamvrPath: string, driverPath: string) {
    return invoke('register_galaxyxr_driver', { steamvrPath, driverPath });
}
export async function update_galaxyxr_steamvr_settings(steamvrPath: string, changes: SteamVRSettingChange[]) {
    return invoke('update_galaxyxr_steamvr_settings', { steamvrPath, changes });
}
export async function uninstall_galaxyxr_driver(steamvrPath: string): Promise<DriverUninstallReport> {
    return invoke('uninstall_galaxyxr_driver', { steamvrPath });
}

export async function get_executable_path() {
    return await invoke('get_executable_path') as string;

}
export async function is_vrmonitor_running() {
    return await invoke('is_vrmonitor_running') as boolean;
}
export async function restart_vrcompositor() {
    return await invoke('restart_vrcompositor') as boolean;
}
export async function kill_process(process_name: string): Promise<boolean> {
    return await invoke('kill_process', { processName: process_name }) as boolean;
}
export async function launch_process(path: string, args: string[]): Promise<boolean> {
    return await invoke('launch_process', { path, args }) as boolean;
}

export async function run_process_sync(path: string, args: string[]): Promise<number> {
    return await invoke('run_process_sync', { path, args }) as number;
}
