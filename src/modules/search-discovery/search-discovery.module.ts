import { Module } from '@nestjs/common';
import { SearchDiscoveryService } from './search-discovery/search-discovery.service';

@Module({
  providers: [SearchDiscoveryService]
})
export class SearchDiscoveryModule {}
