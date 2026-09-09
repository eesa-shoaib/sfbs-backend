import { Test, TestingModule } from '@nestjs/testing';
import { FacilityResourceController } from './facility-resource.controller';

describe('FacilityResourceController', () => {
  let controller: FacilityResourceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacilityResourceController],
    }).compile();

    controller = module.get<FacilityResourceController>(FacilityResourceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
