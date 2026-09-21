// info.json service (driver -> GUI, read-only), ported from
// src/app/services/driver-info.service.ts.
import { signal } from '../reactive';
import { JsonSettingServiceBase } from './settings-base';
import type { DriverInfo } from '../domain/types';
import { PathsService } from './paths';
import type { AppSetting } from '../domain/types';

export class DriverInfoService extends JsonSettingServiceBase<DriverInfo> {

  constructor(paths: PathsService, appSettingGetter: () => AppSetting | undefined) {
    super(paths.infoPath, paths.appDataDirPath, () => undefined, false, true, appSettingGetter);
  }
}
