import { Module } from '@nestjs/common';
import { FacilityResourceService } from './facility-resource/facility-resource.service';
import { FacilityResourceController } from './facility-resource/facility-resource.controller';

@Module({
  providers: [FacilityResourceService],
  controllers: [FacilityResourceController]
})
export class FacilityResourceModule {}
