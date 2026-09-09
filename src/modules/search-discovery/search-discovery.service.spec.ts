import { Test, TestingModule } from '@nestjs/testing';
import { SearchDiscoveryService } from './search-discovery.service';

describe('SearchDiscoveryService', () => {
  let service: SearchDiscoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchDiscoveryService],
    }).compile();

    service = module.get<SearchDiscoveryService>(SearchDiscoveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
