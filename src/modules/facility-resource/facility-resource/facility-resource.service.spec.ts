import { Test, TestingModule } from '@nestjs/testing';
import { FacilityResourceService } from './facility-resource.service';

describe('FacilityResourceService', () => {
  let service: FacilityResourceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FacilityResourceService],
    }).compile();

    service = module.get<FacilityResourceService>(FacilityResourceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
