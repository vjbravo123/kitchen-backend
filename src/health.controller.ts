import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check() {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return {
      message: 'Service healthy',
      data: {
        status: 'ok',
        database: states[this.connection.readyState] ?? 'unknown',
        uptimeSeconds: Math.round(process.uptime()),
      },
    };
  }
}
