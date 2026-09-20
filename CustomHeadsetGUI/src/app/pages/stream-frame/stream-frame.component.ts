import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FieldTipComponent } from '../../utilities/field-tip/field-tip.component';
import { ResetButtonComponent } from '../../utilities/reset-button/reset-button.component';
import { StreamFrameCurveComponent } from '../../utilities/stream-frame-curve/stream-frame-curve.component';
import { DriverEnableBannerComponent } from '../../utilities/driver-enable-banner/driver-enable-banner.component';
import { SystemReadyComponent } from '../../utilities/system-ready/system-ready.component';
import { GalaxySettingsBase } from '../galaxy-settings/galaxy-settings.base';

@Component({selector:'app-stream-frame', imports:[CommonModule,FormsModule,RouterLink,MatSlideToggleModule,MatSliderModule,MatSelectModule,MatButtonModule,MatIconModule,MatInputModule,FieldTipComponent,ResetButtonComponent,StreamFrameCurveComponent,DriverEnableBannerComponent,SystemReadyComponent], templateUrl:'./stream-frame.component.html', styleUrl:'../galaxy-settings/galaxy-settings.scss'})
export class StreamFrameComponent extends GalaxySettingsBase {}
