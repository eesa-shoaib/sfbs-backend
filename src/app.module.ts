import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { FacilityResourceModule } from './modules/facility-resource/facility-resource.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SearchDiscoveryModule } from './modules/search-discovery/search-discovery.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [IdentityAccessModule, FacilityResourceModule, BookingModule, PaymentsModule, SearchDiscoveryModule, NotificationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
