import { Module } from '@nestjs/common';
import { BookingService } from './booking/booking.service';
import { BookingController } from './booking/booking.controller';

@Module({
  providers: [BookingService],
  controllers: [BookingController]
})
export class BookingModule {}
